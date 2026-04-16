package com.capypad.pad;

import jakarta.annotation.security.PermitAll;
import jakarta.inject.Inject;
import jakarta.ws.rs.*;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import org.eclipse.microprofile.config.inject.ConfigProperty;

import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.Optional;
import org.jboss.logging.Logger;

@Path("/api/auth")
@Produces(MediaType.APPLICATION_JSON)
@PermitAll
public class AuthResource {

    private static final Logger LOG = Logger.getLogger(AuthResource.class);
    private static final String COOKIE_NAME = "capypad_jwt";
    private static final String ID_TOKEN_COOKIE_NAME = "capypad_id_token";
    private static final String PKCE_COOKIE_NAME = "capypad_pkce";
    private static final SecureRandom RANDOM = new SecureRandom();

    @Inject
    UserService userService;

    @ConfigProperty(name = "capypad.auth.cookie.secure", defaultValue = "false")
    boolean cookieSecure;

    @ConfigProperty(name = "capypad.auth.cookie.max-age-seconds", defaultValue = "86400")
    int cookieMaxAge;

    @ConfigProperty(name = "capypad.auth.cookie.same-site", defaultValue = "Lax")
    String cookieSameSite;

    @ConfigProperty(name = "capypad.auth.frontend-url")
    String frontendUrl;

    @ConfigProperty(name = "capypad.auth.callback-url")
    String callbackUrl;

    @ConfigProperty(name = "capypad.auth.keycloak-external-url")
    String keycloakExternalUrl;

    @ConfigProperty(name = "quarkus.oidc.client-id")
    String clientId;

    @ConfigProperty(name = "quarkus.oidc.credentials.secret")
    String clientSecret;

    @ConfigProperty(name = "quarkus.oidc.auth-server-url")
    String oidcAuthServerUrl;

    /**
     * GET /api/auth/login?redirect=...
     * Generates PKCE verifier/challenge + state, stores them in a temporary cookie,
     * and redirects the browser to Keycloak's authorization endpoint.
     */
    @GET
    @Path("/login")
    public Response login(@QueryParam("redirect") String redirect) {
        try {
            String codeVerifier = generateCodeVerifier();
            String codeChallenge = generateCodeChallenge(codeVerifier);
            String state = generateState();

            // Store verifier + state + redirect in a temporary HttpOnly cookie
            String pkceData = codeVerifier + "|" + state + "|" + (redirect != null ? redirect : frontendUrl);
            String pkceCookie = buildPkceCookie(pkceData);

            String authorizeUrl = keycloakExternalUrl + "/realms/capypad/protocol/openid-connect/auth"
                    + "?response_type=code"
                    + "&client_id=" + encode(clientId)
                    + "&redirect_uri=" + encode(callbackUrl)
                    + "&state=" + encode(state)
                    + "&code_challenge=" + encode(codeChallenge)
                    + "&code_challenge_method=S256"
                    + "&scope=openid";

            return Response.ok("{\"url\":\"" + authorizeUrl.replace("\"", "\\\"") + "\"}")
                    .header("Set-Cookie", pkceCookie)
                    .build();
        } catch (Exception e) {
            return Response.serverError()
                    .entity("{\"error\":\"Failed to initiate login\"}")
                    .build();
        }
    }

