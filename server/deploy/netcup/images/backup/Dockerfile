# Backup runner (pg_dump, restic, local encrypted archive). Tools are
# installed at build time, so a (re)start never depends on a package mirror.
# Built by deploy-code.sh with this directory as the (empty) build context;
# the scripts themselves are bind-mounted from ../../backup.
FROM alpine:3.20@sha256:d9e853e87e55526f6b2917df91a2115c36dd7c696a35be12163d44e6e2a4b6bc
RUN apk add --no-cache ca-certificates curl openssl postgresql16-client restic supercronic tar
ENTRYPOINT ["supercronic", "/backup/crontab"]
