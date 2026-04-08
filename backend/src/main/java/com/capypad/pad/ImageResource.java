package com.capypad.pad;

import jakarta.inject.Inject;
import jakarta.transaction.Transactional;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import org.jboss.resteasy.reactive.multipart.FileUpload;
import org.jboss.resteasy.reactive.RestForm;

import java.io.IOException;
import java.nio.file.Files;
import java.util.UUID;

@Path("/api/pad")
public class ImageResource {

    @Inject
    ImageStorageService storage;

    @Inject
    UploadLimitService uploadLimitService;

    @POST
    @Path("/{padPath}/images")
    @Consumes(MediaType.MULTIPART_FORM_DATA)
    @Produces(MediaType.APPLICATION_JSON)
    @Transactional
    public Response upload(@PathParam("padPath") String padPath, @RestForm("file") FileUpload file) throws IOException {
        if (file == null || file.filePath() == null) {
            return Response.status(400).entity("No file provided").build();
        }

        String contentType = file.contentType();
        if (contentType == null || !contentType.startsWith("image/")) {
            return Response.status(400).entity("Only image files are allowed").build();
        }

        long fileSize = Files.size(file.filePath());
        if (fileSize > 10 * 1024 * 1024) {
            return Response.status(413).entity("File too large. Max 10MB.").build();
        }

        String normalized = padPath.toLowerCase();
        UploadLimitStatus limitStatus = uploadLimitService.evaluateBeforeUpload(normalized, fileSize);
        if (limitStatus.uploadBlocked()) {
            int statusCode = "Image limit reached for this pad".equals(limitStatus.uploadBlockReason()) ? 429 : 413;
            return Response.status(statusCode).entity(limitStatus.uploadBlockReason()).build();
        }

        String imageId = UUID.randomUUID().toString();

        storage.store(imageId, Files.newInputStream(file.filePath()));

        PadImage record = new PadImage();
        record.imageId = imageId;
        record.padPath = normalized;
        record.contentType = contentType;
        record.filename = file.fileName();
        record.fileSizeBytes = fileSize;
        record.persist();

        UploadLimitStatus updated = uploadLimitService.currentStatus(normalized);

        return Response.status(201).entity(new ImageDto(
                imageId,
                "/api/images/" + imageId,
                updated.imageCount(),
                updated.imageCountLimit(),
                updated.totalImageBytes(),
                updated.totalImageBytesLimit()
        )).build();
    }
}