    /**
     * GET /api/auth/callback?code=...&state=...
     * Receives the authorization code from Keycloak, validates state,
     * exchanges code for token using PKCE, checks user approval, sets JWT cookie.
     */
    @GET
    @Path("/callback")
    @Produces(MediaType.TEXT_HTML)
    public Response callback(
            @QueryParam("code") String code,
            @QueryParam("state") String state,
            @QueryParam("error") String error,
            @QueryParam("error_description") String errorDescription,
            @HeaderParam("Cookie") String cookieHeader) {

        LOG.infof("[AUTH CALLBACK] code=%s, state=%s, error=%s, cookieHeader=%s",
                code != null ? "present" : "null",
                state != null ? "present" : "null",
                error,
                cookieHeader != null ? "present(" + cookieHeader.length() + " chars)" : "null");

        // Handle Keycloak errors (e.g. user cancelled)
        if (error != null) {
            LOG.warnf("[AUTH CALLBACK] Keycloak error: %s - %s", error, errorDescription);
            return redirectToFrontend(frontendUrl, "error", errorDescription != null ? errorDescription : error);
        }

        if (code == null || state == null) {
            LOG.warn("[AUTH CALLBACK] Missing code or state");
            return redirectToFrontend(frontendUrl, "error", "Missing authorization code");
        }

        // Parse PKCE cookie
        String pkceData = extractCookie(cookieHeader, PKCE_COOKIE_NAME);
        if (pkceData == null) {
            LOG.warn("[AUTH CALLBACK] PKCE cookie not found in request");
            return redirectToFrontend(frontendUrl, "error", "Session expired, please try again");
        }

        String[] parts = pkceData.split("\\|", 3);
        if (parts.length < 3) {
            LOG.warnf("[AUTH CALLBACK] Invalid PKCE data, parts=%d", parts.length);
            return redirectToFrontend(frontendUrl, "error", "Invalid session");
        }

        String codeVerifier = parts[0];
        String expectedState = parts[1];
        String redirectUrl = parts[2];
        LOG.infof("[AUTH CALLBACK] PKCE parsed ok, redirectUrl=%s", redirectUrl);

        // Validate state to prevent CSRF
        if (!state.equals(expectedState)) {
            LOG.warn("[AUTH CALLBACK] State mismatch");
            return redirectToFrontend(frontendUrl, "error", "Invalid state");
        }

        // Exchange code for token
        LOG.info("[AUTH CALLBACK] Exchanging code for token...");
        Optional<UserService.TokenResponse> tokenResult = userService.exchangeCodeForToken(code, codeVerifier, callbackUrl);
        if (tokenResult.isEmpty()) {
            LOG.warn("[AUTH CALLBACK] Token exchange FAILED");
            return redirectToFrontend(redirectUrl, "error", "Token exchange failed");
        }
        LOG.info("[AUTH CALLBACK] Token exchange OK");

        UserService.TokenResponse tokenResponse = tokenResult.get();
        userService.extractTokenDebugInfo(tokenResponse.accessToken()).ifPresentOrElse(
            info -> LOG.infof("[AUTH CALLBACK] Token claims: iss=%s, aud=%s, azp=%s, typ=%s, exp=%s",
                info.issuer(), info.audience(), info.authorizedParty(), info.type(), info.expiresAtEpoch()),
            () -> LOG.warn("[AUTH CALLBACK] Could not parse token claims for debug")
        );

        // Extract username from the token (preferred_username claim)
        String username = userService.extractUsername(tokenResponse.accessToken());
        if (username == null) {
            LOG.warn("[AUTH CALLBACK] Could not extract username from token");
            return redirectToFrontend(redirectUrl, "error", "Could not determine username");
        }
        LOG.infof("[AUTH CALLBACK] Username: %s", username);

        // Ensure local user record exists; check if approved
        User localUser = userService.ensureLocalUser(username);
        LOG.infof("[AUTH CALLBACK] Local user: id=%d, approved=%s, role=%s", localUser.id, localUser.approved, localUser.role);
        if (!localUser.approved) {
            LOG.warnf("[AUTH CALLBACK] User '%s' not approved, redirecting with pending", username);
            return redirectToFrontend(redirectUrl, "pending", null);
        }

        // Users registered directly in Keycloak may miss realm role assignment.
        // Ensure USER/ADMIN role exists so @RolesAllowed endpoints do not return 403.
        userService.ensureKeycloakUserRole(localUser.username, localUser.role);

        // Set JWT + ID token cookies and clear PKCE cookie
        String jwtCookie = buildSetCookie(COOKIE_NAME, tokenResponse.accessToken());
        String clearPkce = buildClearCookie(PKCE_COOKIE_NAME, "/api/auth");
        LOG.infof("[AUTH CALLBACK] SUCCESS — setting JWT cookie (%d chars), redirecting to %s", jwtCookie.length(), redirectUrl);

        Response.ResponseBuilder builder = Response.status(302)
                .location(URI.create(redirectUrl))
                .header("Set-Cookie", jwtCookie)
                .header("Set-Cookie", clearPkce);

        if (tokenResponse.idToken() != null) {
            builder.header("Set-Cookie", buildSetCookie(ID_TOKEN_COOKIE_NAME, tokenResponse.idToken()));
        }

        return builder.build();
    }

    /**
     * GET /api/auth/me
     * Returns the current user's info from the JWT cookie.
     * Used by the frontend to check session on page load.
     */
    @GET
    @Path("/me")
    public Response me(@jakarta.ws.rs.core.Context jakarta.ws.rs.core.SecurityContext securityContext,
                       @HeaderParam("Cookie") String cookieHeader) {
        boolean hasCookie = cookieHeader != null && cookieHeader.contains(COOKIE_NAME + "=");
        LOG.infof("[AUTH ME] cookie header present=%s, has jwt cookie=%s, principal=%s",
                cookieHeader != null, hasCookie,
                securityContext.getUserPrincipal() != null ? securityContext.getUserPrincipal().getName() : "null");
        if (securityContext.getUserPrincipal() == null) {
            return Response.status(Response.Status.UNAUTHORIZED)
                    .entity("{\"error\":\"not authenticated\"}")
                    .build();
        }

        String username = securityContext.getUserPrincipal().getName();
        java.util.Optional<User> userOpt = User.findByUsername(username.toLowerCase());

        if (userOpt.isEmpty() || !userOpt.get().approved) {
            return Response.status(Response.Status.FORBIDDEN)
                    .entity("{\"error\":\"not approved\"}")
                    .build();
        }

        User user = userOpt.get();
        return Response.ok(new com.capypad.pad.dto.UserSummary(
                user.id, user.username, user.role.name(), user.approved))
                .build();
    }

