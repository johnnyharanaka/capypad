package com.capypad.pad.controller;

import com.capypad.pad.model.PadFile;
import com.capypad.pad.model.SiteSettings;
import com.capypad.pad.service.FileStorageService;
import com.capypad.pad.service.SiteSettingsService;
import jakarta.annotation.security.RolesAllowed;
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
import org.jboss.resteasy.reactive.RestForm;
import org.jboss.resteasy.reactive.multipart.FileUpload;

import java.io.IOException;
import java.nio.file.Files;
import java.util.UUID;
import java.util.regex.Pattern;

@Path("/api/pad")
public class FileResource {

    private static final Pattern VALID_PAD_PATH = Pattern.compile("^[a-z0-9][a-z0-9._-]{0,99}$");



    @ConfigProperty(name = "capypad.file.max-total-disk-bytes", defaultValue = "5368709120")
    long maxTotalDiskBytes; // 5GB default

    @Inject
    FileStorageService storage;

    @Inject
    SiteSettingsService siteSettingsService;

    @POST
    @Path("/{padPath}/files")
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

        long fileSize = Files.size(file.filePath());
        if (fileSize > settings.maxFileBytes) {
            return Response.status(413).entity("File too large. Max allowed is " + (settings.maxFileBytes / 1024 / 1024) + "MB.").build();
        }

        // Check if we hit limit (could use a dedicated FileUploadLimitService later, for now just disk limits)
        long currentDiskBytes = storage.totalBytesOnDisk();
        if (currentDiskBytes + fileSize > maxTotalDiskBytes) {
             return Response.status(507)
                    .entity("Server storage is full. Try again later.")
                    .build();
        }

        String contentHash = storage.hashFile(file.filePath());
        boolean isDedup = PadFile.count("contentHash", contentHash) > 0;

        if (!isDedup) {
            storage.storeByHash(contentHash, file.filePath());
        }

        String fileId = UUID.randomUUID().toString();
        PadFile record = new PadFile();
        record.fileId = fileId;
        record.padPath = normalizedPad;
        record.contentType = file.contentType() != null ? file.contentType() : "application/octet-stream";
        record.filename = file.fileName();
        record.fileSizeBytes = fileSize;
        record.contentHash = contentHash;
        record.persist();

        // For files, we just return the fileId and filename
        return Response.status(201).entity(new FileDto(
                fileId,
                "/api/files/" + fileId,
                file.fileName()
        )).build();
    }

    public static class FileDto {
        public String fileId;
        public String url;
        public String filename;

        public FileDto(String fileId, String url, String filename) {
            this.fileId = fileId;
            this.url = url;
            this.filename = filename;
        }
    }
}
