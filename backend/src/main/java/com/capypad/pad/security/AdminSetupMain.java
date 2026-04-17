package com.capypad.pad.security;

import com.capypad.pad.service.UserService;
import io.quarkus.runtime.Quarkus;
import io.quarkus.runtime.QuarkusApplication;
import io.quarkus.runtime.annotations.QuarkusMain;
import jakarta.inject.Inject;
import org.eclipse.microprofile.config.inject.ConfigProperty;

import java.util.Optional;

@QuarkusMain
public class AdminSetupMain implements QuarkusApplication {

    @Inject
    UserService userService;

    @ConfigProperty(name = "admin.setup", defaultValue = "false")
    boolean adminSetup;

    @ConfigProperty(name = "admin.username")
    Optional<String> adminUsername;

    @ConfigProperty(name = "admin.password")
    Optional<String> adminPassword;

    @Override
    public int run(String... args) throws Exception {
        if (adminSetup) {
            String username = adminUsername.orElseThrow(() ->
                    new IllegalStateException("ADMIN_USERNAME env var is required when ADMIN_SETUP=true"));
            String password = adminPassword.orElseThrow(() ->
                    new IllegalStateException("ADMIN_PASSWORD env var is required when ADMIN_SETUP=true"));

            try {
                userService.createAdmin(username, password);
                System.out.println("[capypad] Admin criado com sucesso: " + username);
            } catch (Exception e) {
                System.err.println("[capypad] Erro ao criar admin: " + e.getMessage());
                return 1;
            }

            Quarkus.asyncExit(0);
        } else {
            Quarkus.waitForExit();
        }

        return 0;
    }
}
