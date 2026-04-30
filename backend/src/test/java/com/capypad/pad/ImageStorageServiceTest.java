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

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

@QuarkusTest
class ImageStorageServiceTest {

    @Inject
    ImageStorageService storage;

    private Path createTempBytes(byte[] bytes) throws IOException {
        Path file = Files.createTempFile("capypad-img-", ".bin");
        Files.write(file, bytes);
        file.toFile().deleteOnExit();
        return file;
    }

    @Test
    void hashFileReturnsDeterministicSha256Hex() throws IOException {
        byte[] payload = "hello capypad".getBytes();
        Path a = createTempBytes(payload);
        Path b = createTempBytes(payload);

        String hashA = storage.hashFile(a);
        String hashB = storage.hashFile(b);

        assertEquals(hashA, hashB);
        assertEquals(64, hashA.length());
        assertTrue(hashA.matches("[0-9a-f]+"));
    }

    @Test
    void storeByHashIsIdempotent() throws IOException {
        Path src = createTempBytes(("payload-" + UUID.randomUUID()).getBytes());
        String hash = storage.hashFile(src);

        storage.storeByHash(hash, src);
        Path stored = storage.resolveByHash(hash);
        assertTrue(Files.exists(stored));
        long firstModified = Files.getLastModifiedTime(stored).toMillis();

        // Calling again must not rewrite the file
        storage.storeByHash(hash, src);
        long secondModified = Files.getLastModifiedTime(stored).toMillis();
        assertEquals(firstModified, secondModified);

        // Cleanup
        Files.deleteIfExists(stored);
    }

    @Test
    @Transactional
    void deleteForRecordRemovesFileWhenNoOtherReferences() throws IOException {
        Path src = createTempBytes(("only-ref-" + UUID.randomUUID()).getBytes());
        String hash = storage.hashFile(src);
        storage.storeByHash(hash, src);

        PadImage rec = new PadImage();
        rec.imageId = UUID.randomUUID().toString();
        rec.padPath = "delete-test-" + UUID.randomUUID();
        rec.contentType = "image/png";
        rec.filename = "x.png";
        rec.fileSizeBytes = (long) Files.size(src);
        rec.contentHash = hash;
        rec.persist();

        // Delete-for-record while it's the last reference: file should disappear.
        storage.deleteForRecord(rec);
        assertFalse(Files.exists(storage.resolveByHash(hash)));
        rec.delete();
    }

    @Test
    @Transactional
    void deleteForRecordKeepsFileWhenOtherRecordsShareHash() throws IOException {
        Path src = createTempBytes(("shared-" + UUID.randomUUID()).getBytes());
        String hash = storage.hashFile(src);
        storage.storeByHash(hash, src);

        PadImage first = new PadImage();
        first.imageId = UUID.randomUUID().toString();
        first.padPath = "shared-pad-1";
        first.contentType = "image/png";
        first.filename = "a.png";
        first.fileSizeBytes = (long) Files.size(src);
        first.contentHash = hash;
        first.persist();

        PadImage second = new PadImage();
        second.imageId = UUID.randomUUID().toString();
        second.padPath = "shared-pad-2";
        second.contentType = "image/png";
        second.filename = "b.png";
        second.fileSizeBytes = (long) Files.size(src);
        second.contentHash = hash;
        second.persist();

        storage.deleteForRecord(first);
        // Other record still references the file → file must remain.
        assertTrue(Files.exists(storage.resolveByHash(hash)));
        first.delete();

        // Last reference: file must now be deleted.
        storage.deleteForRecord(second);
        second.delete();
        assertFalse(Files.exists(storage.resolveByHash(hash)));
    }

    @Test
    void totalBytesOnDiskIsNonNegative() {
        long bytes = storage.totalBytesOnDisk();
        assertTrue(bytes >= 0);
    }
}
