package com.capypad.pad;

import io.quarkus.test.junit.QuarkusTest;
import io.quarkus.test.security.TestSecurity;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.UUID;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.equalTo;

@QuarkusTest
class ImageUploadProtectionTest {

    @Test
    @TestSecurity(user = "testuser", roles = "USER")
    void blocksUploadWhenImageCountLimitIsReached() throws IOException {
        String padPath = "count-limit-" + UUID.randomUUID();
        Path image = createTempImage(8);

        for (int i = 0; i < 20; i++) {
            uploadImage(padPath, image, "10.0.1." + i);
        }

        given()
                .header("X-Forwarded-For", "10.0.1.250")
                .multiPart("file", image.toFile(), "image/png")
                .when().post("/api/pad/{padPath}/images", padPath)
                .then()
                .statusCode(429)
                .body(equalTo("Image limit reached for this pad"));
    }

    @Test
    @TestSecurity(user = "testuser", roles = "USER")
    void blocksUploadWhenStorageLimitIsReached() throws IOException {
        String padPath = "storage-limit-" + UUID.randomUUID();
        Path large = createTempImage(150);
        Path another = createTempImage(100);

        uploadImage(padPath, large, "10.0.0.2");

        given()
                .header("X-Forwarded-For", "10.0.0.2")
                .multiPart("file", another.toFile(), "image/png")
                .when().post("/api/pad/{padPath}/images", padPath)
                .then()
                .statusCode(413)
                .body(equalTo("Storage limit reached for this pad"));
    }

    @Test
    @TestSecurity(user = "testuser", roles = "USER")
    void blocksUploadWhenIpRateLimitIsExceeded() throws IOException {
        String padPath = "rate-limit-" + UUID.randomUUID();
        Path image = createTempImage(8);
        String ip = "10.0.0.3";

        for (int i = 0; i < 5; i++) {
            uploadImage(padPath, image, ip);
        }

        given()
                .header("X-Forwarded-For", ip)
                .multiPart("file", image.toFile(), "image/png")
                .when().post("/api/pad/{padPath}/images", padPath)
                .then()
                .statusCode(429)
                .body(equalTo("Upload rate limit exceeded. Try again in a minute."));
    }

    private void uploadImage(String padPath, Path image, String ip) {
        given()
                .header("X-Forwarded-For", ip)
                .multiPart("file", image.toFile(), "image/png")
                .when().post("/api/pad/{padPath}/images", padPath)
                .then()
                .statusCode(201);
    }

    private Path createTempImage(int sizeBytes) throws IOException {
        Path file = Files.createTempFile("capypad-upload-", ".img");
        byte[] bytes = new byte[sizeBytes];
        for (int i = 0; i < bytes.length; i++) {
            bytes[i] = (byte) (i % 127);
        }
        Files.write(file, bytes);
        file.toFile().deleteOnExit();
        return file;
    }
}