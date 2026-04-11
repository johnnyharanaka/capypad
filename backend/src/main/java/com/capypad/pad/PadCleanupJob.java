package com.capypad.pad;

import io.quarkus.scheduler.Scheduled;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.jboss.logging.Logger;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;

@ApplicationScoped
public class PadCleanupJob {

    private static final Logger LOG = Logger.getLogger(PadCleanupJob.class);

    @ConfigProperty(name = "capypad.cleanup.max-age-days", defaultValue = "30")
    int maxAgeDays;

    @Inject
    ImageStorageService storage;

    @Scheduled(every = "${capypad.cleanup.interval:24h}")
    @Transactional
    void cleanup() {
        Instant cutoff = Instant.now().minus(maxAgeDays, ChronoUnit.DAYS);
        List<Pad> expired = Pad.list("updatedAt < ?1", cutoff);

        for (Pad pad : expired) {
            List<PadImage> images = PadImage.findByPadPath(pad.path);
            for (PadImage img : images) {
                storage.deleteForRecord(img);
                img.delete();
            }
            pad.delete();
        }

        if (!expired.isEmpty()) {
            LOG.infof("Cleaned up %d pads not updated in %d days", expired.size(), maxAgeDays);
        }
    }
}
