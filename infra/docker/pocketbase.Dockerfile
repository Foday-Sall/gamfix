# GamFix PocketBase backend container.
# Packages the PocketBase binary together with the repo's hooks + migrations.
FROM alpine:3.20

ARG PB_VERSION=0.41.1
ARG PB_ARCH=amd64

RUN apk add --no-cache unzip ca-certificates curl \
 && wget -q "https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_${PB_ARCH}.zip" -O /tmp/pb.zip \
 && unzip -o /tmp/pb.zip -d /pb \
 && chmod +x /pb/pocketbase \
 && rm /tmp/pb.zip \
 && adduser -D -H pocketbase

COPY backend/pb_hooks /pb/pb_hooks
COPY backend/pb_migrations /pb/pb_migrations

RUN mkdir -p /pb/pb_data && chown -R pocketbase:pocketbase /pb

USER pocketbase
WORKDIR /pb

EXPOSE 8090

CMD ["/pb/pocketbase", "serve", "--http=0.0.0.0:8090", "--hooksDir=/pb/pb_hooks", "--dir=/pb/pb_data"]
