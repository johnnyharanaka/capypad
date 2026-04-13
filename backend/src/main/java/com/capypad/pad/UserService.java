package com.capypad.pad;

import com.capypad.pad.dto.AdminCreateUserRequest;
import com.capypad.pad.dto.AdminCreateUserResponse;
import com.capypad.pad.dto.CreateUserRequest;
import com.capypad.pad.dto.LoginResponse;
import com.capypad.pad.dto.RegisterRequest;
import com.capypad.pad.dto.UserSummary;
import io.quarkus.elytron.security.common.BcryptUtil;
import io.smallrye.jwt.build.Jwt;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.transaction.Transactional;
import jakarta.ws.rs.BadRequestException;
import jakarta.ws.rs.NotFoundException;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.keycloak.admin.client.Keycloak;
import jakarta.inject.Inject;

import java.security.SecureRandom;
import java.time.Duration;
import java.util.List;
import java.util.Optional;
import java.util.Set;

@ApplicationScoped
public class UserService {

    private static final String PASSWORD_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    private static final int GENERATED_PASSWORD_LENGTH = 12;
    private static final SecureRandom RANDOM = new SecureRandom();

    @Inject
    Keycloak keycloakAdmin;

    @ConfigProperty(name = "quarkus.oidc.auth-server-url")
    String keycloakUrl;

    @ConfigProperty(name = "quarkus.oidc.client-id")
    String keycloakClientId;

    @ConfigProperty(name = "quarkus.oidc.credentials.secret")
    String keycloakClientSecret;

    public Optional<LoginResponse> login(String username, String password) {
        Optional<User> optUser = User.findByUsername(username.toLowerCase());
        if (optUser.isEmpty() || !optUser.get().approved) {
            return Optional.empty();
        }

        User user = optUser.get();

        // Check if user must change password (admin-created accounts)
        if (user.mustChangePassword) {
            // Verify the temporary password is correct before asking them to change
            if (BcryptUtil.matches(password, user.passwordHash)) {
                // Return a sentinel response that AuthResource will interpret
                return Optional.of(new LoginResponse("UPDATE_PASSWORD_REQUIRED", user.username, user.role.name()));
            }
            return Optional.empty();
        }

        return proxyKeycloakLogin(username, password)
                .map(token -> new LoginResponse(token, user.username, user.role.name()));
    }

    private Optional<String> proxyKeycloakLogin(String username, String password) {
        try {
            java.net.http.HttpClient client = java.net.http.HttpClient.newHttpClient();
            String form = "client_id=" + java.net.URLEncoder.encode(keycloakClientId, "UTF-8") +
                          "&client_secret=" + java.net.URLEncoder.encode(keycloakClientSecret, "UTF-8") +
                          "&grant_type=password" +
                          "&username=" + java.net.URLEncoder.encode(username, "UTF-8") +
                          "&password=" + java.net.URLEncoder.encode(password, "UTF-8");

            java.net.http.HttpRequest request = java.net.http.HttpRequest.newBuilder()
                    .uri(java.net.URI.create(keycloakUrl + "/protocol/openid-connect/token"))
                    .header("Content-Type", "application/x-www-form-urlencoded")
                    .POST(java.net.http.HttpRequest.BodyPublishers.ofString(form))
                    .build();

            java.net.http.HttpResponse<String> response = client.send(request, java.net.http.HttpResponse.BodyHandlers.ofString());

            if (response.statusCode() == 200) {
                String body = response.body();
                String accessToken = body.split("\"access_token\":\"")[1].split("\"")[0];
                return Optional.of(accessToken);
            } else {
                System.err.println("[CAPYPAD-DEBUG] Keycloak ROPC login failed for user '" + username + "' — Status: " + response.statusCode() + " Body: " + response.body());
            }
        } catch (Exception e) {
            System.err.println("[CAPYPAD-DEBUG] Keycloak ROPC exception: " + e.getMessage());
            e.printStackTrace();
        }
        return Optional.empty();
    }

