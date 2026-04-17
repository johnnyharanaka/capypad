package com.capypad.pad.filter;

import io.quarkus.scheduler.Scheduled;
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
import java.util.regex.Pattern;

@Provider
@ApplicationScoped
@Priority(Priorities.AUTHENTICATION)
public class ApiRateLimitFilter implements ContainerRequestFilter {

    private static final Pattern UPLOAD_PATH = Pattern.compile("^/?api/pad/[^/]+/images$");
    private static final Pattern API_PATH = Pattern.compile("^/?api/.*$");

    @ConfigProperty(name = "capypad.image.rate-limit.uploads-per-window", defaultValue = "5")
    int uploadsPerWindow;

    @ConfigProperty(name = "capypad.image.rate-limit.window-seconds", defaultValue = "60")
    long uploadWindowSeconds;

    @ConfigProperty(name = "capypad.api.rate-limit.requests-per-window", defaultValue = "120")
    int apiRequestsPerWindow;

    @ConfigProperty(name = "capypad.api.rate-limit.window-seconds", defaultValue = "60")
    long apiWindowSeconds;

    private final ConcurrentHashMap<String, Deque<Long>> uploadAttempts = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, Deque<Long>> apiAttempts = new ConcurrentHashMap<>();

    @Override
    public void filter(ContainerRequestContext requestContext) {
        String path = requestContext.getUriInfo().getPath();
        if (path == null || !API_PATH.matcher(path).matches()) {
            return;
        }

        String clientIp = resolveClientIp(requestContext);
        long now = System.currentTimeMillis();

        boolean isUpload = "POST".equalsIgnoreCase(requestContext.getMethod())
                && UPLOAD_PATH.matcher(path).matches();

        if (isUpload) {
            if (!allow(uploadAttempts, clientIp, now, uploadsPerWindow, uploadWindowSeconds * 1000L)) {
                requestContext.abortWith(Response.status(429)
                        .entity("Upload rate limit exceeded. Try again in a minute.")
                        .header("Retry-After", String.valueOf(uploadWindowSeconds))
                        .build());
                return;
            }
        }

        if (!allow(apiAttempts, clientIp, now, apiRequestsPerWindow, apiWindowSeconds * 1000L)) {
            requestContext.abortWith(Response.status(429)
                    .entity("Too many requests. Slow down.")
                    .header("Retry-After", String.valueOf(apiWindowSeconds))
                    .build());
        }
    }

    private boolean allow(ConcurrentHashMap<String, Deque<Long>> buckets, String key, long now, int limit, long windowMs) {
        Deque<Long> attempts = buckets.computeIfAbsent(key, k -> new ConcurrentLinkedDeque<>());
        synchronized (attempts) {
            while (!attempts.isEmpty() && now - attempts.peekFirst() >= windowMs) {
                attempts.pollFirst();
            }
            if (attempts.size() >= limit) {
                return false;
            }
            attempts.addLast(now);
            return true;
        }
    }

    @Scheduled(every = "5m")
    void sweepStaleEntries() {
        long now = System.currentTimeMillis();
        sweep(uploadAttempts, now - uploadWindowSeconds * 1000L * 2L);
        sweep(apiAttempts, now - apiWindowSeconds * 1000L * 2L);
    }

    private void sweep(ConcurrentHashMap<String, Deque<Long>> buckets, long cutoff) {
        buckets.entrySet().removeIf(entry -> {
            Deque<Long> deque = entry.getValue();
            synchronized (deque) {
                while (!deque.isEmpty() && deque.peekFirst() < cutoff) {
                    deque.pollFirst();
                }
                return deque.isEmpty();
            }
        });
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
