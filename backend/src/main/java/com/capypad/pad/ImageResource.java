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
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.jboss.resteasy.reactive.multipart.FileUpload;
import org.jboss.resteasy.reactive.RestForm;

import jakarta.annotation.security.RolesAllowed;
import java.io.IOException;
import java.nio.file.Files;
import java.util.Set;
import java.util.UUID;

@Path("/api/pad")
public class ImageResource {

    private static final Set<String> ALLOWED_CONTENT_TYPES = Set.of(
            "image/jpeg",
            "image/png",
            "image/gif",
            "image/webp"
    );

    @ConfigProperty(name = "capypad.image.max-total-disk-bytes", defaultValue = "5368709120")
    long maxTotalDiskBytes;

    @Inject
    ImageStorageService storage;

    @Inject
    UploadLimitService uploadLimitService;

    @POST
    @Path("/{padPath}/images")
    @Consumes(MediaType.MULTIPART_FORM_DATA)
    @Produces(MediaType.APPLICATION_JSON)
    @Transactional
    @RolesAllowed({"USER", "ADMIN"})
    public Response upload(@PathParam("padPath") String padPath, @RestForm("file") FileUpload file) throws IOException {
        if (file == null || file.filePath() == null) {
            return Response.status(400).entity("No file provided").build();
        }

        String contentType = file.contentType();
        if (contentType == null || !ALLOWED_CONTENT_TYPES.contains(contentType.toLowerCase())) {
            return Response.status(400).entity("Only JPEG, PNG, GIF, or WebP images are allowed").build();
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

        String contentHash = storage.hashFile(file.filePath());
        boolean isDedup = PadImage.count("contentHash", contentHash) > 0;

        if (!isDedup) {
            long currentDiskBytes = storage.totalBytesOnDisk();
            if (currentDiskBytes + fileSize > maxTotalDiskBytes) {
                return Response.status(507)
                        .entity("Server storage is full. Try again later.")
                        .build();
            }
            storage.storeByHash(contentHash, file.filePath());
        }

        String imageId = UUID.randomUUID().toString();
        PadImage record = new PadImage();
        record.imageId = imageId;
        record.padPath = normalized;
        record.contentType = contentType;
        record.filename = file.fileName();
        record.fileSizeBytes = fileSize;
        record.contentHash = contentHash;
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
