package com.capypad.pad.controller;

import com.capypad.pad.service.PadBroadcastService;
import jakarta.inject.Inject;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.QueryParam;
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.sse.Sse;
import jakarta.ws.rs.sse.SseEventSink;

import java.util.regex.Pattern;

@Path("/api/pad")
public class PadEventsResource {

    private static final Pattern VALID_PATH = Pattern.compile("^[a-z0-9][a-z0-9._-]{0,99}$");

    @Inject
    PadBroadcastService broadcaster;

    @GET
    @Path("/{path}/events")
    @Produces(MediaType.SERVER_SENT_EVENTS)
    public void events(
            @PathParam("path") String path,
            @QueryParam("clientId") String clientId,
            @Context Sse sse,
            @Context SseEventSink sink) {
        String normalized = path == null ? "" : path.toLowerCase();
        if (!VALID_PATH.matcher(normalized).matches() || normalized.contains("..")) {
            sink.close();
            return;
        }
        broadcaster.ensureSse(sse);
        PadBroadcastService.Subscriber sub = new PadBroadcastService.Subscriber(clientId, sink);
        broadcaster.subscribe(normalized, sub);

        sink.send(sse.newEventBuilder()
                .name("ready")
                .data(String.class, "")
                .build());
    }
}
