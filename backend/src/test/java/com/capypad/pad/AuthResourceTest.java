package com.capypad.pad;

import com.capypad.pad.model.Role;
import com.capypad.pad.model.User;
import io.quarkus.test.junit.QuarkusTest;
import io.quarkus.test.security.TestSecurity;
import jakarta.transaction.Transactional;
import org.junit.jupiter.api.Test;

import java.util.UUID;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.is;

@QuarkusTest
class AuthResourceTest {

    @Transactional
    void seedUser(String username, boolean approved, Role role) {
        User u = new User();
        u.username = username;
        u.role = role;
        u.approved = approved;
        u.persist();
    }

    @Test
    @TestSecurity(user = "ghost", roles = "USER")
    void meWhenUserNotInDbReturns403() {
        // No matching local User record → not approved
        given().when().get("/api/auth/me")
                .then().statusCode(403);
    }

    @Test
    @TestSecurity(user = "auth-pending", roles = "USER")
    void meWhenUserNotApprovedReturns403() {
        seedUser("auth-pending", false, Role.USER);
        given().when().get("/api/auth/me")
                .then().statusCode(403);
    }

    @Test
    @TestSecurity(user = "auth-ok", roles = "USER")
    void meReturnsUserSummaryForApprovedUser() {
        seedUser("auth-ok", true, Role.USER);
        given().when().get("/api/auth/me")
                .then().statusCode(200)
                .body("username", is("auth-ok"))
                .body("role", is("USER"))
                .body("approved", is(true));
    }

    @Test
    void logoutClearsCookiesAndReturnsLogoutUrl() {
        // Logout endpoint is permit-all and should always return a logout URL.
        given().when().post("/api/auth/logout")
                .then().statusCode(200)
                .body("url", org.hamcrest.Matchers.containsString("/protocol/openid-connect/logout"));
    }
}
