# Disposable Fly sidecar — Dolt vs better-sqlite3 surgical probe.
#
# Mirrors the production continuum-engine profile (shared-cpu-1x 512MB,
# node:20-bookworm-slim) so the measurements reflect what Dolt would
# actually do in our deployment surface.
#
# Image size note: we're not optimising for image footprint here —
# the operator authorised this as a one-shot disposable. ~1GB image
# is fine.

FROM node:20-bookworm-slim

# System tools needed for the probe:
#   curl + ca-certificates : fetch Dolt release tarball
#   mariadb-client         : mysql command-line client (talks to Dolt SQL server)
#   procps                 : ps + free for RSS measurement
#   coreutils              : du, ls, rm (already in slim, but make explicit)
#   build-essential + py   : better-sqlite3 native compile (in case prebuilt missing)
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      curl ca-certificates mariadb-client procps coreutils \
      build-essential python3 \
    && rm -rf /var/lib/apt/lists/*

# Install Dolt via the official one-liner. Pinned to 1.59.x line for
# reproducibility — change this version when re-running.
RUN curl -L https://github.com/dolthub/dolt/releases/download/v1.59.5/install.sh \
    | bash

# Verify the install + capture the binary size in the build log.
RUN dolt version && du -sh /usr/local/bin/dolt

# Dolt refuses to `dolt init` without a global user.email + user.name
# (it's git-flavored). Set them at image-build time so the probe just
# works. If this RUN fails the build fails — we see the error
# immediately instead of at probe-run time.
RUN dolt config --global --add user.email probe@continuum.rest && \
    dolt config --global --add user.name continuum-probe && \
    dolt config --list

WORKDIR /probe

# Install better-sqlite3 for the in-process baseline comparison.
# Prebuilt binaries exist for linux-x64; if it has to compile, that's
# why we installed build-essential above.
RUN npm init -y > /dev/null && \
    npm install --no-fund --no-audit better-sqlite3@11.3.0

COPY probe.mjs .
COPY probe-minimal.mjs .

# Minimal probe — measures ONE dolt sql-server's RSS, ONE query latency
# pair, and the on-disk layout. Full probe hung in scenario A so we get
# definitive measurements from the smaller scope and extrapolate.
CMD ["node", "/probe/probe-minimal.mjs"]
