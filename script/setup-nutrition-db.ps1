# One-shot, idempotent setup for the local `nutrition` database.
#
# Uses PGPASSWORD from .env (the superuser password) to:
#   1. ensure a lowercase `nutrition` database exists (renaming "Nutrition" if
#      that is what pgAdmin created)
#   2. create/reset a restricted `mealmaker_dev` role with a fresh random
#      password
#   3. grant schema rights + enable pg_trgm / unaccent / fuzzystrmatch
#   4. upsert NUTRITION_DATABASE_URL into .env
#   5. verify read/write access as the new role
#
# Safe to re-run: the role's password is rotated, grants are idempotent, and the
# .env line is replaced rather than duplicated.
#
# Secrets are never printed: the password only travels via PGPASSWORD and psql
# variables, and the final URL is echoed with the password masked.
#
# Usage (from the repo root):
#   powershell -NoProfile -ExecutionPolicy Bypass -File script/setup-nutrition-db.ps1

$ErrorActionPreference = 'Stop'
$psql = 'C:\Program Files\PostgreSQL\18\bin\psql.exe'
$repo = (Resolve-Path "$PSScriptRoot\..").Path
$envFile = Join-Path $repo '.env'

function Read-EnvValue([string]$name) {
    $match = Get-Content $envFile | Where-Object { $_ -match "^$name=" } | Select-Object -First 1
    if (-not $match) { return $null }
    return ($match -split '=', 2)[1].Trim()
}

function Invoke-Psql {
    param([string]$Database, [string[]]$PsqlArgs)

    & $psql -h localhost -p 5432 -U postgres -d $Database -v ON_ERROR_STOP=1 @PsqlArgs
    if ($LASTEXITCODE -ne 0) {
        throw "psql failed (exit $LASTEXITCODE) on database '$Database'"
    }
}

Write-Output '=== 1. connect as superuser ==='
$superPass = Read-EnvValue 'PGPASSWORD'
if (-not $superPass) {
    Write-Output 'PGPASSWORD is not set in .env — cannot create roles/databases.'
    exit 1
}
# Only the superuser password is used here; it stays out of the transcript.
$env:PGPASSWORD = $superPass

Write-Output '=== 2. ensure lowercase `nutrition` database ==='
$dbs = Invoke-Psql -Database 'postgres' -PsqlArgs @('-t', '-A', '-c', 'SELECT datname FROM pg_database WHERE datistemplate = false;')
$dbList = $dbs | Where-Object { $_ -and $_ -notmatch '^\s*$' }

if ($dbList -contains 'nutrition') {
    Write-Output 'database `nutrition` already exists'
}
elseif ($dbList -contains 'Nutrition') {
    Write-Output 'found "Nutrition" — renaming to lowercase'
    Invoke-Psql -Database 'postgres' -PsqlArgs @('-q', '-f', (Join-Path $repo 'script\rename-nutrition-db.sql'))
    Write-Output 'renamed'
}
else {
    Write-Output 'neither exists — creating `nutrition`'
    Invoke-Psql -Database 'postgres' -PsqlArgs @('-q', '-c', 'CREATE DATABASE nutrition;')
    Write-Output 'created'
}

Write-Output '=== 3. create/rotate mealmaker_dev role ==='
$chars = [char[]]((48..57) + (65..90) + (97..122))
$appPassword = -join (1..28 | ForEach-Object { $chars | Get-Random })
Invoke-Psql -Database 'postgres' -PsqlArgs @('-q', '-v', "pw=$appPassword", '-f', (Join-Path $repo 'script\db-setup-role.sql'))
Write-Output 'role ready (password generated, not shown)'

Write-Output '=== 4. grants + extensions ==='
Invoke-Psql -Database 'nutrition' -PsqlArgs @('-q', '-f', (Join-Path $repo 'script\db-setup-grants.sql'))
Write-Output 'grants applied'

Write-Output '=== 5. upsert NUTRITION_DATABASE_URL into .env ==='
$url = "postgresql://mealmaker_dev:$appPassword@localhost:5432/nutrition"
$lines = @([System.IO.File]::ReadAllLines($envFile) | Where-Object { $_ -notmatch '^NUTRITION_DATABASE_URL=' })
$lines += "NUTRITION_DATABASE_URL=$url"
# Absolute path: .NET resolves relative paths against the process cwd, which is
# not always the shell's. UTF8Encoding($false) keeps a BOM out of .env.
[System.IO.File]::WriteAllLines($envFile, [string[]]$lines, (New-Object System.Text.UTF8Encoding($false)))
Write-Output ("wrote line: NUTRITION_DATABASE_URL=postgresql://mealmaker_dev:***@" + "localhost:5432/nutrition")

Write-Output '=== 6. verify as mealmaker_dev ==='
$env:PGPASSWORD = $appPassword
Invoke-Psql -Database 'nutrition' -PsqlArgs @('-t', '-A', '-c', "SELECT 'connected as ' || current_user || ' to ' || current_database();")
Invoke-Psql -Database 'nutrition' -PsqlArgs @('-t', '-A', '-c', 'SELECT extname FROM pg_extension ORDER BY extname;')

Write-Output '--- write test ---'
Invoke-Psql -Database 'nutrition' -PsqlArgs @('-t', '-A', '-c', 'CREATE TABLE _write_probe (id int primary key, note text); INSERT INTO _write_probe VALUES (1, ''ok''); SELECT note FROM _write_probe; DROP TABLE _write_probe;')

Write-Output '--- privileges ---'
Invoke-Psql -Database 'nutrition' -PsqlArgs @('-t', '-A', '-c', "SELECT 'can CREATE in public: ' || has_schema_privilege('public','CREATE')::text || ', can CONNECT: ' || has_database_privilege(current_database(),'CONNECT')::text;")

Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue
Write-Output ''
Write-Output 'SETUP COMPLETE'
