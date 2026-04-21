package com.capypad.pad.dto;

public record PadDto(
	String path,
	String content,
	long imageCount,
	long imageCountLimit,
	long totalImageBytes,
	long totalImageBytesLimit,
	boolean uploadBlocked,
	String uploadBlockReason,
	boolean maintenanceMode,
	boolean blockFiles,
	String lastEditedBy,
	boolean claimed
) {
}
