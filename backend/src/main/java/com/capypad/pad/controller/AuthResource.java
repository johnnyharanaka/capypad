package com.capypad.pad.controller;

import com.capypad.pad.model.User;
import com.capypad.pad.service.UserService;
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
    private static final String REFRESH_TOKEN_COOKIE_NAME = "capypad_refresh";
    private static final String AUTH_COOKIE_PATH = "/api/auth";
    private static final String PKCE_COOKIE_NAME = "capypad_pkce";
    private static final SecureRandom RANDOM = new SecureRandom();

    @Inject
    UserService userService;

    @Inject
    org.eclipse.microprofile.jwt.JsonWebToken jwt;

    @ConfigProperty(name = "capypad.auth.cookie.secure", defaultValue = "false")
    boolean cookieSecure;

    @ConfigProperty(name = "capypad.auth.cookie.max-age-seconds", defaultValue = "86400")
    int cookieMaxAge;

    @ConfigProperty(name = "capypad.auth.refresh-cookie.max-age-seconds", defaultValue = "2592000")
    int refreshCookieMaxAge;

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

    @GET
    @Path("/login")
    public Response login(@QueryParam("redirect") String redirect) {
        try {
            String codeVerifier = generateCodeVerifier();
            String codeChallenge = generateCodeChallenge(codeVerifier);
            String state = generateState();

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

    @GET
    @Path("/callback")
    @Produces(MediaType.TEXT_HTML)
    public Response callback(
            @QueryParam("code") String code,
            @QueryParam("state") String state,
            @QueryParam("error") String error,
            @QueryParam("error_description") String errorDescription,
            @HeaderParam("Cookie") String cookieHeader) {

        if (error != null) {
            LOG.warnf("Keycloak returned error: %s - %s", error, errorDescription);
            return redirectToFrontend(frontendUrl, "error", errorDescription != null ? errorDescription : error);
        }

        if (code == null || state == null) {
            return redirectToFrontend(frontendUrl, "error", "Missing authorization code");
        }

        String pkceData = extractCookie(cookieHeader, PKCE_COOKIE_NAME);
        if (pkceData == null) {
            return redirectToFrontend(frontendUrl, "error", "Session expired, please try again");
        }

        String[] parts = pkceData.split("\\|", 3);
        if (parts.length < 3) {
            return redirectToFrontend(frontendUrl, "error", "Invalid session");
        }

        String codeVerifier = parts[0];
        String expectedState = parts[1];
        String redirectUrl = parts[2];

        if (!state.equals(expectedState)) {
            LOG.warn("OAuth state mismatch");
            return redirectToFrontend(frontendUrl, "error", "Invalid state");
        }

        Optional<UserService.TokenResponse> tokenResult = userService.exchangeCodeForToken(code, codeVerifier, callbackUrl);
        if (tokenResult.isEmpty()) {
            return redirectToFrontend(redirectUrl, "error", "Token exchange failed");
        }

        UserService.TokenResponse tokenResponse = tokenResult.get();

        String username = userService.extractUsername(tokenResponse.accessToken());
        if (username == null) {
            return redirectToFrontend(redirectUrl, "error", "Could not determine username");
        }

        User localUser = userService.ensureLocalUser(username);
        if (!localUser.approved) {
            return redirectToFrontend(redirectUrl, "pending", null);
        }

        userService.ensureKeycloakUserRole(localUser.username, localUser.role);

        String jwtCookie = buildSetCookie(COOKIE_NAME, tokenResponse.accessToken());
        String clearPkce = buildClearCookie(PKCE_COOKIE_NAME, "/api/auth");

        Response.ResponseBuilder builder = Response.status(302)
                .location(URI.create(redirectUrl))
                .header("Set-Cookie", jwtCookie)
                .header("Set-Cookie", clearPkce);

        if (tokenResponse.idToken() != null) {
            builder.header("Set-Cookie", buildSetCookie(ID_TOKEN_COOKIE_NAME, tokenResponse.idToken()));
        }

        if (tokenResponse.refreshToken() != null) {
            builder.header("Set-Cookie", buildRefreshCookie(tokenResponse.refreshToken()));
        }

        return builder.build();
    }

    @POST
    @Path("/refresh")
    public Response refresh(@HeaderParam("Cookie") String cookieHeader) {
        String refreshToken = extractCookie(cookieHeader, REFRESH_TOKEN_COOKIE_NAME);
        if (refreshToken == null) {
            return Response.status(Response.Status.UNAUTHORIZED)
                    .entity("{\"error\":\"no refresh token\"}")
                    .build();
        }

        Optional<UserService.TokenResponse> result = userService.refreshAccessToken(refreshToken);
        if (result.isEmpty()) {
            // Refresh failed (token expired/revoked, or a transient/raced call). Only drop the
            // dead refresh cookie — never the access token, so a still-valid session survives a
            // hiccup. The access token expires on its own if the session is truly gone.
            return Response.status(Response.Status.UNAUTHORIZED)
                    .header("Set-Cookie", buildClearCookie(REFRESH_TOKEN_COOKIE_NAME, AUTH_COOKIE_PATH))
                    .entity("{\"error\":\"refresh failed\"}")
                    .build();
        }

        UserService.TokenResponse tokens = result.get();
        Response.ResponseBuilder builder = Response.ok("{\"expiresIn\":" + tokens.expiresIn() + "}")
                .header("Set-Cookie", buildSetCookie(COOKIE_NAME, tokens.accessToken()))
                .header("Set-Cookie", buildRefreshCookie(tokens.refreshToken()));

        if (tokens.idToken() != null) {
            builder.header("Set-Cookie", buildSetCookie(ID_TOKEN_COOKIE_NAME, tokens.idToken()));
        }

        return builder.build();
    }

    @GET
    @Path("/me")
    public Response me(@jakarta.ws.rs.core.Context jakarta.ws.rs.core.SecurityContext securityContext) {
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
        // expiresAt: epoch seconds when the current access token expires, so the
        // client can schedule a proactive refresh without rotating the token now.
        // 0 when there is no JWT (e.g. mocked test security) — the client then
        // falls back to a default interval.
        long expiresAt = 0L;
        try {
            expiresAt = jwt.getExpirationTime();
        } catch (Exception ignored) {
            // No JWT-backed identity available.
        }
        return Response.ok(java.util.Map.of(
                "id", user.id,
                "username", user.username,
                "role", user.role.name(),
                "approved", user.approved,
                "expiresAt", expiresAt))
                .build();
    }

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
                .header("Set-Cookie", buildClearCookie(REFRESH_TOKEN_COOKIE_NAME, AUTH_COOKIE_PATH))
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

    private String buildRefreshCookie(String token) {
        StringBuilder sb = new StringBuilder();
        sb.append(REFRESH_TOKEN_COOKIE_NAME).append('=').append(token);
        sb.append("; Path=").append(AUTH_COOKIE_PATH).append("; HttpOnly");
        sb.append("; SameSite=").append(cookieSameSite);
        sb.append("; Max-Age=").append(refreshCookieMaxAge);
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
        sb.append("; Path=/api/auth; HttpOnly; Max-Age=300");
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
