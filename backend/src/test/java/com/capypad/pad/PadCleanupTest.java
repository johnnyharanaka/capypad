package com.capypad.pad;

import com.capypad.pad.job.PadCleanupJob;
import com.capypad.pad.model.Pad;
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
        old.claimedBy = "someone";
        old.persist();
        Pad.update("updatedAt = ?1 where path = ?2",
                Instant.now().minus(31, ChronoUnit.DAYS), oldPath);

        Pad recent = new Pad();
        recent.path = recentPath;
        recent.content = "recent content";
        recent.claimedBy = "someone";
        recent.persist();

        cleanupJob.cleanup();

        assertNull(Pad.findByPath(oldPath));
        assertNotNull(Pad.findByPath(recentPath));
    }

    @Test
    @Transactional
    void deletesUnclaimedPadsAfterEightHours() {
        String stalePath = "unclaimed-stale-" + UUID.randomUUID();
        String freshPath = "unclaimed-fresh-" + UUID.randomUUID();
        String claimedStalePath = "claimed-young-" + UUID.randomUUID();

        Pad staleAnon = new Pad();
        staleAnon.path = stalePath;
        staleAnon.content = "old anon";
        staleAnon.persist();
        Pad.update("updatedAt = ?1 where path = ?2",
                Instant.now().minus(9, ChronoUnit.HOURS), stalePath);

        Pad freshAnon = new Pad();
        freshAnon.path = freshPath;
        freshAnon.content = "fresh anon";
        freshAnon.persist();

        // Claimed pad older than 8h but younger than 30d must survive.
        Pad claimedYoung = new Pad();
        claimedYoung.path = claimedStalePath;
        claimedYoung.content = "claimed content";
        claimedYoung.claimedBy = "user";
        claimedYoung.persist();
        Pad.update("updatedAt = ?1 where path = ?2",
                Instant.now().minus(2, ChronoUnit.DAYS), claimedStalePath);

        cleanupJob.cleanup();

        assertNull(Pad.findByPath(stalePath));
        assertNotNull(Pad.findByPath(freshPath));
        assertNotNull(Pad.findByPath(claimedStalePath));
    }
}
