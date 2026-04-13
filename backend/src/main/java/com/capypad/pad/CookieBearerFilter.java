package com.capypad.pad;

import io.vertx.ext.web.Router;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.event.Observes;

/**
 * Vert.x route handler that copies the JWT from an HttpOnly cookie
 * into the Authorization header so that Quarkus OIDC can validate it.
 * Runs before the OIDC security handler in the Vert.x pipeline.
 */
@ApplicationScoped
public class CookieBearerFilter {

    private static final String COOKIE_NAME = "capypad_jwt";

    public void init(@Observes Router router) {
        router.route("/api/*").order(-200).handler(rc -> {
            io.vertx.core.http.Cookie cookie = rc.request().getCookie(COOKIE_NAME);
            if (cookie != null && rc.request().getHeader("Authorization") == null) {
                rc.request().headers().set("Authorization", "Bearer " + cookie.getValue());
            }
            rc.next();
        });
    }
}
