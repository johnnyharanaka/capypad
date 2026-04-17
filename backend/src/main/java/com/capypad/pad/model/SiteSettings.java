package com.capypad.pad.model;

import io.quarkus.hibernate.orm.panache.PanacheEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

@Entity
@Table(name = "site_settings")
public class SiteSettings extends PanacheEntity {

    @Column(name = "maintenance_mode", nullable = false)
    public boolean maintenanceMode = false;

    @Column(name = "block_files", nullable = false)
    public boolean blockFiles = false;

    @Column(name = "cleanup_max_age_days", nullable = false)
    public int cleanupMaxAgeDays = 30;

    public static SiteSettings get() {
        return findAll().firstResult();
    }
}
