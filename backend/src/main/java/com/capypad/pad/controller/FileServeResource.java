package com.capypad.pad.controller;

import com.capypad.pad.model.PadFile;
import com.capypad.pad.service.FileStorageService;
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

@Path("/api/files")
public class FileServeResource {

    private static final String IMMUTABLE_CACHE_CONTROL = "public, max-age=31536000, immutable";
    private static final Pattern UUID_PATTERN = Pattern.compile(
            "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"
    );

    @Inject
    FileStorageService storage;

    @GET
    @Path("/{fileId}")
    public Response serve(
            @PathParam("fileId") String fileId,
            @HeaderParam("If-None-Match") String ifNoneMatch) {
        if (fileId == null || !UUID_PATTERN.matcher(fileId).matches()) {
            return Response.status(400).build();
        }
        PadFile record = PadFile.findByFileId(fileId);
        if (record == null) {
            return Response.status(404).build();
        }
        String etag = "\"" + fileId + "\"";
        if (etag.equals(ifNoneMatch)) {
            return Response.notModified()
                    .tag(etag)
                    .header("Cache-Control", IMMUTABLE_CACHE_CONTROL)
                    .header("Vary", "Origin")
                    .build();
        }
        File file = storage.resolveForRecord(record).toFile();
        if (!file.exists()) {
            return Response.status(404).build();
        }

        // Unlike images, generic files should usually be downloaded or opened externally depending on browser
        // For security, adding content-disposition to force download can be safe,
        // but let's just let the browser handle it based on content type.
        return Response.ok(file, record.contentType)
                .header("Cache-Control", IMMUTABLE_CACHE_CONTROL)
                .header("ETag", etag)
                .header("Vary", "Origin")
                .header("Content-Disposition", "attachment; filename=\"" + record.filename + "\"")
                .build();
    }

    @DELETE
    @Path("/{fileId}")
    @Transactional
    @RolesAllowed({"USER", "ADMIN"})
    public Response delete(@PathParam("fileId") String fileId) {
        if (fileId == null || !UUID_PATTERN.matcher(fileId).matches()) {
            return Response.status(400).build();
        }
        PadFile record = PadFile.findByFileId(fileId);
        if (record == null) {
            return Response.status(404).build();
        }
        storage.deleteForRecord(record);
        record.delete();
        return Response.noContent().build();
    }
}
