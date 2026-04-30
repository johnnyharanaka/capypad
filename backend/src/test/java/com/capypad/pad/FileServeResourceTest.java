package com.capypad.pad;

import com.capypad.pad.model.PadFile;
import com.capypad.pad.service.FileStorageService;
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
class FileServeResourceTest {

    @Inject
    FileStorageService storage;

    @Transactional
    String seedFileOnDisk() throws IOException {
        byte[] bytes = ("file-" + UUID.randomUUID()).getBytes();
        Path tmp = Files.createTempFile("capypad-fserve-", ".bin");
        Files.write(tmp, bytes);
        tmp.toFile().deleteOnExit();

        String hash = storage.hashFile(tmp);
        storage.storeByHash(hash, tmp);

        PadFile rec = new PadFile();
        rec.fileId = UUID.randomUUID().toString();
        rec.padPath = "fserve-" + UUID.randomUUID();
        rec.contentType = "application/pdf";
        rec.filename = "doc.pdf";
        rec.fileSizeBytes = (long) bytes.length;
        rec.contentHash = hash;
        rec.persist();
        return rec.fileId;
    }

    @Test
    void rejectsInvalidUuidWith400() {
        given().when().get("/api/files/not-a-uuid")
                .then().statusCode(400);
    }

    @Test
    void unknownFileReturns404() {
        given().when().get("/api/files/" + UUID.randomUUID())
                .then().statusCode(404);
    }

    @Test
    void servesStoredFileWithDownloadHeaders() throws IOException {
        String id = seedFileOnDisk();
        given().when().get("/api/files/" + id)
                .then().statusCode(200)
                .header("Content-Disposition", org.hamcrest.Matchers.containsString("attachment"))
                .header("ETag", org.hamcrest.Matchers.containsString(id));
    }

    @Test
    void respondsWith304WhenIfNoneMatchMatches() throws IOException {
        String id = seedFileOnDisk();
        given()
                .header("If-None-Match", "\"" + id + "\"")
                .when().get("/api/files/" + id)
                .then().statusCode(304);
    }

    @Test
    void deleteRequiresAuth() {
        given().when().delete("/api/files/" + UUID.randomUUID())
                .then().statusCode(401);
    }
}
