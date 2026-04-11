package com.capypad.pad;

import jakarta.enterprise.context.ApplicationScoped;
import org.eclipse.microprofile.config.inject.ConfigProperty;

@ApplicationScoped
public class UploadLimitService {

    @ConfigProperty(name = "capypad.image.max-count-per-pad", defaultValue = "20")
    long maxCountPerPad;

    @ConfigProperty(name = "capypad.image.max-total-bytes-per-pad", defaultValue = "52428800")
    long maxTotalBytesPerPad;

    @ConfigProperty(name = "block.image", defaultValue = "false")
    boolean blockImage;

    public UploadLimitStatus currentStatus(String normalizedPadPath) {
        long imageCount = PadImage.countByPadPath(normalizedPadPath);
        long totalImageBytes = PadImage.totalSizeByPadPath(normalizedPadPath);

        if (blockImage) {
            return UploadLimitStatus.blocked(
                    imageCount,
                    0,
                    totalImageBytes,
                    0,
                    "Image uploads are temporarily disabled"
            );
        }

        if (imageCount >= maxCountPerPad) {
            return UploadLimitStatus.blocked(
                    imageCount,
                    maxCountPerPad,
                    totalImageBytes,
                    maxTotalBytesPerPad,
                    "Image limit reached for this pad"
            );
        }

        if (totalImageBytes >= maxTotalBytesPerPad) {
            return UploadLimitStatus.blocked(
                    imageCount,
                    maxCountPerPad,
                    totalImageBytes,
                    maxTotalBytesPerPad,
                    "Storage limit reached for this pad"
            );
        }

        return UploadLimitStatus.allowed(imageCount, maxCountPerPad, totalImageBytes, maxTotalBytesPerPad);
    }

    public UploadLimitStatus evaluateBeforeUpload(String normalizedPadPath, long incomingFileSize) {
        UploadLimitStatus current = currentStatus(normalizedPadPath);
        if (current.uploadBlocked()) {
            return current;
        }

        long projectedBytes = current.totalImageBytes() + incomingFileSize;
        if (projectedBytes > maxTotalBytesPerPad) {
            return UploadLimitStatus.blocked(
                    current.imageCount(),
                    current.imageCountLimit(),
                    current.totalImageBytes(),
                    current.totalImageBytesLimit(),
                    "Storage limit reached for this pad"
            );
        }

        return current;
    }
}