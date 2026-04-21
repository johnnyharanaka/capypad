package com.capypad.pad.service;

import java.util.regex.Pattern;

/**
 * Strips media/link constructs from pad content submitted by anonymous users.
 * Anonymous users may only contribute plain text + basic markdown formatting —
 * no images, links, file attachments, or raw HTML.
 */
public final class AnonymousContentSanitizer {

    private static final Pattern MARKDOWN_IMAGE = Pattern.compile("!\\[[^\\]]*\\]\\([^)]*\\)");
    private static final Pattern IMAGE_REF = Pattern.compile("\\\\image\\[[^\\]]*\\]");
    private static final Pattern FILE_REF = Pattern.compile("\\\\file\\[[^\\]]*\\]");
    private static final Pattern MARKDOWN_LINK = Pattern.compile("\\[([^\\]]*)\\]\\([^)]*\\)");
    private static final Pattern HTML_TAG = Pattern.compile("<[^>]+>");

    private AnonymousContentSanitizer() {}

    public static String sanitize(String content) {
        if (content == null || content.isEmpty()) return content;
        String out = content;
        out = MARKDOWN_IMAGE.matcher(out).replaceAll("");
        out = IMAGE_REF.matcher(out).replaceAll("");
        out = FILE_REF.matcher(out).replaceAll("");
        out = MARKDOWN_LINK.matcher(out).replaceAll("$1");
        out = HTML_TAG.matcher(out).replaceAll("");
        return out;
    }
}
