package com.capypad.pad.dto;

public record UpdatePasswordRequest(
    String username,
    String oldPassword,
    String newPassword
) {}
