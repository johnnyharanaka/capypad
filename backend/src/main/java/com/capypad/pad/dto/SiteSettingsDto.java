package com.capypad.pad.dto;

public record SiteSettingsDto(
        boolean maintenanceMode,
        boolean blockFiles,
        int cleanupMaxAgeDays,
        int unclaimedCleanupMaxAgeHours,
        long maxFileBytes
) {}
