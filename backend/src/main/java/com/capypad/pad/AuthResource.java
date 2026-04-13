package com.capypad.pad;

import com.capypad.pad.dto.LoginRequest;
import com.capypad.pad.dto.LoginResponse;
import com.capypad.pad.dto.RegisterRequest;
import com.capypad.pad.dto.UserSummary;
import jakarta.inject.Inject;
import jakarta.ws.rs.*;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;

@Path("/api/auth")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
public class AuthResource {

    @Inject
    UserService userService;

    @POST
    @Path("/login")
    public Response login(LoginRequest req) {
        if (req == null || req.username() == null || req.password() == null) {
            return Response.status(Response.Status.BAD_REQUEST)
                    .entity("{\"error\":\"username and password required\"}")
                    .build();
        }

        return userService.login(req.username(), req.password())
                .<Response>map(resp -> {
                    if ("UPDATE_PASSWORD_REQUIRED".equals(resp.token())) {
                        return Response.status(403)
                                .entity("{\"error\":\"UPDATE_PASSWORD_REQUIRED\"}")
                                .build();
                    }
                    return Response.ok(resp).build();
                })
                .orElse(Response.status(Response.Status.UNAUTHORIZED)
                        .entity("{\"error\":\"invalid credentials\"}")
                        .build());
    }

    @POST
    @Path("/register")
    public Response register(RegisterRequest req) {
        if (req == null || req.username() == null || req.password() == null) {
            return Response.status(Response.Status.BAD_REQUEST)
                    .entity("{\"error\":\"username and password required\"}")
                    .build();
        }

        try {
            userService.registerUser(req);
            return Response.status(Response.Status.CREATED)
                    .entity("{\"message\":\"Account created. Waiting for admin approval.\"}")
                    .build();
        } catch (BadRequestException e) {
            return Response.status(Response.Status.BAD_REQUEST)
                    .entity("{\"error\":\"" + e.getMessage() + "\"}")
                    .build();
        }
    }

    @POST
    @Path("/update-password")
    public Response updatePassword(com.capypad.pad.dto.UpdatePasswordRequest req) {
        if (req == null || req.username() == null || req.oldPassword() == null || req.newPassword() == null) {
            return Response.status(Response.Status.BAD_REQUEST)
                    .entity("{\"error\":\"all fields required\"}")
                    .build();
        }
        
        if (req.newPassword().length() < 6) {
            return Response.status(Response.Status.BAD_REQUEST)
                    .entity("{\"error\":\"password must be at least 6 characters\"}")
                    .build();
        }

        return userService.updatePassword(req.username(), req.oldPassword(), req.newPassword())
                .<Response>map(resp -> Response.ok(resp).build())
                .orElse(Response.ok("{\"message\":\"Password updated. Please login again.\"}").build());
    }
}
