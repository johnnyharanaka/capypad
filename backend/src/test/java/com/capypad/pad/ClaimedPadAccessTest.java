package com.capypad.pad;

import com.capypad.pad.model.Pad;
import io.quarkus.test.junit.QuarkusTest;
import io.quarkus.test.security.TestSecurity;
import jakarta.transaction.Transactional;
import org.junit.jupiter.api.Test;

import java.util.UUID;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.is;

@QuarkusTest
class ClaimedPadAccessTest {

    @Transactional
    void seedClaimedPad(String path, String owner) {
        Pad pad = new Pad();
        pad.path = path;
        pad.content = "owner content";
        pad.lastEditedBy = owner;
        pad.claimedBy = owner;
        pad.persist();
    }

    @Test
    void anonymousCannotEditClaimedPad() {
        String path = "claimed-" + UUID.randomUUID().toString().substring(0, 8);
        seedClaimedPad(path, "owner-a");

        given()
            .contentType("application/json")
            .body("{\"content\": \"should be rejected\"}")
            .when().put("/api/pad/" + path)
            .then()
            .statusCode(403);

        // Content unchanged
        given()
            .when().get("/api/pad/" + path)
            .then()
            .statusCode(200)
            .body("content", is("owner content"))
            .body("claimed", is(true));
    }

    @Test
    @TestSecurity(user = "owner-b", roles = "USER")
    void registeredUserCanEditClaimedPad() {
        String path = "claimed-" + UUID.randomUUID().toString().substring(0, 8);
        seedClaimedPad(path, "owner-b");

        given()
            .contentType("application/json")
            .body("{\"content\": \"updated\"}")
            .when().put("/api/pad/" + path)
            .then()
            .statusCode(200)
            .body("content", is("updated"))
            .body("claimed", is(true));
    }

    @Test
    @TestSecurity(user = "other-user", roles = "USER")
    void differentRegisteredUserCanEditClaimedPad() {
        String path = "claimed-" + UUID.randomUUID().toString().substring(0, 8);
        seedClaimedPad(path, "original-owner");

        // Logged-in users are not blocked; only anonymous edits are rejected.
        given()
            .contentType("application/json")
            .body("{\"content\": \"edited by other\"}")
            .when().put("/api/pad/" + path)
            .then()
            .statusCode(200)
            .body("content", is("edited by other"));
    }
}
