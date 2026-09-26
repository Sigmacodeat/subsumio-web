# Scheduler for the web app's /api/cron/* jobs. Tools are installed at build
# time, so a (re)start never depends on a package mirror — previously
# `apk add` ran on every start, and a mirror outage kept supercronic (and
# with it the deadline reminders) from starting at all.
# Built by deploy-code.sh with this directory as the (empty) build context.
FROM alpine:3.20@sha256:d9e853e87e55526f6b2917df91a2115c36dd7c696a35be12163d44e6e2a4b6bc
RUN apk add --no-cache ca-certificates curl supercronic
ENTRYPOINT ["supercronic", "/etc/crontab"]
