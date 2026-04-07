package com.capypad.pad;

import jakarta.annotation.PostConstruct;
import jakarta.enterprise.context.ApplicationScoped;
import org.eclipse.microprofile.config.inject.ConfigProperty;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;

@ApplicationScoped
public class ImageStorageService {

    @ConfigProperty(name = "capypad.image.storage-dir", defaultValue = "./data/images")
    String storageDir;

    @PostConstruct
    void init() {
        try {
            Files.createDirectories(Path.of(storageDir));
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    public void store(String imageId, InputStream data) throws IOException {
        Files.copy(data, resolve(imageId), StandardCopyOption.REPLACE_EXISTING);
    }

    public Path resolve(String imageId) {
        return Path.of(storageDir, imageId);
    }

    public void delete(String imageId) {
        try {
            Files.deleteIfExists(resolve(imageId));
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }
}
