package com.capypad.pad;

import com.capypad.pad.dto.AdminCreateUserRequest;
import com.capypad.pad.dto.AdminCreateUserResponse;
import com.capypad.pad.dto.PadPage;
import com.capypad.pad.dto.PadSummary;
import com.capypad.pad.dto.UserPage;
import com.capypad.pad.dto.UserSummary;
import jakarta.annotation.security.RolesAllowed;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;
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
    @Path("/pads")
    @Transactional
    public PadPage listPads(@QueryParam("page") @DefaultValue("0") int page,
                            @QueryParam("size") @DefaultValue("20") int size,
                            @QueryParam("search") @DefaultValue("") String search) {
        String baseQuery = "content is not null and content != ''";
        if (!search.isBlank()) {
            String like = "%" + search.toLowerCase().trim() + "%";
            long total = Pad.count(baseQuery + " and lower(path) like ?1", like);
            int totalPages = Math.max(1, (int) Math.ceil((double) total / size));
            List<Pad> pads = Pad.find(baseQuery + " and lower(path) like ?1 order by updatedAt desc", like)
                    .page(page, size)
                    .list();
            List<PadSummary> items = pads.stream().map(p -> new PadSummary(
                    p.id, p.path, p.content != null ? p.content.length() : 0,
                    PadImage.countByPadPath(p.path), p.updatedAt
            )).toList();
            return new PadPage(items, total, page, totalPages);
        }
        long total = Pad.count(baseQuery);
        int totalPages = Math.max(1, (int) Math.ceil((double) total / size));
        List<Pad> pads = Pad.find(baseQuery + " order by updatedAt desc")
                .page(page, size)
                .list();
        List<PadSummary> items = pads.stream().map(p -> new PadSummary(
                p.id, p.path, p.content != null ? p.content.length() : 0,
                PadImage.countByPadPath(p.path), p.updatedAt
        )).toList();
        return new PadPage(items, total, page, totalPages);
    }

    @DELETE
    @Path("/pads/{id}")
    @Transactional
    public Response deletePad(@PathParam("id") Long id) {
        Pad pad = Pad.findById(id);
        if (pad == null) {
            return Response.status(Response.Status.NOT_FOUND).build();
        }
        PadImage.deleteByPadPath(pad.path);
        pad.delete();
        return Response.noContent().build();
    }

    @GET
    @Path("/users")
    public UserPage listUsers(@QueryParam("page") @DefaultValue("0") int page,
                              @QueryParam("size") @DefaultValue("20") int size,
                              @QueryParam("approved") String approved) {
        String query = approved != null ? "approved = ?1 order by username" : "1=1 order by username";
        Object[] params = approved != null ? new Object[]{Boolean.parseBoolean(approved)} : new Object[]{};
        long total = approved != null ? User.count("approved", Boolean.parseBoolean(approved)) : User.count();
        int totalPages = Math.max(1, (int) Math.ceil((double) total / size));
        List<User> users = User.find(query, params).page(page, size).list();
        List<UserSummary> items = users.stream()
                .map(u -> new UserSummary(u.id, u.username, u.role.name(), u.approved))
                .toList();
        return new UserPage(items, total, page, totalPages);
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
