package com.capypad.pad.service;

import com.capypad.pad.model.PadImage;
import jakarta.annotation.PostConstruct;
import jakarta.enterprise.context.ApplicationScoped;
import org.eclipse.microprofile.config.inject.ConfigProperty;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.security.DigestInputStream;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;

@ApplicationScoped
public class ImageStorageService {

    @ConfigProperty(name = "capypad.image.storage-dir", defaultValue = "./data/images")
    public String storageDir;

    @PostConstruct
    void init() {
        try {
            Files.createDirectories(Path.of(storageDir));
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    /** Writes the file to disk keyed by its content hash. No-op if the file already exists. */
    public void storeByHash(String contentHash, Path sourceFile) throws IOException {
        Path target = resolveByHash(contentHash);
        if (Files.exists(target)) {
            return;
        }
        Files.copy(sourceFile, target, StandardCopyOption.REPLACE_EXISTING);
    }

    /** Computes the SHA-256 hash of a file as lowercase hex. */
    public String hashFile(Path sourceFile) throws IOException {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            try (InputStream in = Files.newInputStream(sourceFile);
                 DigestInputStream dis = new DigestInputStream(in, digest)) {
                byte[] buffer = new byte[8192];
                while (dis.read(buffer) != -1) {
                    // just drain
                }
            }
            return HexFormat.of().formatHex(digest.digest());
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 not available", e);
        }
    }

    public Path resolveByHash(String contentHash) {
        return Path.of(storageDir, contentHash);
    }

    public Path resolveById(String imageId) {
        return Path.of(storageDir, imageId);
    }

    public Path resolveForRecord(PadImage record) {
        return record.contentHash != null
                ? resolveByHash(record.contentHash)
                : resolveById(record.imageId);
    }

    /**
     * Deletes the on-disk file for a record only if no other PadImage references it.
     * Must be called while the record still exists in the DB (or just after, provided
     * the count query correctly excludes it).
     */
    public void deleteForRecord(PadImage record) {
        try {
            if (record.contentHash != null) {
                long otherRefs = PadImage.count(
                        "contentHash = ?1 and imageId <> ?2",
                        record.contentHash,
                        record.imageId
                );
                if (otherRefs == 0) {
                    Files.deleteIfExists(resolveByHash(record.contentHash));
                }
            } else {
                Files.deleteIfExists(resolveById(record.imageId));
            }
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    /** Returns the total bytes actually occupied on disk in the storage directory. */
    public long totalBytesOnDisk() {
        Path dir = Path.of(storageDir);
        if (!Files.exists(dir)) {
            return 0L;
        }
        try (var stream = Files.list(dir)) {
            return stream
                    .filter(Files::isRegularFile)
                    .mapToLong(p -> {
                        try {
                            return Files.size(p);
                        } catch (IOException e) {
                            return 0L;
                        }
                    })
                    .sum();
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }
}
