package com.capypad.pad.dto;

public record ImageDto(
	String imageId,
	String url,
	long imageCount,
	long imageCountLimit,
	long totalImageBytes,
	long totalImageBytesLimit
) {
}
