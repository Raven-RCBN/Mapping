#!/bin/sh
# Existing standalone MapIntel deployment and authenticated API namespace.
set -eu
VITE_API_BASE=/api/EstateAtlas VITE_LOCAL_SIGN_IN=true pnpm build
