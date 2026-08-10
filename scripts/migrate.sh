#!/usr/bin/env bash
# Minimal migration runner for Linux / macOS / WSL.
#
# Usage:
#   ./scripts/migrate.sh                     # default: factory-db, local environment
#   ./scripts/migrate.sh my-db local          # custom container and environment
#   ./scripts/migrate.sh my-db supabase ./supabase/migrations  # custom migration directory
#
# What it does:
#   1. Creates a backup of the current database in supabase/backups.
#   2. Ensures the Docker DB container is running.
#   3. Creates public.schema_migrations if it does not exist.
#   4. Applies all SQL migration files in sorted order.
#   5. Skips migrations already recorded in schema_migrations.
#   6. Prints the list of public tables when done.

CONTAINER_NAME=${1:-factory-db}
ENVIRONMENT=${2:-local}
MIGRATIONS_DIR=${3:-supabase/migrations/$ENVIRONMENT}
BACKUP_DIR=${4:-supabase/backups}

set -euo pipefail
shopt -s nullglob

# Erstelle den Backup-Ordner, falls er noch nicht existiert.
mkdir -p "$BACKUP_DIR"

# Falls der Datenbank-Container nicht läuft, starte den Docker Compose Service.
if ! docker ps --filter "name=$CONTAINER_NAME" --format '{{.Names}}' | grep -q "$CONTAINER_NAME"; then
  echo "Starting db service via docker compose..."
  docker compose up -d db
  sleep 3
fi

# Backup-Dateiname mit Zeitstempel.
TS=$(date +%Y%m%d%H%M%S)
BACKUP_FILE="$BACKUP_DIR/backup_$TS.sql"
echo "Creating backup $BACKUP_FILE"
docker exec "$CONTAINER_NAME" pg_dump -U postgres -d postgres -F p > "$BACKUP_FILE"

echo "Applying migrations from $MIGRATIONS_DIR..."

# Erstelle die Tabelle zum Nachverfolgen bereits ausgeführter Migrationen.
docker exec "$CONTAINER_NAME" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c \
  "CREATE TABLE IF NOT EXISTS public.schema_migrations (filename text primary key, applied_at timestamptz not null default now());"

# Führe alle SQL-Dateien im Migrationsordner aus.
for f in "$MIGRATIONS_DIR"/*.sql; do
  filename=$(basename "$f")

  # Prüfen, ob diese Migration bereits angewendet wurde.
  already=$(docker exec "$CONTAINER_NAME" psql -U postgres -d postgres -t -A -c \
    "SELECT 1 FROM public.schema_migrations WHERE filename = '$filename';")
  if [ "$already" = "1" ]; then
    echo "--> Skipping already applied migration: $filename"
    continue
  fi

  echo "--> Applying $filename"
  cat "$f" | docker exec -i "$CONTAINER_NAME" psql -U postgres -d postgres -v ON_ERROR_STOP=1

  # Nach erfolgreicher Ausführung als angewendet markieren.
  docker exec "$CONTAINER_NAME" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c \
    "INSERT INTO public.schema_migrations(filename) VALUES ('$filename');"
done

echo "Migrations applied. Listing public tables:"
docker exec "$CONTAINER_NAME" psql -U postgres -d postgres -c \
  "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename;"
