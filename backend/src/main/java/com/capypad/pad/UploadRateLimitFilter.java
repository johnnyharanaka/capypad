package com.capypad.pad;

import jakarta.annotation.Priority;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.ws.rs.Priorities;
import jakarta.ws.rs.container.ContainerRequestContext;
import jakarta.ws.rs.container.ContainerRequestFilter;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.ext.Provider;
import org.eclipse.microprofile.config.inject.ConfigProperty;

import java.util.Deque;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentLinkedDeque;

@Provider
@ApplicationScoped
@Priority(Priorities.AUTHENTICATION)
public class UploadRateLimitFilter implements ContainerRequestFilter {

    private static final String UPLOAD_PATH_REGEX = "^/?api/pad/[^/]+/images$";

    @ConfigProperty(name = "capypad.image.rate-limit.uploads-per-window", defaultValue = "5")
    int uploadsPerWindow;

    @ConfigProperty(name = "capypad.image.rate-limit.window-seconds", defaultValue = "60")
    long windowSeconds;

    private final ConcurrentHashMap<String, Deque<Long>> attemptsByIp = new ConcurrentHashMap<>();

    @Override
    public void filter(ContainerRequestContext requestContext) {
        if (!"POST".equalsIgnoreCase(requestContext.getMethod())) {
            return;
        }

        String path = requestContext.getUriInfo().getPath();
        if (path == null || !path.matches(UPLOAD_PATH_REGEX)) {
            return;
        }

        String clientIp = resolveClientIp(requestContext);
        long now = System.currentTimeMillis();
        long windowMs = windowSeconds * 1000;

        Deque<Long> attempts = attemptsByIp.computeIfAbsent(clientIp, key -> new ConcurrentLinkedDeque<>());
        synchronized (attempts) {
            while (!attempts.isEmpty() && now - attempts.peekFirst() >= windowMs) {
                attempts.pollFirst();
            }

            if (attempts.size() >= uploadsPerWindow) {
                requestContext.abortWith(
                        Response.status(429)
                                .entity("Upload rate limit exceeded. Try again in a minute.")
                                .header("Retry-After", String.valueOf(windowSeconds))
                                .build()
                );
                return;
            }

            attempts.addLast(now);
        }
    }

    private String resolveClientIp(ContainerRequestContext requestContext) {
        String forwardedFor = requestContext.getHeaderString("X-Forwarded-For");
        if (forwardedFor != null && !forwardedFor.isBlank()) {
            return forwardedFor.split(",")[0].trim();
        }

        String realIp = requestContext.getHeaderString("X-Real-IP");
        if (realIp != null && !realIp.isBlank()) {
            return realIp.trim();
        }

        return "unknown";
    }
}