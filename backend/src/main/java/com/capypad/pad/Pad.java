package com.capypad.pad;

import io.quarkus.hibernate.orm.panache.PanacheEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Lob;

@Entity
public class Pad extends PanacheEntity {

    @Column(unique = true, nullable = false)
    public String path;

    @Lob
    @Column(columnDefinition = "TEXT")
    public String content;

    public static Pad findByPath(String path) {
        return find("path", path).firstResult();
    }
}
