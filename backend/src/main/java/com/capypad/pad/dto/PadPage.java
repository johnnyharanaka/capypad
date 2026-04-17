package com.capypad.pad.dto;

import java.util.List;

public record PadPage(List<PadSummary> items, long total, int page, int totalPages) {}
