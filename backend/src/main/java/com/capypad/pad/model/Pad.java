package com.capypad.pad.model;

import io.quarkus.hibernate.orm.panache.PanacheEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Lob;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import java.time.Instant;

@Entity
public class Pad extends PanacheEntity {

    @Column(unique = true, nullable = false)
    public String path;

    @Lob
    @Column(columnDefinition = "TEXT")
    public String content;

    @Column(name = "updated_at", nullable = false)
    public Instant updatedAt;

    @Column(name = "last_edited_by")
    public String lastEditedBy;

    @Column(name = "claimed_by")
    public String claimedBy;

    @PrePersist
    @PreUpdate
    void touchTimestamp() {
        updatedAt = Instant.now();
    }

    public static Pad findByPath(String path) {
        return find("path", path).firstResult();
    }

    public static long deleteOlderThan(Instant cutoff) {
        return delete("updatedAt < ?1", cutoff);
    }
}
