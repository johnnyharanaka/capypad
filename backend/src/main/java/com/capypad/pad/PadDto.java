package com.capypad.pad;

public record PadDto(
	String path,
	String content,
	long imageCount,
	long imageCountLimit,
	long totalImageBytes,
	long totalImageBytesLimit,
	boolean uploadBlocked,
	String uploadBlockReason
) {
}
