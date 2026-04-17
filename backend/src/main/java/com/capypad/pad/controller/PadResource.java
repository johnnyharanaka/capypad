package com.capypad.pad.controller;

import com.capypad.pad.dto.PadDto;
import com.capypad.pad.dto.PadUpdateDto;
import com.capypad.pad.dto.UploadLimitStatus;
import com.capypad.pad.model.Pad;
import com.capypad.pad.model.PadImage;
import com.capypad.pad.model.SiteSettings;
import com.capypad.pad.service.ImageStorageService;
import com.capypad.pad.service.PadCreationLimiter;
import com.capypad.pad.service.SiteSettingsService;
import com.capypad.pad.service.UploadLimitService;
import jakarta.annotation.security.RolesAllowed;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.PUT;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.core.HttpHeaders;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import org.eclipse.microprofile.config.inject.ConfigProperty;

import java.nio.charset.StandardCharsets;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Path("/api/pad")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
public class PadResource {

    private static final Pattern IMAGE_REF = Pattern.compile("\\\\image\\[([^\\]]+)\\]");

    @ConfigProperty(name = "capypad.pad.max-content-bytes", defaultValue = "262144")
    int maxContentBytes;

    @ConfigProperty(name = "capypad.image.max-count-per-pad", defaultValue = "20")
    long maxImagesPerPad;

    @ConfigProperty(name = "capypad.image.max-total-bytes-per-pad", defaultValue = "52428800")
    long maxBytesPerPad;

    @Inject
    ImageStorageService storage;

    @Inject
    UploadLimitService uploadLimitService;

    @Inject
    PadCreationLimiter padCreationLimiter;

    @Inject
    SiteSettingsService siteSettingsService;

    /** Only letters, digits, dots, hyphens and underscores — max 100 chars. */
    private static final Pattern VALID_PATH = Pattern.compile("^[a-z0-9][a-z0-9._-]{0,99}$");

    private void validatePath(String normalized) {
        if (!VALID_PATH.matcher(normalized).matches() || normalized.contains("..")) {
            throw new jakarta.ws.rs.BadRequestException(
                    "Invalid pad path. Use only letters, numbers, dots, hyphens and underscores (1-100 chars).");
        }
    }

    @GET
    @Path("/{path}")
    @Transactional
    public PadDto get(@PathParam("path") String path) {
        String normalized = path.toLowerCase();
        validatePath(normalized);
        Pad pad = Pad.findByPath(normalized);
        return toPadDto(normalized, pad != null ? pad.content : "");
    }

    @PUT
    @Path("/{path}")
    @Transactional
    @RolesAllowed({"USER", "ADMIN"})
    public Response put(
            @PathParam("path") String path,
            PadUpdateDto dto,
            @Context HttpHeaders headers) {
        String normalized = path.toLowerCase();
        validatePath(normalized);

        SiteSettings settings = siteSettingsService.get();
        if (settings.maintenanceMode) {
            return Response.status(Response.Status.SERVICE_UNAVAILABLE)
                    .entity("O site está em modo de manutenção. Edições estão desabilitadas.")
                    .build();
        }

        String content = dto != null && dto.content() != null ? dto.content() : "";
        int contentBytes = content.getBytes(StandardCharsets.UTF_8).length;
        if (contentBytes > maxContentBytes) {
            return Response.status(413)
                    .entity("Pad content too large. Max " + maxContentBytes + " bytes.")
                    .build();
        }

        Pad pad = Pad.findByPath(normalized);
        if (pad == null) {
            String clientIp = resolveClientIp(headers);
            if (!padCreationLimiter.tryAllow(clientIp)) {
                return Response.status(429)
                        .entity("Pad creation rate limit exceeded. Try again later.")
                        .header("Retry-After", String.valueOf(padCreationLimiter.windowSeconds()))
                        .build();
            }
            pad = new Pad();
            pad.path = normalized;
        }
        pad.content = content;
        pad.persist();

        // Clean up orphaned images
        Set<String> referenced = new HashSet<>();
        Matcher m = IMAGE_REF.matcher(pad.content);
        while (m.find()) {
            String ref = m.group(1);
            int pipe = ref.indexOf('|');
            referenced.add(pipe >= 0 ? ref.substring(0, pipe) : ref);
        }

        List<PadImage> allImages = PadImage.findByPadPath(normalized);
        for (PadImage img : allImages) {
            if (!referenced.contains(img.imageId)) {
                storage.deleteForRecord(img);
                img.delete();
            }
        }

        return Response.ok(toPadDto(normalized, pad.content)).build();
    }

    private PadDto toPadDto(String normalized, String content) {
        SiteSettings settings = siteSettingsService.get();
        boolean filesBlocked = settings.blockFiles;

        long imageCount = PadImage.countByPadPath(normalized);
        long totalBytes = PadImage.totalSizeByPadPath(normalized);

        if (filesBlocked) {
            return new PadDto(
                    normalized, content,
                    imageCount, maxImagesPerPad,
                    totalBytes, maxBytesPerPad,
                    true, "Upload de arquivos está desabilitado.",
                    settings.maintenanceMode, true
            );
        }

        UploadLimitStatus limits = uploadLimitService.currentStatus(normalized);
        return new PadDto(
                normalized, content,
                limits.imageCount(), limits.imageCountLimit(),
                limits.totalImageBytes(), limits.totalImageBytesLimit(),
                limits.uploadBlocked(), limits.uploadBlockReason(),
                settings.maintenanceMode, false
        );
    }

    private String resolveClientIp(HttpHeaders headers) {
        String forwardedFor = headers.getHeaderString("X-Forwarded-For");
        if (forwardedFor != null && !forwardedFor.isBlank()) {
            return forwardedFor.split(",")[0].trim();
        }
        String realIp = headers.getHeaderString("X-Real-IP");
        if (realIp != null && !realIp.isBlank()) {
            return realIp.trim();
        }
        return "unknown";
    }
}
