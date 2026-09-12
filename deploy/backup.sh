#!/usr/bin/env bash
# Nightly Postgres backup for the compose stack.
# Writes gzip'd pg_dump files to ./backups and prunes anything older than
# KEEP_DAYS days. Schedule it from host crontab (see docs/oracle-vm-deployment.md).
set -euo pipefail
cd "$(dirname "$0")/.." # repo root

set -a
# shellcheck disable=SC1091
[ -f .env ] && . ./.env
set +a

BACKUP_DIR="${BACKUP_DIR:-./backups}"
KEEP_DAYS="${KEEP_DAYS:-14}"
STAMP="$(date +%Y%m%d-%H%M%S)"

mkdir -p "$BACKUP_DIR"
docker compose exec -T db pg_dump -U "${POSTGRES_USER:-memex}" "${POSTGRES_DB:-memex}" \
  | gzip > "$BACKUP_DIR/memex-$STAMP.sql.gz"

find "$BACKUP_DIR" -name 'memex-*.sql.gz' -mtime +"$KEEP_DAYS" -delete
echo "Backup written: $BACKUP_DIR/memex-$STAMP.sql.gz"
