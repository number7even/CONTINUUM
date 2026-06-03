#!/bin/sh
# CONTINUUM container entrypoint (W24-4).
#
# Runs as root briefly to ensure /data ownership (handles operators
# upgrading from a pre-W24-4 image where the volume was created with
# root-owned files), then drops to the unprivileged `continuum` user
# (uid 10001) via `gosu` for the actual node process.
#
# The drop is idempotent — re-runs against an already-correct /data
# are no-ops on the chown.
#
# Tini is PID 1 (set by the Dockerfile ENTRYPOINT) and execs into this
# script. After `exec gosu` the node process inherits PID-1 signal
# handling from tini via gosu's exec.
#
# IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans

set -e

# Fix /data ownership if it's still root (volume created by a prior image
# version that ran as root, or by an operator's --user override on
# `docker run`).
if [ -d /data ] && [ "$(stat -c '%u' /data)" != "10001" ]; then
  chown -R continuum:continuum /data
fi

# Drop privileges and exec the CMD. `gosu` is preferred over `su`
# because it doesn't fork — the target process inherits PID + signal
# handling from us, which inherits from tini.
exec gosu continuum:continuum "$@"
