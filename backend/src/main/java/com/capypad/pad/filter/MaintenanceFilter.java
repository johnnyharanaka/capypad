package com.capypad.pad.filter;

import jakarta.annotation.Priority;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.ws.rs.Priorities;
import jakarta.ws.rs.container.ContainerRequestContext;
import jakarta.ws.rs.container.ContainerRequestFilter;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.ext.Provider;
import org.eclipse.microprofile.config.inject.ConfigProperty;

@Provider
@ApplicationScoped
@Priority(Priorities.AUTHENTICATION - 100)
public class MaintenanceFilter implements ContainerRequestFilter {

    @ConfigProperty(name = "maintenance.mode", defaultValue = "false")
    boolean maintenanceMode;

    @Override
    public void filter(ContainerRequestContext requestContext) {
        if (maintenanceMode) {
            String path = requestContext.getUriInfo().getPath();

            // Allow OPTIONS preflight to pass through for CORS headers
            if (requestContext.getMethod().equalsIgnoreCase("OPTIONS")) {
                return;
            }

            if (path != null && (path.startsWith("/api/") || path.startsWith("api/"))) {
                requestContext.abortWith(Response.status(503)
                        .entity("{\"error\": \"System is currently under maintenance. Please try again later.\"}")
                        .header("Content-Type", "application/json")
                        .build());
            }
        }
    }
}
