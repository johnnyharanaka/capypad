package com.capypad.pad;

import com.capypad.pad.service.AnonymousContentSanitizer;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

class AnonymousContentSanitizerTest {

    @Test
    void keepsPlainText() {
        assertEquals("hello world", AnonymousContentSanitizer.sanitize("hello world"));
    }

    @Test
    void stripsMarkdownImages() {
        assertEquals("before  after",
                AnonymousContentSanitizer.sanitize("before ![alt](https://x/y.png) after"));
    }

    @Test
    void stripsImageReferences() {
        assertEquals("a  b", AnonymousContentSanitizer.sanitize("a \\image[abc123] b"));
    }

    @Test
    void stripsFileReferences() {
        assertEquals("see ", AnonymousContentSanitizer.sanitize("see \\file[doc.pdf|123]"));
    }

    @Test
    void unwrapsMarkdownLinks() {
        assertEquals("click here",
                AnonymousContentSanitizer.sanitize("[click here](https://example.com)"));
    }

    @Test
    void stripsHtmlTags() {
        assertEquals("video",
                AnonymousContentSanitizer.sanitize("<iframe src=\"x\"></iframe>video"));
    }

    @Test
    void preservesBasicMarkdown() {
        String input = "# Title\n\n**bold** _italic_ `code`\n\n- item\n- item";
        assertEquals(input, AnonymousContentSanitizer.sanitize(input));
    }

    @Test
    void handlesNullAndEmpty() {
        assertEquals(null, AnonymousContentSanitizer.sanitize(null));
        assertEquals("", AnonymousContentSanitizer.sanitize(""));
    }
}
