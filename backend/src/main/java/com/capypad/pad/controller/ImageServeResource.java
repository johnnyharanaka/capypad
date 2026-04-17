package com.capypad.pad.controller;

import com.capypad.pad.model.PadImage;
import com.capypad.pad.service.ImageStorageService;
import jakarta.annotation.security.RolesAllowed;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;
import jakarta.ws.rs.DELETE;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.HeaderParam;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.core.Response;

import java.io.File;
import java.util.regex.Pattern;

@Path("/api/images")
public class ImageServeResource {

    private static final String IMMUTABLE_CACHE_CONTROL = "public, max-age=31536000, immutable";
    private static final Pattern UUID_PATTERN = Pattern.compile(
            "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"
    );

    @Inject
    ImageStorageService storage;

    @GET
    @Path("/{imageId}")
    public Response serve(
            @PathParam("imageId") String imageId,
            @HeaderParam("If-None-Match") String ifNoneMatch) {
        if (imageId == null || !UUID_PATTERN.matcher(imageId).matches()) {
            return Response.status(400).build();
        }
        PadImage record = PadImage.findByImageId(imageId);
        if (record == null) {
            return Response.status(404).build();
        }
        String etag = "\"" + imageId + "\"";
        if (etag.equals(ifNoneMatch)) {
            return Response.notModified()
                    .tag(etag)
                    .header("Cache-Control", IMMUTABLE_CACHE_CONTROL)
                    .build();
        }
        File file = storage.resolveForRecord(record).toFile();
        if (!file.exists()) {
            return Response.status(404).build();
        }
        return Response.ok(file, record.contentType)
                .header("Cache-Control", IMMUTABLE_CACHE_CONTROL)
                .header("ETag", etag)
                .build();
    }

    @DELETE
    @Path("/{imageId}")
    @Transactional
    @RolesAllowed({"USER", "ADMIN"})
    public Response delete(@PathParam("imageId") String imageId) {
        if (imageId == null || !UUID_PATTERN.matcher(imageId).matches()) {
            return Response.status(400).build();
        }
        PadImage record = PadImage.findByImageId(imageId);
        if (record == null) {
            return Response.status(404).build();
        }
        storage.deleteForRecord(record);
        record.delete();
        return Response.noContent().build();
    }
}