    /**
     * POST /api/auth/logout
     * Clears the JWT cookie and returns the Keycloak end-session URL
     * so the frontend can redirect the browser and terminate the SSO session.
     */
    @POST
    @Path("/logout")
    public Response logout(@QueryParam("redirect") String redirect,
                           @HeaderParam("Cookie") String cookieHeader) {
        String idToken = extractCookie(cookieHeader, ID_TOKEN_COOKIE_NAME);

        String postLogoutRedirect = (redirect != null && redirect.startsWith(frontendUrl))
                ? redirect
                : frontendUrl;

        StringBuilder logoutUrl = new StringBuilder()
                .append(keycloakExternalUrl).append("/realms/capypad/protocol/openid-connect/logout")
                .append("?client_id=").append(encode(clientId))
                .append("&post_logout_redirect_uri=").append(encode(postLogoutRedirect));

        if (idToken != null) {
            logoutUrl.append("&id_token_hint=").append(encode(idToken));
        }

        return Response.ok("{\"url\":\"" + logoutUrl.toString().replace("\"", "\\\"") + "\"}")
                .header("Set-Cookie", buildClearCookie(COOKIE_NAME))
                .header("Set-Cookie", buildClearCookie(ID_TOKEN_COOKIE_NAME))
                .build();
    }

    // ── Cookie helpers ──────────────────────────────────────────────

    private String buildSetCookie(String name, String token) {
        StringBuilder sb = new StringBuilder();
        sb.append(name).append('=').append(token);
        sb.append("; Path=/; HttpOnly");
        sb.append("; SameSite=").append(cookieSameSite);
        sb.append("; Max-Age=").append(cookieMaxAge);
        if (cookieSecure) sb.append("; Secure");
        return sb.toString();
    }

    private String buildClearCookie(String name) {
        return buildClearCookie(name, "/");
    }

    private String buildClearCookie(String name, String path) {
        StringBuilder sb = new StringBuilder();
        sb.append(name).append("=; Path=").append(path).append("; HttpOnly; Max-Age=0");
        sb.append("; SameSite=").append(cookieSameSite);
        if (cookieSecure) sb.append("; Secure");
        return sb.toString();
    }

    private String buildPkceCookie(String value) {
        StringBuilder sb = new StringBuilder();
        sb.append(PKCE_COOKIE_NAME).append('=').append(encode(value));
        sb.append("; Path=/api/auth; HttpOnly; Max-Age=300"); // 5 min TTL
        sb.append("; SameSite=").append(cookieSameSite);
        if (cookieSecure) sb.append("; Secure");
        return sb.toString();
    }

    private String extractCookie(String cookieHeader, String name) {
        if (cookieHeader == null) return null;
        for (String part : cookieHeader.split(";")) {
            String trimmed = part.trim();
            if (trimmed.startsWith(name + "=")) {
                String value = trimmed.substring(name.length() + 1);
                try {
                    return java.net.URLDecoder.decode(value, StandardCharsets.UTF_8);
                } catch (Exception e) {
                    return value;
                }
            }
        }
        return null;
    }

    // ── PKCE helpers ────────────────────────────────────────────────

    private String generateCodeVerifier() {
        byte[] bytes = new byte[32];
        RANDOM.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    private String generateCodeChallenge(String verifier) throws Exception {
        byte[] hash = MessageDigest.getInstance("SHA-256")
                .digest(verifier.getBytes(StandardCharsets.US_ASCII));
        return Base64.getUrlEncoder().withoutPadding().encodeToString(hash);
    }

    private String generateState() {
        byte[] bytes = new byte[16];
        RANDOM.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    private String encode(String value) {
        return java.net.URLEncoder.encode(value, StandardCharsets.UTF_8);
    }

    // ── Redirect helper ─────────────────────────────────────────────

    private Response redirectToFrontend(String baseUrl, String authStatus, String message) {
        String url = baseUrl;
        if (url.contains("?")) {
            url += "&auth=" + encode(authStatus);
        } else {
            url += "?auth=" + encode(authStatus);
        }
        if (message != null) {
            url += "&message=" + encode(message);
        }
        return Response.status(302)
                .location(URI.create(url))
                .header("Set-Cookie", buildClearCookie(PKCE_COOKIE_NAME, "/api/auth"))
                .build();
    }
}
