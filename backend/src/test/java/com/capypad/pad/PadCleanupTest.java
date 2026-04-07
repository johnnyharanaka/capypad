package com.capypad.pad;

import io.quarkus.test.junit.QuarkusTest;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertNotNull;

@QuarkusTest
class PadCleanupTest {

    @Inject
    PadCleanupJob cleanupJob;

    @Test
    @Transactional
    void deletesOldPads() {
        String oldPath = "cleanup-old-" + UUID.randomUUID();
        String recentPath = "cleanup-recent-" + UUID.randomUUID();

        Pad old = new Pad();
        old.path = oldPath;
        old.content = "old content";
        old.persist();
        Pad.update("updatedAt = ?1 where path = ?2",
                Instant.now().minus(31, ChronoUnit.DAYS), oldPath);

        Pad recent = new Pad();
        recent.path = recentPath;
        recent.content = "recent content";
        recent.persist();

        cleanupJob.cleanup();

        assertNull(Pad.findByPath(oldPath));
        assertNotNull(Pad.findByPath(recentPath));
    }
}
