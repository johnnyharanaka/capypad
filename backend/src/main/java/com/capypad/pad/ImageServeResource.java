package com.capypad.pad;

import jakarta.inject.Inject;
import jakarta.transaction.Transactional;
import jakarta.ws.rs.DELETE;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.core.Response;

import java.io.File;

@Path("/api/images")
public class ImageServeResource {

    @Inject
    ImageStorageService storage;

    @GET
    @Path("/{imageId}")
    public Response serve(@PathParam("imageId") String imageId) {
        PadImage record = PadImage.findByImageId(imageId);
        if (record == null) {
            return Response.status(404).build();
        }
        File file = storage.resolve(imageId).toFile();
        if (!file.exists()) {
            return Response.status(404).build();
        }
        return Response.ok(file, record.contentType).build();
    }

    @DELETE
    @Path("/{imageId}")
    @Transactional
    public Response delete(@PathParam("imageId") String imageId) {
        PadImage record = PadImage.findByImageId(imageId);
        if (record == null) {
            return Response.status(404).build();
        }
        storage.delete(imageId);
        record.delete();
        return Response.noContent().build();
    }
}
