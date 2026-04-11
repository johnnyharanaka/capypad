package com.capypad.pad;

import io.quarkus.hibernate.orm.panache.PanacheEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.PrePersist;
import java.time.Instant;
import java.util.List;

@Entity
public class PadImage extends PanacheEntity {

    @Column(unique = true, nullable = false)
    public String imageId;

    @Column(nullable = false)
    public String padPath;

    @Column(nullable = false)
    public String contentType;

    @Column(nullable = false)
    public String filename;

    @Column(name = "file_size_bytes")
    public Long fileSizeBytes;

    @Column(name = "content_hash", length = 64)
    public String contentHash;

    @Column(name = "created_at", nullable = false)
    public Instant createdAt;

    @PrePersist
    void setCreatedAt() {
        createdAt = Instant.now();
    }

    public static PadImage findByImageId(String imageId) {
        return find("imageId", imageId).firstResult();
    }

    public static List<PadImage> findByPadPath(String padPath) {
        return list("padPath", padPath);
    }

    public static long deleteByPadPath(String padPath) {
        return delete("padPath", padPath);
    }

    public static long countByPadPath(String padPath) {
        return count("padPath", padPath);
    }

    public static long totalSizeByPadPath(String padPath) {
        Long result = getEntityManager()
                .createQuery("select coalesce(sum(pi.fileSizeBytes), 0) from PadImage pi where pi.padPath = :padPath", Long.class)
                .setParameter("padPath", padPath)
                .getSingleResult();
        return result == null ? 0L : result;
    }
}
