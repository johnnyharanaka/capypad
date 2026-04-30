package com.capypad.pad;

import com.capypad.pad.model.Role;
import com.capypad.pad.model.User;
import com.capypad.pad.service.UserService;
import io.quarkus.test.junit.QuarkusTest;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;
import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

@QuarkusTest
class UserServiceTest {

    @Inject
    UserService userService;

    /** Builds a fake JWT (header.payload.signature) — only the payload is read. */
    private static String fakeJwt(String preferredUsername) {
        String header = base64Url("{\"alg\":\"none\"}");
        String payload = preferredUsername == null
                ? base64Url("{}")
                : base64Url("{\"preferred_username\":\"" + preferredUsername + "\"}");
        return header + "." + payload + ".sig";
    }

    private static String base64Url(String s) {
        return Base64.getUrlEncoder().withoutPadding()
                .encodeToString(s.getBytes(StandardCharsets.UTF_8));
    }

    @Test
    void extractUsernameDecodesPreferredUsername() {
        assertEquals("alice", userService.extractUsername(fakeJwt("alice")));
    }

    @Test
    void extractUsernameReturnsNullForInvalidToken() {
        assertNull(userService.extractUsername("not-a-jwt"));
        assertNull(userService.extractUsername(""));
    }

    @Test
    void extractUsernameReturnsNullWhenClaimMissing() {
        assertNull(userService.extractUsername(fakeJwt(null)));
    }

    @Test
    @Transactional
    void ensureLocalUserCreatesUnapprovedRecordOnFirstSeen() {
        String username = "newcomer-" + UUID.randomUUID().toString().substring(0, 8);
        User u = userService.ensureLocalUser(username);

        assertEquals(username.toLowerCase(), u.username);
        assertEquals(Role.USER, u.role);
        assertFalse(u.approved, "new users must require admin approval");
    }

    @Test
    @Transactional
    void ensureLocalUserIsIdempotent() {
        String username = "repeat-" + UUID.randomUUID().toString().substring(0, 8);
        User first = userService.ensureLocalUser(username);
        User second = userService.ensureLocalUser(username);
        assertEquals(first.id, second.id);
    }

    @Test
    @Transactional
    void findApprovedUserRoleReturnsRoleOnlyForApproved() {
        String approvedName = "approved-" + UUID.randomUUID().toString().substring(0, 8);
        String pendingName = "pending-" + UUID.randomUUID().toString().substring(0, 8);

        User approved = new User();
        approved.username = approvedName;
        approved.role = Role.ADMIN;
        approved.approved = true;
        approved.persist();

        User pending = new User();
        pending.username = pendingName;
        pending.role = Role.USER;
        pending.approved = false;
        pending.persist();

        Optional<String> approvedRole = userService.findApprovedUserRole(approvedName);
        assertTrue(approvedRole.isPresent());
        assertEquals("ADMIN", approvedRole.get());

        // Unapproved users do not yield a role.
        assertTrue(userService.findApprovedUserRole(pendingName).isEmpty());
        // Unknown users do not yield a role either.
        assertTrue(userService.findApprovedUserRole("does-not-exist").isEmpty());
    }
}
