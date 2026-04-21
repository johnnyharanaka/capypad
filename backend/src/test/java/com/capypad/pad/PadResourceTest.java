package com.capypad.pad;

import io.quarkus.test.junit.QuarkusTest;
import io.quarkus.test.security.TestSecurity;
import org.junit.jupiter.api.Test;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.is;
import static org.hamcrest.Matchers.not;

@QuarkusTest
class PadResourceTest {

    @Test
    void getEmptyPad() {
        given()
            .when().get("/api/pad/test-empty")
            .then()
            .statusCode(200)
            .body("path", is("test-empty"))
            .body("content", is(""));
    }

    @Test
    @TestSecurity(user = "testuser", roles = "USER")
    void putAndGetPad() {
        given()
            .contentType("application/json")
            .body("{\"content\": \"hello capypad\"}")
            .when().put("/api/pad/demo")
            .then()
            .statusCode(200)
            .body("path", is("demo"))
            .body("content", is("hello capypad"));

        given()
            .when().get("/api/pad/demo")
            .then()
            .statusCode(200)
            .body("content", is("hello capypad"));
    }

    @Test
    void anonymousCanEditUnclaimedPad() {
        given()
            .contentType("application/json")
            .body("{\"content\": \"hello anon\"}")
            .when().put("/api/pad/anon-unclaimed")
            .then()
            .statusCode(200)
            .body("content", is("hello anon"))
            .body("claimed", is(false));
    }

    @Test
    void anonymousContentIsSanitized() {
        given()
            .contentType("application/json")
            .body("{\"content\": \"see ![x](a.png) and [link](http://y) and \\\\image[abc] and \\\\file[f.pdf]\"}")
            .when().put("/api/pad/anon-sanitize")
            .then()
            .statusCode(200)
            .body("content", not(containsString("![x]")))
            .body("content", not(containsString("\\image[")))
            .body("content", not(containsString("\\file[")))
            .body("content", not(containsString("http://y")))
            .body("content", containsString("link"));
    }

    @Test
    @TestSecurity(user = "claimer", roles = "USER")
    void registeredUserClaimsPad() {
        given()
            .contentType("application/json")
            .body("{\"content\": \"mine\"}")
            .when().put("/api/pad/claim-test")
            .then()
            .statusCode(200)
            .body("claimed", is(true));

        given()
            .when().get("/api/pad/claim-test")
            .then()
            .statusCode(200)
            .body("claimed", is(true));
    }

    @Test
    @TestSecurity(user = "testuser", roles = "USER")
    void updateExistingPad() {
        given()
            .contentType("application/json")
            .body("{\"content\": \"first\"}")
            .when().put("/api/pad/update-test")
            .then()
            .statusCode(200);

        given()
            .contentType("application/json")
            .body("{\"content\": \"second\"}")
            .when().put("/api/pad/update-test")
            .then()
            .statusCode(200)
            .body("content", is("second"));

        given()
            .when().get("/api/pad/update-test")
            .then()
            .statusCode(200)
            .body("content", is("second"));
    }
}
