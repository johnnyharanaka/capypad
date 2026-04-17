package com.capypad.pad.dto;

import java.time.Instant;

public record PadSummary(Long id, String path, int contentLength, long imageCount, Instant updatedAt) {}
