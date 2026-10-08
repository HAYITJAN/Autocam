#!/usr/bin/env bash
# Vercel build: static frontend, then (opt-in) database migrations and seed.
#
# DB_MIGRATE_ON_BUILD=1   run `alembic upgrade head` and the idempotent seed against DATABASE_URL
# DEMO_SEED=1 (default)   also load demo users and 30 days of demo history
# SEED_ADMIN_PASSWORD / SEED_DEMO_PASSWORD are required so no generated password lands in build logs.
# Demo users' passwords follow SEED_DEMO_PASSWORD: change it and redeploy to rotate them.
# The admin password is only set on creation (rotate it with scripts.set_password).
set -euo pipefail

npm run build --prefix frontend

if [ "${DB_MIGRATE_ON_BUILD:-0}" != "1" ]; then
  echo "DB_MIGRATE_ON_BUILD is not 1: skipping migrations and seed."
  exit 0
fi

: "${DATABASE_URL:?DATABASE_URL must be set}"
: "${SEED_ADMIN_PASSWORD:?SEED_ADMIN_PASSWORD must be set}"

VENV=/tmp/backend-venv
if command -v uv >/dev/null 2>&1; then
  uv venv --quiet --python 3.12 "$VENV"
  uv pip install --quiet --python "$VENV/bin/python" -r backend/requirements.txt
else
  python3 -m venv "$VENV"
  "$VENV/bin/pip" install --quiet --disable-pip-version-check -r backend/requirements.txt
fi

cd backend
"$VENV/bin/python" -m alembic upgrade head
if [ "${DEMO_SEED:-1}" = "1" ]; then
  : "${SEED_DEMO_PASSWORD:?SEED_DEMO_PASSWORD must be set}"
  "$VENV/bin/python" -m scripts.seed_database --demo
  "$VENV/bin/python" -m scripts.set_password --demo --from-env SEED_DEMO_PASSWORD
else
  "$VENV/bin/python" -m scripts.seed_database
fi
