# GamFix PocketBase backend container.
# Uses the PocketBase binary placed in infra/docker/pb-bin/pocketbase
# (run infra/docker/fetch-pb.sh to download the latest release, or copy
# your exact deployment binary there for a like-for-like build).
FROM alpine:3.20

RUN apk add --no-cache ca-certificates curl tzdata \
 && adduser -D -H pocketbase

COPY infra/docker/pb-bin/pocketbase /pb/pocketbase
COPY backend/pb_hooks /pb/pb_hooks
COPY backend/pb_migrations /pb/pb_migrations

RUN chmod +x /pb/pocketbase \
 && mkdir -p /pb/pb_data \
 && chown -R pocketbase:pocketbase /pb

USER pocketbase
WORKDIR /pb

EXPOSE 8090

CMD ["/pb/pocketbase", "serve", "--http=0.0.0.0:8090", "--hooksDir=/pb/pb_hooks", "--dir=/pb/pb_data"]
