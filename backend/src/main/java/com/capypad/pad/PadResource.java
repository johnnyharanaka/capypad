package com.capypad.pad;

import jakarta.transaction.Transactional;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.PUT;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;

@Path("/api/pad")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
public class PadResource {

    @GET
    @Path("/{path}")
    public PadDto get(@PathParam("path") String path) {
        Pad pad = Pad.findByPath(path);
        return new PadDto(path, pad != null ? pad.content : "");
    }

    @PUT
    @Path("/{path}")
    @Transactional
    public PadDto put(@PathParam("path") String path, PadDto dto) {
        Pad pad = Pad.findByPath(path);
        if (pad == null) {
            pad = new Pad();
            pad.path = path;
        }
        pad.content = dto.content();
        pad.persist();
        return new PadDto(path, pad.content);
    }
}
