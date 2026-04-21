package com.capypad.pad.job;

import com.capypad.pad.model.Pad;
import com.capypad.pad.model.PadImage;
import com.capypad.pad.service.ImageStorageService;
import com.capypad.pad.service.SiteSettingsService;
import com.capypad.pad.model.SiteSettings;
import io.quarkus.scheduler.Scheduled;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;
import org.jboss.logging.Logger;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;

@ApplicationScoped
public class PadCleanupJob {

    private static final Logger LOG = Logger.getLogger(PadCleanupJob.class);

    @Inject
    SiteSettingsService siteSettingsService;

    @Inject
    ImageStorageService storage;

    @Scheduled(every = "${capypad.cleanup.interval:24h}")
    @Transactional
    public void cleanup() {
        SiteSettings settings = siteSettingsService.get();
        int maxAgeDays = settings.cleanupMaxAgeDays;
        int unclaimedMaxAgeHours = settings.unclaimedCleanupMaxAgeHours;
        Instant claimedCutoff = Instant.now().minus(maxAgeDays, ChronoUnit.DAYS);
        Instant unclaimedCutoff = Instant.now().minus(unclaimedMaxAgeHours, ChronoUnit.HOURS);

        List<Pad> expired = new ArrayList<>();
        expired.addAll(Pad.list("claimedBy is not null and updatedAt < ?1", claimedCutoff));
        expired.addAll(Pad.list("claimedBy is null and updatedAt < ?1", unclaimedCutoff));

        for (Pad pad : expired) {
            List<PadImage> images = PadImage.findByPadPath(pad.path);
            for (PadImage img : images) {
                storage.deleteForRecord(img);
                img.delete();
            }
            pad.delete();
        }

        if (!expired.isEmpty()) {
            LOG.infof("Cleaned up %d pads (claimed TTL %dd, unclaimed TTL %dh)",
                    expired.size(), maxAgeDays, unclaimedMaxAgeHours);
        }
    }
}
