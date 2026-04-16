package com.capypad.pad;

import io.quarkus.security.identity.IdentityProviderManager;
import io.quarkus.security.identity.SecurityIdentity;
import io.quarkus.security.identity.request.TokenAuthenticationRequest;
import io.quarkus.oidc.AccessTokenCredential;
import io.quarkus.vertx.http.runtime.security.ChallengeData;
import io.quarkus.vertx.http.runtime.security.HttpAuthenticationMechanism;
import io.quarkus.vertx.http.runtime.security.HttpCredentialTransport;
import io.quarkus.vertx.http.runtime.security.HttpSecurityUtils;
import io.smallrye.mutiny.Uni;
import io.vertx.ext.web.RoutingContext;
import jakarta.annotation.Priority;
import jakarta.enterprise.context.ApplicationScoped;

import java.util.Set;
import org.jboss.logging.Logger;

/**
 * Reads the JWT from the HttpOnly cookie and feeds it into the OIDC
 * identity provider, so that @RolesAllowed and SecurityContext work normally.
 */
@ApplicationScoped
@Priority(2000)
public class CookieBearerAuthMechanism implements HttpAuthenticationMechanism {

    private static final Logger LOG = Logger.getLogger(CookieBearerAuthMechanism.class);
    private static final String COOKIE_NAME = "capypad_jwt";

    @Override
    public Uni<SecurityIdentity> authenticate(RoutingContext context, IdentityProviderManager identityProviderManager) {
        io.vertx.core.http.Cookie cookie = context.request().getCookie(COOKIE_NAME);
        if (cookie == null) {
            return Uni.createFrom().nullItem();
        }

        // OIDC identity provider needs the current RoutingContext on the auth request.
        // Without it, tenant resolution can fail and auth may end as a generic failure.
        TokenAuthenticationRequest authRequest = new TokenAuthenticationRequest(new AccessTokenCredential(cookie.getValue()));
        HttpSecurityUtils.setRoutingContextAttribute(authRequest, context);

        return identityProviderManager.authenticate(authRequest)
                .onFailure().invoke(err -> LOG.errorf(err, "JWT cookie validation failed for %s", context.request().path()));
    }

    @Override
    public Uni<ChallengeData> getChallenge(RoutingContext context) {
        return Uni.createFrom().item(new ChallengeData(401, "WWW-Authenticate", "Bearer"));
    }

    @Override
    public Set<Class<? extends io.quarkus.security.identity.request.AuthenticationRequest>> getCredentialTypes() {
        return Set.of(TokenAuthenticationRequest.class);
    }

    @Override
    public Uni<HttpCredentialTransport> getCredentialTransport(RoutingContext context) {
        return Uni.createFrom().nullItem();
    }
}
