package com.capypad.pad;

import com.capypad.pad.model.PadImage;
import com.capypad.pad.service.ImageStorageService;
import io.quarkus.test.junit.QuarkusTest;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.UUID;

import static io.restassured.RestAssured.given;

@QuarkusTest
class ImageServeResourceTest {

    @Inject
    ImageStorageService storage;

    @Transactional
    String seedImageOnDisk(String contentType) throws IOException {
        byte[] bytes = ("img-" + UUID.randomUUID()).getBytes();
        Path tmp = Files.createTempFile("capypad-serve-", ".bin");
        Files.write(tmp, bytes);
        tmp.toFile().deleteOnExit();

        String hash = storage.hashFile(tmp);
        storage.storeByHash(hash, tmp);

        PadImage img = new PadImage();
        img.imageId = UUID.randomUUID().toString();
        img.padPath = "serve-" + UUID.randomUUID();
        img.contentType = contentType;
        img.filename = "x.png";
        img.fileSizeBytes = (long) bytes.length;
        img.contentHash = hash;
        img.persist();
        return img.imageId;
    }

    @Test
    void rejectsInvalidUuidWith400() {
        given().when().get("/api/images/not-a-uuid")
                .then().statusCode(400);
    }

    @Test
    void unknownImageReturns404() {
        given().when().get("/api/images/" + UUID.randomUUID())
                .then().statusCode(404);
    }

    @Test
    void servesStoredImage() throws IOException {
        String id = seedImageOnDisk("image/png");
        given().when().get("/api/images/" + id)
                .then().statusCode(200)
                .header("Cache-Control", org.hamcrest.Matchers.containsString("immutable"))
                .header("ETag", org.hamcrest.Matchers.containsString(id));
    }

    @Test
    void respondsWith304WhenIfNoneMatchMatches() throws IOException {
        String id = seedImageOnDisk("image/png");
        given()
                .header("If-None-Match", "\"" + id + "\"")
                .when().get("/api/images/" + id)
                .then().statusCode(304);
    }

    @Test
    void deleteRequiresAuth() {
        given().when().delete("/api/images/" + UUID.randomUUID())
                .then().statusCode(401);
    }
}
