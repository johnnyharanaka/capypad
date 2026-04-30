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

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

@QuarkusTest
class FileStorageServiceTest {

    @Inject
    FileStorageService storage;

    private Path createTempBytes(byte[] bytes) throws IOException {
        Path file = Files.createTempFile("capypad-file-", ".bin");
        Files.write(file, bytes);
        file.toFile().deleteOnExit();
        return file;
    }

    @Test
    void hashFileMatchesForIdenticalBytes() throws IOException {
        byte[] payload = "fixed payload".getBytes();
        String hashA = storage.hashFile(createTempBytes(payload));
        String hashB = storage.hashFile(createTempBytes(payload));
        assertEquals(hashA, hashB);
        assertEquals(64, hashA.length());
    }

    @Test
    void storeByHashWritesFileOnce() throws IOException {
        Path src = createTempBytes(("file-payload-" + UUID.randomUUID()).getBytes());
        String hash = storage.hashFile(src);
        storage.storeByHash(hash, src);

        Path target = storage.resolveByHash(hash);
        assertTrue(Files.exists(target));

        long beforeMtime = Files.getLastModifiedTime(target).toMillis();
        storage.storeByHash(hash, src);
        long afterMtime = Files.getLastModifiedTime(target).toMillis();
        assertEquals(beforeMtime, afterMtime);

        Files.deleteIfExists(target);
    }

    @Test
    @Transactional
    void deleteForRecordRespectsOtherReferences() throws IOException {
        Path src = createTempBytes(("dedup-" + UUID.randomUUID()).getBytes());
        String hash = storage.hashFile(src);
        storage.storeByHash(hash, src);

        PadFile a = new PadFile();
        a.fileId = UUID.randomUUID().toString();
        a.padPath = "files-a";
        a.contentType = "application/octet-stream";
        a.filename = "a.bin";
        a.fileSizeBytes = (long) Files.size(src);
        a.contentHash = hash;
        a.persist();

        PadFile b = new PadFile();
        b.fileId = UUID.randomUUID().toString();
        b.padPath = "files-b";
        b.contentType = "application/octet-stream";
        b.filename = "b.bin";
        b.fileSizeBytes = (long) Files.size(src);
        b.contentHash = hash;
        b.persist();

        storage.deleteForRecord(a);
        assertTrue(Files.exists(storage.resolveByHash(hash)),
                "file must remain because record b still references it");
        a.delete();

        storage.deleteForRecord(b);
        b.delete();
        assertFalse(Files.exists(storage.resolveByHash(hash)));
    }

    @Test
    void totalBytesOnDiskIsNonNegative() {
        assertTrue(storage.totalBytesOnDisk() >= 0);
    }
}
