package com.capypad.pad.service;

import com.capypad.pad.dto.PadDto;
import io.quarkus.scheduler.Scheduled;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.sse.OutboundSseEvent;
import jakarta.ws.rs.sse.Sse;
import jakarta.ws.rs.sse.SseEventSink;
import org.jboss.logging.Logger;

import java.util.Iterator;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Tracks SSE subscribers per pad path and fans out pad updates.
 * Fan-out skips the client that authored the change (identified by clientId).
 */
@ApplicationScoped
public class PadBroadcastService {

    private static final Logger LOG = Logger.getLogger(PadBroadcastService.class);

    private final ConcurrentHashMap<String, Set<Subscriber>> subscribers = new ConcurrentHashMap<>();
    private volatile Sse sse;

    public record Subscriber(String clientId, SseEventSink sink) {}

    /** Called by the SSE resource on first subscribe so publish() can build events. */
    public void ensureSse(Sse sse) {
        if (this.sse == null) {
            this.sse = sse;
        }
    }

    public void subscribe(String padPath, Subscriber sub) {
        subscribers.computeIfAbsent(padPath, k -> ConcurrentHashMap.newKeySet()).add(sub);
    }

    public void unsubscribe(String padPath, Subscriber sub) {
        Set<Subscriber> set = subscribers.get(padPath);
        if (set == null) return;
        set.remove(sub);
        subscribers.computeIfPresent(padPath, (k, v) -> v.isEmpty() ? null : v);
    }

    public void publish(String padPath, String senderClientId, PadDto dto) {
        Set<Subscriber> set = subscribers.get(padPath);
        if (set == null || set.isEmpty() || sse == null) return;
        OutboundSseEvent event = sse.newEventBuilder()
                .name("update")
                .mediaType(MediaType.APPLICATION_JSON_TYPE)
                .data(PadDto.class, dto)
                .build();
        send(set, event, senderClientId);
    }

    @Scheduled(every = "25s", concurrentExecution = Scheduled.ConcurrentExecution.SKIP)
    void heartbeat() {
        if (sse == null || subscribers.isEmpty()) return;
        OutboundSseEvent ping = sse.newEventBuilder()
                .name("ping")
                .data(String.class, "")
                .build();
        for (Set<Subscriber> set : subscribers.values()) {
            send(set, ping, null);
        }
    }

    private void send(Set<Subscriber> set, OutboundSseEvent event, String skipClientId) {
        Iterator<Subscriber> it = set.iterator();
        while (it.hasNext()) {
            Subscriber sub = it.next();
            if (skipClientId != null && skipClientId.equals(sub.clientId)) continue;
            if (sub.sink.isClosed()) {
                set.remove(sub);
                continue;
            }
            try {
                sub.sink.send(event);
            } catch (Exception e) {
                LOG.debugf("Dropping SSE subscriber %s: %s", sub.clientId, e.getMessage());
                set.remove(sub);
            }
        }
    }
}