    @Transactional
    public Optional<LoginResponse> updatePassword(String username, String oldPassword, String newPassword) {
        User user = User.findByUsername(username.toLowerCase())
                .orElseThrow(() -> new jakarta.ws.rs.WebApplicationException(
                    jakarta.ws.rs.core.Response.status(404).entity("{\"error\":\"User not found\"}").build()));

        if (!BcryptUtil.matches(oldPassword, user.passwordHash)) {
            throw new jakarta.ws.rs.WebApplicationException(
                jakarta.ws.rs.core.Response.status(401).entity("{\"error\":\"Invalid old password\"}").build());
        }

        // Update password locally
        user.passwordHash = BcryptUtil.bcryptHash(newPassword);
        user.mustChangePassword = false;
        user.persist();

        // Update password in Keycloak (or create user if missing)
        try {
            java.util.List<org.keycloak.representations.idm.UserRepresentation> users = 
                keycloakAdmin.realm("capypad").users().search(username);
            
            if (!users.isEmpty()) {
                // Delete the old Keycloak user and recreate with new password
                // This is the only reliable way to clear required actions from ROPC
                String userId = users.get(0).getId();
                keycloakAdmin.realm("capypad").users().get(userId).remove();
                System.out.println("[CAPYPAD-DEBUG] Deleted old Keycloak user '" + username + "'");
            }
            // Create fresh user in Keycloak with the new password (no temporary flag)
            createInKeycloak(username, newPassword, true);
            System.out.println("[CAPYPAD-DEBUG] Recreated Keycloak user '" + username + "' with permanent password");

            // Diagnose: fetch the user back and check state
            java.util.List<org.keycloak.representations.idm.UserRepresentation> created =
                keycloakAdmin.realm("capypad").users().search(username);
            if (!created.isEmpty()) {
                org.keycloak.representations.idm.UserRepresentation u = keycloakAdmin.realm("capypad").users().get(created.get(0).getId()).toRepresentation();
                System.out.println("[CAPYPAD-DEBUG] User '" + username + "' requiredActions: " + u.getRequiredActions());
                System.out.println("[CAPYPAD-DEBUG] User '" + username + "' enabled: " + u.isEnabled());
                System.out.println("[CAPYPAD-DEBUG] User '" + username + "' emailVerified: " + u.isEmailVerified());

                // Force-clear any required actions
                if (u.getRequiredActions() != null && !u.getRequiredActions().isEmpty()) {
                    System.out.println("[CAPYPAD-DEBUG] Force-clearing " + u.getRequiredActions().size() + " required actions");
                    u.setRequiredActions(java.util.Collections.emptyList());
                    keycloakAdmin.realm("capypad").users().get(created.get(0).getId()).update(u);

                    // Verify
                    org.keycloak.representations.idm.UserRepresentation verify = keycloakAdmin.realm("capypad").users().get(created.get(0).getId()).toRepresentation();
                    System.out.println("[CAPYPAD-DEBUG] After clear, requiredActions: " + verify.getRequiredActions());
                }
            }
        } catch (Exception e) {
            e.printStackTrace();
            // Password was updated locally, Keycloak sync failed — log but don't block
        }

        // Now login with the new password
        return proxyKeycloakLogin(username, newPassword)
                .map(token -> new LoginResponse(token, user.username, user.role.name()));
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
        user.passwordHash = BcryptUtil.bcryptHash(req.password());
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
        user.passwordHash = BcryptUtil.bcryptHash(generatedPassword);
        user.role = role;
        user.approved = true;
        user.mustChangePassword = true;
        user.persist();

        createInKeycloak(username, generatedPassword, true);

        return new AdminCreateUserResponse(user.username, user.role.name(), generatedPassword);
    }

