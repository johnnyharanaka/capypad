package com.capypad.pad.service;

import com.capypad.pad.model.SiteSettings;
import io.quarkus.runtime.StartupEvent;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.event.Observes;
import jakarta.transaction.Transactional;
import org.eclipse.microprofile.config.inject.ConfigProperty;

@ApplicationScoped
public class SiteSettingsService {

    @ConfigProperty(name = "capypad.cleanup.max-age-days", defaultValue = "30")
    int defaultMaxAgeDays;

    @ConfigProperty(name = "capypad.cleanup.unclaimed-max-age-hours", defaultValue = "8")
    int defaultUnclaimedMaxAgeHours;

    @Transactional
    void onStart(@Observes StartupEvent ev) {
        if (SiteSettings.count() == 0) {
            SiteSettings settings = new SiteSettings();
            settings.cleanupMaxAgeDays = defaultMaxAgeDays;
            settings.unclaimedCleanupMaxAgeHours = defaultUnclaimedMaxAgeHours;
            settings.persist();
        }
    }

    public SiteSettings get() {
        return SiteSettings.get();
    }

    @Transactional
    public SiteSettings update(boolean maintenanceMode, boolean blockFiles, int cleanupMaxAgeDays, int unclaimedCleanupMaxAgeHours, long maxFileBytes) {
        SiteSettings settings = SiteSettings.get();
        settings.maintenanceMode = maintenanceMode;
        settings.blockFiles = blockFiles;
        settings.cleanupMaxAgeDays = Math.max(1, cleanupMaxAgeDays);
        settings.unclaimedCleanupMaxAgeHours = Math.max(1, unclaimedCleanupMaxAgeHours);
        settings.maxFileBytes = Math.max(1048576L, maxFileBytes); // min 1MB
        settings.persist();
        return settings;
    }
}
