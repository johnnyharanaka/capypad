package com.capypad.pad.controller;

import com.capypad.pad.dto.ImageDto;
import com.capypad.pad.dto.UploadLimitStatus;
import com.capypad.pad.model.PadImage;
import com.capypad.pad.model.SiteSettings;
import com.capypad.pad.service.ImageStorageService;
import com.capypad.pad.service.SiteSettingsService;
import com.capypad.pad.service.UploadLimitService;
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
import java.io.InputStream;
import java.nio.file.Files;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;

@Path("/api/pad")
public class ImageResource {

    private static final Set<String> ALLOWED_CONTENT_TYPES = Set.of(
            "image/jpeg",
            "image/png",
            "image/gif",
            "image/webp"
    );

    private static final Pattern VALID_PAD_PATH = Pattern.compile("^[a-z0-9][a-z0-9._-]{0,99}$");

    // File signature (magic bytes) constants
    private static final byte[] JPEG_MAGIC = {(byte) 0xFF, (byte) 0xD8, (byte) 0xFF};
    private static final byte[] PNG_MAGIC  = {(byte) 0x89, 0x50, 0x4E, 0x47};
    private static final byte[] GIF87      = {0x47, 0x49, 0x46, 0x38, 0x37, 0x61};
    private static final byte[] GIF89      = {0x47, 0x49, 0x46, 0x38, 0x39, 0x61};
    private static final byte[] RIFF_MAGIC = {0x52, 0x49, 0x46, 0x46};
    private static final byte[] WEBP_SIG   = {0x57, 0x45, 0x42, 0x50};

    @ConfigProperty(name = "capypad.image.max-total-disk-bytes", defaultValue = "5368709120")
    long maxTotalDiskBytes;

    @Inject
    ImageStorageService storage;

    @Inject
    UploadLimitService uploadLimitService;

    @Inject
    SiteSettingsService siteSettingsService;

    @POST
    @Path("/{padPath}/images")
    @Consumes(MediaType.MULTIPART_FORM_DATA)
    @Produces(MediaType.APPLICATION_JSON)
    @Transactional
    @RolesAllowed({"USER", "ADMIN"})
    public Response upload(@PathParam("padPath") String padPath, @RestForm("file") FileUpload file) throws IOException {
        SiteSettings settings = siteSettingsService.get();
        if (settings.blockFiles) {
            return Response.status(Response.Status.FORBIDDEN)
                    .entity("Upload de arquivos está desabilitado.").build();
        }
        if (settings.maintenanceMode) {
            return Response.status(Response.Status.SERVICE_UNAVAILABLE)
                    .entity("O site está em modo de manutenção.").build();
        }

        String normalizedPad = padPath.toLowerCase();
        if (!VALID_PAD_PATH.matcher(normalizedPad).matches() || normalizedPad.contains("..")) {
            return Response.status(400).entity("Invalid pad path").build();
        }

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

        // Validate file magic bytes match declared Content-Type
        if (!isValidMagicBytes(file.filePath(), contentType)) {
            return Response.status(400).entity("File content does not match its declared type").build();
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

    private boolean isValidMagicBytes(java.nio.file.Path filePath, String contentType) throws IOException {
        byte[] header = new byte[12];
        int read;
        try (InputStream is = Files.newInputStream(filePath)) {
            read = is.read(header);
        }
        if (read < 4) return false;

        return switch (contentType.toLowerCase()) {
            case "image/jpeg" -> startsWith(header, JPEG_MAGIC);
            case "image/png"  -> startsWith(header, PNG_MAGIC);
            case "image/gif"  -> startsWith(header, GIF87) || startsWith(header, GIF89);
            case "image/webp" -> read >= 12
                    && startsWith(header, RIFF_MAGIC)
                    && header[8] == WEBP_SIG[0] && header[9] == WEBP_SIG[1]
                    && header[10] == WEBP_SIG[2] && header[11] == WEBP_SIG[3];
            default -> false;
        };
    }

    private static boolean startsWith(byte[] data, byte[] prefix) {
        if (data.length < prefix.length) return false;
        for (int i = 0; i < prefix.length; i++) {
            if (data[i] != prefix[i]) return false;
        }
        return true;
    }
}
