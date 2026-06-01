package com.capypad.pad.service;

import com.capypad.pad.dto.AdminCreateUserRequest;
import com.capypad.pad.dto.AdminCreateUserResponse;
import com.capypad.pad.dto.CreateUserRequest;
import com.capypad.pad.dto.UserSummary;
import com.capypad.pad.model.Role;
import com.capypad.pad.model.User;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.enterprise.context.control.ActivateRequestContext;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.transaction.Transactional;
import jakarta.ws.rs.BadRequestException;
import jakarta.ws.rs.NotFoundException;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.jboss.logging.Logger;
import org.keycloak.admin.client.Keycloak;
import jakarta.inject.Inject;

import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.Collections;
import java.util.List;
import java.util.Optional;

@ApplicationScoped
public class UserService {

    private static final Logger LOG = Logger.getLogger(UserService.class);
    private static final String PASSWORD_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    private static final int GENERATED_PASSWORD_LENGTH = 12;
    private static final SecureRandom RANDOM = new SecureRandom();
    private static final ObjectMapper MAPPER = new ObjectMapper();

    @Inject
    Keycloak keycloakAdmin;

    @ConfigProperty(name = "quarkus.oidc.auth-server-url")
    String oidcAuthServerUrl;

    @ConfigProperty(name = "quarkus.oidc.client-id")
    String keycloakClientId;

    @ConfigProperty(name = "quarkus.oidc.credentials.secret")
    String keycloakClientSecret;

    // ── Token Exchange (Authorization Code + PKCE) ──────────────────

    /**
     * Response from Keycloak token endpoint.
     */
    public record TokenResponse(String accessToken, String refreshToken, String idToken, int expiresIn) {}

    /**
     * Exchanges an authorization code for tokens using PKCE.
     * Uses Jackson ObjectMapper instead of String.split for safe JSON parsing.
     */
    public Optional<TokenResponse> exchangeCodeForToken(String code, String codeVerifier, String redirectUri) {
        try {
            HttpClient client = HttpClient.newHttpClient();
            String tokenUrl = oidcAuthServerUrl + "/protocol/openid-connect/token";
            String form = "grant_type=authorization_code"
                    + "&client_id=" + encode(keycloakClientId)
                    + "&client_secret=" + encode(keycloakClientSecret)
                    + "&code=" + encode(code)
                    + "&redirect_uri=" + encode(redirectUri)
                    + "&code_verifier=" + encode(codeVerifier);

            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(tokenUrl))
                    .header("Content-Type", "application/x-www-form-urlencoded")
                    .POST(HttpRequest.BodyPublishers.ofString(form))
                    .build();

            HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());

