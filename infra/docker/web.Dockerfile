# GamFix web container: builds the citizen app + landing + dashboard from
# source and serves everything through one nginx, mirroring the VPS layout:
#   /        -> landing
#   /app/    -> citizen app (base /app/)
#   /dash/   -> staff console (Astryx build output in apps/dashboard/dist)
# TLS is expected to terminate in front of this container (host nginx,
# Cloudflare, or a reverse proxy of your choice).
FROM node:20-alpine AS build

WORKDIR /src
COPY apps/citizen/package.json apps/citizen/package-lock.json ./citizen/
COPY apps/landing/package.json apps/landing/package-lock.json ./landing/
RUN npm ci --prefix citizen --silent && npm ci --prefix landing --silent

COPY apps/citizen ./citizen
COPY apps/landing ./landing
COPY apps/dashboard/dist ./dashboard-dist

RUN npm run build --prefix citizen \
 && npm run build --prefix landing

FROM nginx:1.27-alpine

COPY infra/docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /src/landing/dist  /usr/share/nginx/html
COPY --from=build /src/citizen/dist  /usr/share/nginx/html/app
COPY --from=build /src/dashboard-dist /usr/share/nginx/html/dash

EXPOSE 80
