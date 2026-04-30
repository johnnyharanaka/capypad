package com.capypad.pad;

import com.capypad.pad.model.SiteSettings;
import com.capypad.pad.service.SiteSettingsService;
import io.quarkus.test.junit.QuarkusTest;
import jakarta.inject.Inject;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

@QuarkusTest
class SiteSettingsServiceTest {

    @Inject
    SiteSettingsService service;

    @Test
    void getReturnsSettingsCreatedAtStartup() {
        SiteSettings s = service.get();
        assertNotNull(s);
        assertTrue(s.cleanupMaxAgeDays >= 1);
        assertTrue(s.unclaimedCleanupMaxAgeHours >= 1);
    }

    @Test
    void updatePersistsAllowedValues() {
        SiteSettings updated = service.update(true, true, 15, 4, 5_000_000L);
        assertEquals(true, updated.maintenanceMode);
        assertEquals(true, updated.blockFiles);
        assertEquals(15, updated.cleanupMaxAgeDays);
        assertEquals(4, updated.unclaimedCleanupMaxAgeHours);
        // maxFileBytes is clamped to a minimum of 1MB
        assertEquals(5_000_000L, updated.maxFileBytes);

        // Restore sane defaults so other tests aren't affected
        service.update(false, false, 30, 8, 10_485_760L);
    }

    @Test
    void updateClampsMinimumsToOne() {
        SiteSettings updated = service.update(false, false, 0, 0, 100L);
        assertEquals(1, updated.cleanupMaxAgeDays);
        assertEquals(1, updated.unclaimedCleanupMaxAgeHours);
        // 100 bytes is below the 1MB floor → clamped up to 1MB
        assertEquals(1_048_576L, updated.maxFileBytes);

        service.update(false, false, 30, 8, 10_485_760L);
    }
}
