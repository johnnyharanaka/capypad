package com.capypad.pad;

import com.capypad.pad.dto.UploadLimitStatus;
import com.capypad.pad.model.PadImage;
import com.capypad.pad.service.UploadLimitService;
import io.quarkus.test.junit.QuarkusTest;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;
import org.junit.jupiter.api.Test;

import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * NOTE: the test profile sets capypad.image.max-total-bytes-per-pad=200,
 * so byte-based assertions stay below that floor.
 */
@QuarkusTest
class UploadLimitServiceTest {

    @Inject
    UploadLimitService service;

    @Transactional
    void seedImage(String padPath, long sizeBytes) {
        PadImage img = new PadImage();
        img.imageId = UUID.randomUUID().toString();
        img.padPath = padPath;
        img.contentType = "image/png";
        img.filename = "x.png";
        img.fileSizeBytes = sizeBytes;
        img.contentHash = UUID.randomUUID().toString().replace("-", "");
        img.persist();
    }

    @Test
    void allowsUploadOnEmptyPad() {
        UploadLimitStatus status = service.currentStatus("upload-empty-" + UUID.randomUUID());
        assertFalse(status.uploadBlocked());
        assertTrue(status.imageCount() == 0);
        assertTrue(status.totalImageBytes() == 0);
    }

    @Test
    void blocksWhenImageCountLimitReached() {
        String pad = "upload-count-" + UUID.randomUUID();
        for (int i = 0; i < 20; i++) {
            seedImage(pad, 1L);
        }

        UploadLimitStatus status = service.currentStatus(pad);
        assertTrue(status.uploadBlocked());
        assertTrue(status.uploadBlockReason().contains("Image limit"));
    }

    @Test
    void evaluateBeforeUploadRejectsWhenProjectedBytesExceedLimit() {
        String pad = "upload-bytes-" + UUID.randomUUID();
        // Seed close to the 200B per-pad cap (test profile).
        seedImage(pad, 150L);

        UploadLimitStatus status = service.evaluateBeforeUpload(pad, 100L);
        assertTrue(status.uploadBlocked());
        assertTrue(status.uploadBlockReason().contains("Storage limit"));
    }

    @Test
    void evaluateBeforeUploadAllowsSmallIncomingFile() {
        String pad = "upload-fits-" + UUID.randomUUID();
        seedImage(pad, 10L);

        UploadLimitStatus status = service.evaluateBeforeUpload(pad, 50L);
        assertFalse(status.uploadBlocked());
    }
}
