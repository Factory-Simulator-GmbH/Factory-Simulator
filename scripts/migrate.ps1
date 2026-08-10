<#
Simple migration runner for Windows (PowerShell).

Usage:
  .\scripts\migrate.ps1                  # run local migrations (default)
  .\scripts\migrate.ps1 -Environment supabase   # run supabase migrations
  .\scripts\migrate.ps1 -ContainerName my-db -Environment local -BackupDir supabase\backups

What it does:
  - Ensures the DB docker service is running (starts `docker compose up -d db` if needed)
  - Creates a SQL dump backup to `supabase\backups/backup_<timestamp>.sql`
  - Applies all `*.sql` files from the environment-specific migrations folder in name-sorted order
  - Skips already applied migrations using public.schema_migrations
  - Stops on first error (psql with ON_ERROR_STOP)
#>

param(
    [string]$ContainerName = "factory-db",
    [string]$Environment = "local",
    [string]$BackupDir = "supabase\backups"
)

# Der Migrationsordner hängt vom gewählten Environment ab.
$MigrationsDir = "supabase\migrations\$Environment"

# Stelle sicher, dass der Zielordner existiert.
if (-not (Test-Path $MigrationsDir)) {
    Write-Error "Migrations directory '$MigrationsDir' not found. Available environments: local, supabase."
    exit 1
}

# Erstelle den Backup-Ordner, falls er noch nicht existiert.
if (-not (Test-Path $BackupDir)) {
    New-Item -ItemType Directory -Path $BackupDir | Out-Null
}

# Prüfe, ob der Docker-Container läuft und starte ihn ggf.
Write-Host "Checking DB container '$ContainerName'..."
$running = docker ps --filter "name=$ContainerName" --format "{{.Names}}"
if (-not $running) {
    Write-Host "Container not running - starting db service via docker compose..."
    docker compose up -d db
    Start-Sleep -Seconds 3
}

# Erstelle ein Backup der aktuellen Datenbank vor der Migration.
$timestamp = Get-Date -Format "yyyyMMddHHmmss"
$backupFile = Join-Path $BackupDir "backup_$timestamp.sql"
Write-Host "Creating backup to $backupFile"
docker exec $ContainerName pg_dump -U postgres -d postgres -F p > $backupFile
if ($LASTEXITCODE -ne 0) {
    Write-Error "Backup failed with exit code $LASTEXITCODE"
    exit 1
}

# Bereite die Migrations-Tabelle vor, damit wir bereits angewendete Dateien überspringen können.
Write-Host "Applying migrations from $MigrationsDir..."
$createMigrationTableSql = 'CREATE TABLE IF NOT EXISTS public.schema_migrations (filename text primary key, applied_at timestamptz not null default now());'
docker exec $ContainerName psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c $createMigrationTableSql
if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to create schema_migrations table."
    exit 1
}

# Führe alle SQL-Dateien in alphabetischer Reihenfolge aus.
Get-ChildItem -Path $MigrationsDir -Filter '*.sql' | Sort-Object Name | ForEach-Object {
    $filename = $_.Name
    $checkSql = "SELECT 1 FROM public.schema_migrations WHERE filename = '$filename';"
    $already = docker exec $ContainerName psql -U postgres -d postgres -t -A -c $checkSql

    if ($already -and $already.Trim() -eq '1') {
        Write-Host "--> Skipping already applied migration: $filename"
        continue
    }

    Write-Host "--> Applying $filename"
    Get-Content $_.FullName -Raw | docker exec -i $ContainerName psql -U postgres -d postgres -v ON_ERROR_STOP=1
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Migration failed on $filename during apply."
        exit 1
    }

    # Merke die Datei als angewendet, damit sie beim nächsten Mal übersprungen wird.
    $insertSql = "INSERT INTO public.schema_migrations(filename) VALUES ('$filename');"
    docker exec $ContainerName psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c $insertSql
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Failed to mark migration $filename as applied."
        exit 1
    }
}

# Zeige zur Kontrolle die aktuell registrierten Tabellen in public.
Write-Host "Migrations applied. Listing public tables:"
docker exec $ContainerName psql -U postgres -d postgres -c "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename;"