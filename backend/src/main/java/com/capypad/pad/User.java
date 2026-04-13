package com.capypad.pad;

import io.quarkus.hibernate.orm.panache.PanacheEntity;
import jakarta.persistence.*;

import java.util.Optional;

@Entity
@Table(name = "capyuser")
public class User extends PanacheEntity {

    @Column(unique = true, nullable = false)
    public String username;

    @Column(nullable = false)
    public String passwordHash;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    public Role role;

    @Column(nullable = false, columnDefinition = "boolean default true")
    public boolean approved = false;

    @Column(nullable = false, columnDefinition = "boolean default false")
    public boolean mustChangePassword = false;

    public static Optional<User> findByUsername(String username) {
        return find("username", username).firstResultOptional();
    }
}
