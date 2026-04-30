package com.capypad.pad;

import com.capypad.pad.dto.PadDto;
import com.capypad.pad.service.PadBroadcastService;
import io.quarkus.test.junit.QuarkusTest;
import jakarta.inject.Inject;
import jakarta.ws.rs.sse.SseEventSink;
import org.junit.jupiter.api.Test;

import java.util.concurrent.CompletionStage;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;

@QuarkusTest
class PadBroadcastServiceTest {

    @Inject
    PadBroadcastService broadcaster;

    private static class CountingSink implements SseEventSink {
        final AtomicInteger sent = new AtomicInteger();
        boolean closed = false;

        @Override public boolean isClosed() { return closed; }
        @Override public CompletionStage<?> send(jakarta.ws.rs.sse.OutboundSseEvent event) {
            sent.incrementAndGet();
            return java.util.concurrent.CompletableFuture.completedStage(null);
        }
        @Override public void close() { closed = true; }
    }

    @Test
    void publishWithoutSseInitializedIsNoOp() {
        // ensureSse hasn't been called for this path/sink — publish must not throw.
        PadDto dto = new PadDto(
                "noop-pad", "x",
                0, 20, 0, 52428800L,
                false, null,
                false, false,
                null, false, 8);
        assertDoesNotThrow(() -> broadcaster.publish("noop-pad", null, dto));
    }

    @Test
    void unsubscribeRemovesSubscriberCleanly() {
        CountingSink sink = new CountingSink();
        PadBroadcastService.Subscriber sub =
                new PadBroadcastService.Subscriber("client-x", sink);

        broadcaster.subscribe("sub-pad", sub);
        // Calling unsubscribe twice must be safe.
        broadcaster.unsubscribe("sub-pad", sub);
        broadcaster.unsubscribe("sub-pad", sub);
        assertEquals(0, sink.sent.get());
    }
}
