package com.capypad.pad;

import com.capypad.pad.model.Pad;
import com.capypad.pad.model.Role;
import com.capypad.pad.model.User;
import io.quarkus.test.junit.QuarkusTest;
import io.quarkus.test.security.TestSecurity;
import jakarta.transaction.Transactional;
import org.junit.jupiter.api.Test;

import java.util.UUID;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.greaterThanOrEqualTo;
import static org.hamcrest.Matchers.is;

@QuarkusTest
class AdminResourceTest {

    @Transactional
    void seedPad(String path, String content) {
        Pad pad = new Pad();
        pad.path = path;
        pad.content = content;
        pad.persist();
    }

    @Transactional
    Long seedUser(String username, boolean approved) {
        User u = new User();
        u.username = username;
        u.role = Role.USER;
        u.approved = approved;
        u.persist();
        return u.id;
    }

    @Test
    void requiresAdminRoleForListPads() {
        given().when().get("/api/admin/pads")
                .then().statusCode(401);
    }

    @Test
    @TestSecurity(user = "regular", roles = "USER")
    void rejectsNonAdminCaller() {
        given().when().get("/api/admin/pads")
                .then().statusCode(403);
    }

    @Test
    @TestSecurity(user = "admin", roles = "ADMIN")
    void listPadsReturnsPaginatedPage() {
        seedPad("admin-list-" + UUID.randomUUID(), "hi");

        given().when().get("/api/admin/pads?page=0&size=20")
                .then()
                .statusCode(200)
                .body("page", is(0))
                .body("totalPages", greaterThanOrEqualTo(1))
                .body("items.size()", greaterThanOrEqualTo(1));
    }

    @Test
    @TestSecurity(user = "admin", roles = "ADMIN")
    void listPadsHonorsSearchFilter() {
        String unique = "needle-" + UUID.randomUUID().toString().substring(0, 8);
        seedPad(unique, "match");

        given().when().get("/api/admin/pads?search=" + unique)
                .then()
                .statusCode(200)
                .body("items[0].path", is(unique));
    }

    @Test
    @TestSecurity(user = "admin", roles = "ADMIN")
    void deletePadReturnsNoContentAndRemovesIt() {
        String path = "admin-del-" + UUID.randomUUID();
        seedPad(path, "to delete");
        Long id = given().when().get("/api/admin/pads?search=" + path)
                .then().statusCode(200)
                .extract().jsonPath().getLong("items[0].id");

        given().when().delete("/api/admin/pads/" + id)
                .then().statusCode(204);

        given().when().get("/api/admin/pads?search=" + path)
                .then().statusCode(200)
                .body("items.size()", is(0));
    }

    @Test
    @TestSecurity(user = "admin", roles = "ADMIN")
    void deletePadReturns404ForUnknownId() {
        given().when().delete("/api/admin/pads/99999999")
                .then().statusCode(404);
    }

    @Test
    @TestSecurity(user = "admin", roles = "ADMIN")
    void listUsersReturnsPage() {
        seedUser("listed-" + UUID.randomUUID().toString().substring(0, 8), true);

        given().when().get("/api/admin/users")
                .then().statusCode(200)
                .body("items.size()", greaterThanOrEqualTo(1));
    }

    @Test
    @TestSecurity(user = "admin", roles = "ADMIN")
    void listUsersFiltersByApproved() {
        seedUser("pending-" + UUID.randomUUID().toString().substring(0, 8), false);

        given().when().get("/api/admin/users?approved=false")
                .then().statusCode(200)
                .body("items.findAll { it.approved == true }.size()", is(0));
    }

    @Test
    @TestSecurity(user = "admin", roles = "ADMIN")
    void getAndUpdateSettings() {
        // Read current settings
        given().when().get("/api/admin/settings")
                .then().statusCode(200)
                .body("$", org.hamcrest.Matchers.hasKey("maintenanceMode"))
                .body("$", org.hamcrest.Matchers.hasKey("cleanupMaxAgeDays"));

        // Update and verify echoed values are clamped/persisted
        given().contentType("application/json")
                .body("{\"maintenanceMode\": false, \"blockFiles\": true, \"cleanupMaxAgeDays\": 7, \"unclaimedCleanupMaxAgeHours\": 2, \"maxFileBytes\": 5000000}")
                .when().put("/api/admin/settings")
                .then().statusCode(200)
                .body("blockFiles", is(true))
                .body("cleanupMaxAgeDays", is(7))
                .body("unclaimedCleanupMaxAgeHours", is(2));

        // Restore defaults so other tests aren't affected.
        given().contentType("application/json")
                .body("{\"maintenanceMode\": false, \"blockFiles\": false, \"cleanupMaxAgeDays\": 30, \"unclaimedCleanupMaxAgeHours\": 8, \"maxFileBytes\": 10485760}")
                .when().put("/api/admin/settings")
                .then().statusCode(200);
    }

    @Test
    void cleanupOrphanFilesRequiresAuth() {
        given().contentType("application/json")
                .when().post("/api/admin/cleanup-orphan-files")
                .then().statusCode(401);
    }

    @Test
    @TestSecurity(user = "regular", roles = "USER")
    void cleanupOrphanFilesRejectedForNonAdmin() {
        given().contentType("application/json")
                .when().post("/api/admin/cleanup-orphan-files")
                .then().statusCode(403);
    }
}
