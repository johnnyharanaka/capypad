package com.capypad.pad;

import com.capypad.pad.dto.AdminCreateUserRequest;
import com.capypad.pad.dto.AdminCreateUserResponse;
import com.capypad.pad.dto.UserSummary;
import jakarta.annotation.security.RolesAllowed;
import jakarta.inject.Inject;
import jakarta.ws.rs.*;
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.core.SecurityContext;

import java.util.List;

@Path("/api/admin")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
@RolesAllowed("ADMIN")
public class AdminResource {

    @Inject
    UserService userService;

    @GET
    @Path("/users")
    public List<UserSummary> listUsers() {
        return userService.listUsers();
    }

    @POST
    @Path("/users")
    public Response createUser(AdminCreateUserRequest req) {
        AdminCreateUserResponse created = userService.createUserByAdmin(req);
        return Response.status(Response.Status.CREATED).entity(created).build();
    }

    @PUT
    @Path("/users/{id}/approve")
    public Response approveUser(@PathParam("id") Long id) {
        UserSummary approved = userService.approveUser(id);
        return Response.ok(approved).build();
    }

    @DELETE
    @Path("/users/{id}")
    public Response deleteUser(@PathParam("id") Long id, @Context SecurityContext sc) {
        userService.deleteUser(id, sc.getUserPrincipal().getName());
        return Response.noContent().build();
    }
}
