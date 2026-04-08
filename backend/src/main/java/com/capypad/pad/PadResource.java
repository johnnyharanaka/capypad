package com.capypad.pad;

import jakarta.inject.Inject;
import jakarta.transaction.Transactional;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.PUT;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;

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

    @Inject
    ImageStorageService storage;

    @GET
    @Path("/{path}")
    public PadDto get(@PathParam("path") String path) {
        String normalized = path.toLowerCase();
        Pad pad = Pad.findByPath(normalized);
        return new PadDto(normalized, pad != null ? pad.content : "");
    }

    @PUT
    @Path("/{path}")
    @Transactional
    public PadDto put(@PathParam("path") String path, PadDto dto) {
        String normalized = path.toLowerCase();
        Pad pad = Pad.findByPath(normalized);
        if (pad == null) {
            pad = new Pad();
            pad.path = normalized;
        }
        pad.content = dto.content();
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
                storage.delete(img.imageId);
                img.delete();
            }
        }

        return new PadDto(normalized, pad.content);
    }
}
