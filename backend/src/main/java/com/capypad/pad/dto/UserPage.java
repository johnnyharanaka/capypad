package com.capypad.pad.dto;

import java.util.List;

public record UserPage(List<UserSummary> items, long total, int page, int totalPages) {}