            if (response.statusCode() == 200) {
                JsonNode json = MAPPER.readTree(response.body());
                return Optional.of(new TokenResponse(
                        json.get("access_token").asText(),
                        json.has("refresh_token") ? json.get("refresh_token").asText() : null,
                        json.has("id_token") ? json.get("id_token").asText() : null,
                        json.has("expires_in") ? json.get("expires_in").asInt() : 300
                ));
            } else {
                JsonNode errorJson = MAPPER.readTree(response.body());
                String errorType = errorJson.has("error") ? errorJson.get("error").asText() : "unknown";
                String errorDesc = errorJson.has("error_description") ? errorJson.get("error_description").asText() : "";
                LOG.errorf("Token exchange failed: %s - %s (status %d)", errorType, errorDesc, response.statusCode());
            }
        } catch (Exception e) {
            LOG.errorf(e, "Token exchange threw exception");
        }
        return Optional.empty();
    }

    /**
     * Exchanges a refresh token for a fresh set of tokens.
     * Keycloak rotates the refresh token, so the response usually carries a new one;
     * if it doesn't, we fall back to reusing the provided refresh token.
     */
    public Optional<TokenResponse> refreshAccessToken(String refreshToken) {
        try {
            HttpClient client = HttpClient.newHttpClient();
            String tokenUrl = oidcAuthServerUrl + "/protocol/openid-connect/token";
            String form = "grant_type=refresh_token"
                    + "&client_id=" + encode(keycloakClientId)
                    + "&client_secret=" + encode(keycloakClientSecret)
                    + "&refresh_token=" + encode(refreshToken);

            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(tokenUrl))
                    .header("Content-Type", "application/x-www-form-urlencoded")
                    .POST(HttpRequest.BodyPublishers.ofString(form))
                    .build();

            HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());

            if (response.statusCode() == 200) {
                JsonNode json = MAPPER.readTree(response.body());
                return Optional.of(new TokenResponse(
                        json.get("access_token").asText(),
                        json.has("refresh_token") ? json.get("refresh_token").asText() : refreshToken,
                        json.has("id_token") ? json.get("id_token").asText() : null,
                        json.has("expires_in") ? json.get("expires_in").asInt() : 300
                ));
            } else {
                JsonNode errorJson = MAPPER.readTree(response.body());
                String errorType = errorJson.has("error") ? errorJson.get("error").asText() : "unknown";
                LOG.warnf("Token refresh failed: %s (status %d)", errorType, response.statusCode());
            }
        } catch (Exception e) {
            LOG.errorf(e, "Token refresh threw exception");
        }
        return Optional.empty();
    }

    /**
     * Extracts the preferred_username from a JWT access token.
     * Decodes the payload (middle part) without signature verification
     * (Quarkus OIDC will verify the signature separately).
     */
    public String extractUsername(String accessToken) {
        try {
            String[] parts = accessToken.split("\\.");
            if (parts.length < 2) return null;
            byte[] decoded = Base64.getUrlDecoder().decode(parts[1]);
            JsonNode payload = MAPPER.readTree(decoded);
            return payload.has("preferred_username") ? payload.get("preferred_username").asText() : null;
        } catch (Exception e) {
            return null;
        }
    }

    // ── Local User Management ───────────────────────────────────────

    /**
     * Ensures a local User record exists for the given Keycloak username.
     * If the user doesn't exist locally, creates one with approved=false.
     * This handles the "first login after Keycloak registration" case.
     */
    @Transactional
    public User ensureLocalUser(String username) {
        String normalized = username.toLowerCase().trim();
        Optional<User> existing = User.findByUsername(normalized);
        if (existing.isPresent()) {
            return existing.get();
        }

        // First time this Keycloak user is seen — create local record
        User user = new User();
        user.username = normalized;
        user.role = Role.USER;
        user.approved = false; // Requires admin approval
        user.persist();
        return user;
    }

    @Transactional
    public UserSummary createUser(CreateUserRequest req) {
        String username = req.username().toLowerCase().trim();
        if (username.isBlank()) {
            throw new BadRequestException("Username cannot be blank");
        }
        if (req.password() == null || req.password().length() < 6) {
            throw new BadRequestException("Password must be at least 6 characters");
        }
        if (User.findByUsername(username).isPresent()) {
            throw new BadRequestException("Username already exists");
        }

        Role role;
        try {
            role = req.role() != null ? Role.valueOf(req.role().toUpperCase()) : Role.USER;
        } catch (IllegalArgumentException e) {
            throw new BadRequestException("Invalid role: " + req.role());
        }

        User user = new User();
        user.username = username;
        user.role = role;
        user.approved = true;
        user.persist();

        createInKeycloak(username, req.password(), true);

        return toSummary(user);
    }

    @Transactional
    public AdminCreateUserResponse createUserByAdmin(AdminCreateUserRequest req) {
        String username = req.username() != null ? req.username().toLowerCase().trim() : "";
        if (username.isBlank()) {
            throw new BadRequestException("Username cannot be blank");
        }
        if (User.findByUsername(username).isPresent()) {
            throw new BadRequestException("Username already exists");
        }

        Role role;
        try {
            role = req.role() != null ? Role.valueOf(req.role().toUpperCase()) : Role.USER;
        } catch (IllegalArgumentException e) {
            throw new BadRequestException("Invalid role: " + req.role());
        }

        String generatedPassword = generatePassword();

        User user = new User();
        user.username = username;
        user.role = role;
        user.approved = true;
        user.persist();

        createInKeycloak(username, generatedPassword, true);

        return new AdminCreateUserResponse(user.username, user.role.name(), generatedPassword);
    }

    @Transactional
    public UserSummary approveUser(Long id) {
        User user = User.<User>findByIdOptional(id)
                .orElseThrow(() -> new NotFoundException("User not found"));
        user.approved = true;
        user.persist();

        // Enable in Keycloak if disabled and ensure the expected realm role exists.
        try {
            List<org.keycloak.representations.idm.UserRepresentation> users =
                keycloakAdmin.realm("capypad").users().search(user.username);
            if (!users.isEmpty()) {
                org.keycloak.representations.idm.UserRepresentation userRep = users.get(0);
                if (!userRep.isEnabled()) {
                    userRep.setEnabled(true);
                    keycloakAdmin.realm("capypad").users().get(userRep.getId()).update(userRep);
                }
                assignRealmRoleIfMissing(userRep.getId(), user.role.name());
            }
        } catch (Exception e) {
            System.err.println("[CAPYPAD] Failed to enable user in Keycloak: " + e.getClass().getSimpleName());
        }

        return toSummary(user);
    }

    @ActivateRequestContext
    @Transactional
    public UserSummary createAdmin(String username, String password) {
        return createUser(new CreateUserRequest(username, password, Role.ADMIN.name()));
    }

    public List<UserSummary> listUsers() {
        return User.<User>listAll().stream()
                .map(this::toSummary)
                .toList();
    }

    @Transactional
    public void deleteUser(Long id, String requestingUsername) {
        User user = User.<User>findByIdOptional(id)
                .orElseThrow(() -> new NotFoundException("User not found"));
        if (user.username.equals(requestingUsername)) {
            throw new BadRequestException("Cannot delete your own account");
        }

        // Delete from Keycloak first
        try {
            List<org.keycloak.representations.idm.UserRepresentation> kcUsers =
                keycloakAdmin.realm("capypad").users().search(user.username);
            for (org.keycloak.representations.idm.UserRepresentation kcUser : kcUsers) {
                if (kcUser.getUsername().equalsIgnoreCase(user.username)) {
                    keycloakAdmin.realm("capypad").users().get(kcUser.getId()).remove();
                }
            }
        } catch (Exception e) {
            System.err.println("[CAPYPAD] Failed to delete user from Keycloak: " + e.getClass().getSimpleName());
        }

        user.delete();
    }

    @Transactional
    public Optional<String> findApprovedUserRole(String username) {
        return User.findByUsername(username != null ? username.toLowerCase() : "")
                .filter(u -> u.approved)
                .map(u -> u.role.name());
    }

    // ── Keycloak Admin helpers ──────────────────────────────────────

    private void createInKeycloak(String username, String password, boolean enabled) {
        createInKeycloak(username, password, enabled, "USER");
    }

    private void createInKeycloak(String username, String password, boolean enabled, String roleName) {
        org.keycloak.representations.idm.UserRepresentation userRep = new org.keycloak.representations.idm.UserRepresentation();
        userRep.setUsername(username);
        userRep.setEnabled(enabled);
        userRep.setEmailVerified(true);
        userRep.setFirstName(username);
        userRep.setLastName(username);
        userRep.setEmail(username + "@capypad.local");

        org.keycloak.representations.idm.CredentialRepresentation cred = new org.keycloak.representations.idm.CredentialRepresentation();
        cred.setType(org.keycloak.representations.idm.CredentialRepresentation.PASSWORD);
        cred.setValue(password);
        cred.setTemporary(false);

        userRep.setCredentials(List.of(cred));

        try (jakarta.ws.rs.core.Response response = keycloakAdmin.realm("capypad").users().create(userRep)) {
            if (response.getStatus() != 201) {
                throw new BadRequestException("Failed to create user in Keycloak (Status " + response.getStatus() + ")");
            }
        } catch (BadRequestException e) {
            throw e;
        } catch (Exception e) {
            throw new BadRequestException("Keycloak connection error: " + e.getMessage(), e);
        }

        // Assign realm role
        try {
            List<org.keycloak.representations.idm.UserRepresentation> created =
                keycloakAdmin.realm("capypad").users().search(username);
            if (!created.isEmpty()) {
                String userId = created.get(0).getId();
                assignRealmRoleIfMissing(userId, roleName);
            }
        } catch (Exception e) {
            System.err.println("[CAPYPAD] Failed to assign role '" + roleName + "' to user '" + username + "': " + e.getClass().getSimpleName());
        }
    }

    public void ensureKeycloakUserRole(String username, Role role) {
        try {
            List<org.keycloak.representations.idm.UserRepresentation> users =
                keycloakAdmin.realm("capypad").users().search(username);
            for (org.keycloak.representations.idm.UserRepresentation userRep : users) {
                if (userRep.getUsername() != null && userRep.getUsername().equalsIgnoreCase(username)) {
                    assignRealmRoleIfMissing(userRep.getId(), role.name());
                    return;
                }
            }
        } catch (Exception e) {
            System.err.println("[CAPYPAD] Failed to ensure role '" + role.name() + "' for user '" + username + "': " + e.getClass().getSimpleName());
        }
    }

    private void assignRealmRoleIfMissing(String userId, String roleName) {
        var userRolesApi = keycloakAdmin.realm("capypad").users().get(userId).roles().realmLevel();
        boolean hasRole = userRolesApi.listAll().stream().anyMatch(r -> roleName.equalsIgnoreCase(r.getName()));
        if (!hasRole) {
            org.keycloak.representations.idm.RoleRepresentation role =
                keycloakAdmin.realm("capypad").roles().get(roleName).toRepresentation();
            userRolesApi.add(Collections.singletonList(role));
        }
    }

    // ── Utilities ───────────────────────────────────────────────────

    private UserSummary toSummary(User user) {
        return new UserSummary(user.id, user.username, user.role.name(), user.approved);
    }

    private String generatePassword() {
        StringBuilder sb = new StringBuilder(GENERATED_PASSWORD_LENGTH);
        for (int i = 0; i < GENERATED_PASSWORD_LENGTH; i++) {
            sb.append(PASSWORD_CHARS.charAt(RANDOM.nextInt(PASSWORD_CHARS.length())));
        }
        return sb.toString();
    }

    private String encode(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8);
    }
}
