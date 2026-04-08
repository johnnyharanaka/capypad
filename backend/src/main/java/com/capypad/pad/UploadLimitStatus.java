package com.capypad.pad;

public record UploadLimitStatus(
        long imageCount,
        long imageCountLimit,
        long totalImageBytes,
        long totalImageBytesLimit,
        boolean uploadBlocked,
        String uploadBlockReason
) {
    public static UploadLimitStatus allowed(long imageCount, long imageCountLimit, long totalImageBytes, long totalImageBytesLimit) {
        return new UploadLimitStatus(imageCount, imageCountLimit, totalImageBytes, totalImageBytesLimit, false, null);
    }

    public static UploadLimitStatus blocked(long imageCount, long imageCountLimit, long totalImageBytes, long totalImageBytesLimit, String reason) {
        return new UploadLimitStatus(imageCount, imageCountLimit, totalImageBytes, totalImageBytesLimit, true, reason);
    }
}