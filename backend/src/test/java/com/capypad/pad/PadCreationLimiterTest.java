package com.capypad.pad;

import com.capypad.pad.service.PadCreationLimiter;
import io.quarkus.test.junit.QuarkusTest;
import io.quarkus.test.junit.TestProfile;
import io.quarkus.test.junit.QuarkusTestProfile;
import jakarta.inject.Inject;
import org.junit.jupiter.api.Test;

import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

@QuarkusTest
@TestProfile(PadCreationLimiterTest.LowLimitProfile.class)
class PadCreationLimiterTest {

    public static class LowLimitProfile implements QuarkusTestProfile {
        @Override
        public Map<String, String> getConfigOverrides() {
            // Override the broad test-profile limit (10000) to make the test fast.
            return Map.of(
                    "capypad.pad.creation-rate-limit.per-window", "5",
                    "capypad.pad.creation-rate-limit.window-seconds", "60"
            );
        }
    }

    @Inject
    PadCreationLimiter limiter;

    @Test
    void allowsUpToConfiguredMaxThenBlocks() {
        String ip = "10.99.0." + (UUID.randomUUID().getMostSignificantBits() & 0xFF);

        for (int i = 0; i < 5; i++) {
            assertTrue(limiter.tryAllow(ip), "attempt " + i + " should be allowed");
        }
        assertFalse(limiter.tryAllow(ip), "6th attempt must be rate-limited");
    }

    @Test
    void differentIpsHaveIndependentBuckets() {
        String ipA = "10.50.0." + (UUID.randomUUID().getMostSignificantBits() & 0xFF);
        String ipB = "10.50.1." + (UUID.randomUUID().getMostSignificantBits() & 0xFF);

        for (int i = 0; i < 5; i++) {
            assertTrue(limiter.tryAllow(ipA));
        }
        assertFalse(limiter.tryAllow(ipA));
        assertTrue(limiter.tryAllow(ipB));
    }

    @Test
    void exposesConfiguredWindow() {
        assertTrue(limiter.windowSeconds() > 0);
    }
}
