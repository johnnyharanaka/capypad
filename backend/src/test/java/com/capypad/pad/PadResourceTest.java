package com.capypad.pad;

import io.quarkus.test.junit.QuarkusTest;
import io.quarkus.test.security.TestSecurity;
import org.junit.jupiter.api.Test;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.is;

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