    /**
     * Public self-registration — user starts as not approved.
     */
    @Transactional
    public UserSummary registerUser(RegisterRequest req) {
        String username = req.username() != null ? req.username().toLowerCase().trim() : "";
        if (username.isBlank()) {
            throw new BadRequestException("Username cannot be blank");
        }
        if (req.password() == null || req.password().length() < 6) {
            throw new BadRequestException("Password must be at least 6 characters");
        }
        if (User.findByUsername(username).isPresent()) {
            throw new BadRequestException("Username already exists");
        }

        User user = new User();
        user.username = username;
        // Save the raw password temporarily so we can send it to Keycloak upon approval!
        // IN A NORMAL SCENARIO this is dangerous, but since it's a proxy...
        // Wait, saving raw password violates basic security rules.
        // If we only proxy on approval, Keycloak MUST be the one generating passwords or we drop ROPC registration!
        // Actually, let's keep bcrypt and use the generated admin password instead, or send them an email?
        // Since it's a user requested proxy, we NEED the password to create them in Keycloak later!
        // Wait... If the user registered their password, and we save only a hash, we CANNOT send the plain password to Keycloak Admin API later.
        // Therefore, we MUST create the user in Keycloak immediately upon registration, but WITHOUT any Roles, or DISABLED!
        user.passwordHash = BcryptUtil.bcryptHash(req.password());
        user.role = Role.USER;
        user.approved = false;
        user.persist();

        user.persist();

        // Create in Keycloak as DISABLED, not temporary since user chose it
        createInKeycloak(username, req.password(), false);

        return toSummary(user);
    }

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
                throw new jakarta.ws.rs.BadRequestException("Failed to create user in Keycloak (Status " + response.getStatus() + ")");
            }
        } catch (jakarta.ws.rs.BadRequestException e) {
            throw e;
        } catch (Exception e) {
            throw new jakarta.ws.rs.BadRequestException("Keycloak connection error: " + e.getMessage(), e);
        }

        // Assign realm role
        try {
            java.util.List<org.keycloak.representations.idm.UserRepresentation> created =
                keycloakAdmin.realm("capypad").users().search(username);
            if (!created.isEmpty()) {
                String userId = created.get(0).getId();
                org.keycloak.representations.idm.RoleRepresentation role =
                    keycloakAdmin.realm("capypad").roles().get(roleName).toRepresentation();
                keycloakAdmin.realm("capypad").users().get(userId).roles().realmLevel()
                    .add(java.util.Collections.singletonList(role));
            }
        } catch (Exception e) {
            System.err.println("[CAPYPAD-DEBUG] Failed to assign role '" + roleName + "' to user '" + username + "': " + e.getMessage());
        }
    }

    @Transactional
    public UserSummary approveUser(Long id) {
        User user = User.<User>findByIdOptional(id)
                .orElseThrow(() -> new NotFoundException("User not found"));
        user.approved = true;
        user.persist();

        // ENABLE IN KEYCLOAK
        try {
            List<org.keycloak.representations.idm.UserRepresentation> users =
                keycloakAdmin.realm("capypad").users().search(user.username);
            if (!users.isEmpty()) {
                org.keycloak.representations.idm.UserRepresentation userRep = users.get(0);
                userRep.setEnabled(true);
                keycloakAdmin.realm("capypad").users().get(userRep.getId()).update(userRep);
            }
        } catch (Exception e) {
            e.printStackTrace();
        }

        return toSummary(user);
    }

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
            java.util.List<org.keycloak.representations.idm.UserRepresentation> kcUsers =
                keycloakAdmin.realm("capypad").users().search(user.username);
            for (org.keycloak.representations.idm.UserRepresentation kcUser : kcUsers) {
                if (kcUser.getUsername().equalsIgnoreCase(user.username)) {
                    keycloakAdmin.realm("capypad").users().get(kcUser.getId()).remove();
                }
            }
        } catch (Exception e) {
            e.printStackTrace();
        }

        user.delete();
    }

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

    @Transactional
    public Optional<String> findApprovedUserRole(String username) {
        return User.findByUsername(username != null ? username.toLowerCase() : "")
                .filter(u -> u.approved)
                .map(u -> u.role.name());
    }
}
