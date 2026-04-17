package com.capypad.pad.service;

import io.quarkus.scheduler.Scheduled;
import jakarta.enterprise.context.ApplicationScoped;
import org.eclipse.microprofile.config.inject.ConfigProperty;

import java.util.Deque;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentLinkedDeque;

@ApplicationScoped
public class PadCreationLimiter {

    @ConfigProperty(name = "capypad.pad.creation-rate-limit.per-window", defaultValue = "20")
    int maxCreationsPerWindow;

    @ConfigProperty(name = "capypad.pad.creation-rate-limit.window-seconds", defaultValue = "3600")
    long windowSeconds;

    private final ConcurrentHashMap<String, Deque<Long>> creations = new ConcurrentHashMap<>();

    public boolean tryAllow(String clientIp) {
        long now = System.currentTimeMillis();
        long windowMs = windowSeconds * 1000L;
        Deque<Long> attempts = creations.computeIfAbsent(clientIp, k -> new ConcurrentLinkedDeque<>());
        synchronized (attempts) {
            while (!attempts.isEmpty() && now - attempts.peekFirst() >= windowMs) {
                attempts.pollFirst();
            }
            if (attempts.size() >= maxCreationsPerWindow) {
                return false;
            }
            attempts.addLast(now);
            return true;
        }
    }

    public long windowSeconds() {
        return windowSeconds;
    }

    @Scheduled(every = "10m")
    void sweepStaleEntries() {
        long cutoff = System.currentTimeMillis() - windowSeconds * 1000L * 2L;
        creations.entrySet().removeIf(entry -> {
            Deque<Long> deque = entry.getValue();
            synchronized (deque) {
                while (!deque.isEmpty() && deque.peekFirst() < cutoff) {
                    deque.pollFirst();
                }
                return deque.isEmpty();
            }
        });
    }
}
