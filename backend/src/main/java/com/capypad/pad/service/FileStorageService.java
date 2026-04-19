package com.capypad.pad.service;

import com.capypad.pad.model.PadFile;
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
public class FileStorageService {

    @ConfigProperty(name = "capypad.file.storage-dir", defaultValue = "./data/files")
    public String storageDir;

    @PostConstruct
    void init() {
        try {
            Files.createDirectories(Path.of(storageDir));
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    public void storeByHash(String contentHash, Path sourceFile) throws IOException {
        Path target = resolveByHash(contentHash);
        if (Files.exists(target)) {
            return;
        }
        Files.copy(sourceFile, target, StandardCopyOption.REPLACE_EXISTING);
    }

    public String hashFile(Path sourceFile) throws IOException {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            try (InputStream in = Files.newInputStream(sourceFile);
                 DigestInputStream dis = new DigestInputStream(in, digest)) {
                byte[] buffer = new byte[8192];
                while (dis.read(buffer) != -1) {
                    // drain
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

    public Path resolveById(String fileId) {
        return Path.of(storageDir, fileId);
    }

    public Path resolveForRecord(PadFile record) {
        return record.contentHash != null
                ? resolveByHash(record.contentHash)
                : resolveById(record.fileId);
    }

    public void deleteForRecord(PadFile record) {
        try {
            if (record.contentHash != null) {
                long otherRefs = PadFile.count(
                        "contentHash = ?1 and fileId <> ?2",
                        record.contentHash,
                        record.fileId
                );
                if (otherRefs == 0) {
                    Files.deleteIfExists(resolveByHash(record.contentHash));
                }
            } else {
                Files.deleteIfExists(resolveById(record.fileId));
            }
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

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
