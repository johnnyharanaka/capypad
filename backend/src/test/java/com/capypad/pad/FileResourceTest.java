package com.capypad.pad;

import com.capypad.pad.model.SiteSettings;
import io.quarkus.narayana.jta.QuarkusTransaction;
import io.quarkus.test.junit.QuarkusTest;
import io.quarkus.test.security.TestSecurity;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.UUID;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.notNullValue;

@QuarkusTest
class FileResourceTest {

    private Path createTempFile(int sizeBytes, String suffix) throws IOException {
        Path file = Files.createTempFile("capypad-fres-", suffix);
        byte[] bytes = new byte[Math.max(sizeBytes, 1)];
        for (int i = 0; i < bytes.length; i++) bytes[i] = (byte) (i % 127);
        Files.write(file, bytes);
        file.toFile().deleteOnExit();
        return file;
    }

    /** Mutates SiteSettings in its own committed transaction so subsequent HTTP requests see it. */
    private void mutateSettings(java.util.function.Consumer<SiteSettings> mutator) {
        QuarkusTransaction.requiringNew().run(() -> {
            SiteSettings s = SiteSettings.get();
            mutator.accept(s);
            s.persist();
        });
    }

    @Test
    void anonymousUploadIsRejected() throws IOException {
        Path file = createTempFile(64, ".bin");
        given()
                .multiPart("file", file.toFile(), "application/octet-stream")
                .when().post("/api/pad/{p}/files", "anon-pad-" + UUID.randomUUID())
                .then().statusCode(401);
    }

    @Test
    @TestSecurity(user = "uploader", roles = "USER")
    void uploadSucceedsAndReturnsLocation() throws IOException {
        String pad = "file-ok-" + UUID.randomUUID();
        Path file = createTempFile(64, ".bin");

        given()
                .multiPart("file", file.toFile(), "application/octet-stream")
                .when().post("/api/pad/{p}/files", pad)
                .then().statusCode(201)
                .body("fileId", notNullValue())
                .body("url", containsString("/api/files/"))
                .body("filename", notNullValue());
    }

    @Test
    @TestSecurity(user = "uploader", roles = "USER")
    void invalidPadPathRejectedWith400() throws IOException {
        Path file = createTempFile(64, ".bin");
        given()
                .multiPart("file", file.toFile(), "application/octet-stream")
                .when().post("/api/pad/{p}/files", "INVALID..PATH")
                .then().statusCode(400);
    }

    @Test
    @TestSecurity(user = "uploader", roles = "USER")
    void uploadBlockedWhenBlockFilesEnabled() throws IOException {
        mutateSettings(s -> s.blockFiles = true);
        try {
            Path file = createTempFile(64, ".bin");
            given()
                    .multiPart("file", file.toFile(), "application/octet-stream")
                    .when().post("/api/pad/{p}/files", "blocked-" + UUID.randomUUID())
                    .then().statusCode(403);
        } finally {
            mutateSettings(s -> s.blockFiles = false);
        }
    }

    @Test
    @TestSecurity(user = "uploader", roles = "USER")
    void uploadRejectedWhenFileExceedsConfiguredMax() throws IOException {
        mutateSettings(s -> s.maxFileBytes = 1_048_576L); // 1MB cap
        try {
            // 2MB file — exceeds 1MB cap
            Path file = createTempFile(2 * 1024 * 1024, ".bin");
            given()
                    .multiPart("file", file.toFile(), "application/octet-stream")
                    .when().post("/api/pad/{p}/files", "toobig-" + UUID.randomUUID())
                    .then().statusCode(413);
        } finally {
            mutateSettings(s -> s.maxFileBytes = 10_485_760L);
        }
    }
}
