package com.capypad.pad.model;

import io.quarkus.hibernate.orm.panache.PanacheEntity;
import jakarta.persistence.*;

import java.util.Optional;

@Entity
@Table(name = "capyuser")
public class User extends PanacheEntity {

    @Column(unique = true, nullable = false)
    public String username;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    public Role role;

    @Column(nullable = false, columnDefinition = "boolean default true")
    public boolean approved = false;

    public static Optional<User> findByUsername(String username) {
        return find("username", username).firstResultOptional();
    }
}
