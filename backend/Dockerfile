# Native (GraalVM) runtime image.
# The *-runner binary is produced by CI (`mvnw package -Dnative`) and copied into
# target/ before this image is built on the droplet. ubi9-minimal ships curl-minimal,
# which the compose healthcheck relies on.
FROM registry.access.redhat.com/ubi9/ubi-minimal:9.5
WORKDIR /work
COPY --chmod=0755 target/*-runner /work/application
EXPOSE 8080
# Native RSS is dominated by off-heap; a small heap cap keeps the footprint predictable.
ENTRYPOINT ["./application", "-Dquarkus.http.host=0.0.0.0", "-Xmx96m"]
