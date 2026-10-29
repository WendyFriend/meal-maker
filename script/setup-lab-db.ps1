# Creates an empty `nutrition_lab` database owned by mealmaker_dev.
#
# Creating a database needs the postgres superuser, so this one step you run
# yourself. Everything after it - tables, copying in a sample, experiments - can
# be driven as mealmaker_dev with no superuser at all.
#
#   .\script\setup-lab-db.ps1
#
# The password is read with Read-Host -AsSecureString: never echoed, never
# written to disk, and removed from the environment afterwards.
#
# Nothing is created inside the database; it is deliberately empty. Only the new
# database is touched. The existing `nutrition` database is not modified.
#
# NOTE: ASCII only, on purpose. Windows PowerShell 5.1 reads a BOM-less script
# using the ANSI code page, so a UTF-8 em dash or curly quote breaks the parser.
# Keep this file plain ASCII.

[CmdletBinding()]
param(
    [string]$LabDatabase = 'nutrition_lab',
    [string]$Role = 'mealmaker_dev',
    [string]$SuperUser = 'postgres',
    [string]$PgHost = 'localhost',
    [int]$PgPort = 5432,
    # Drop and recreate if it already exists. Off by default, so a stray run
    # cannot destroy lab work.
    [switch]$Reset
)

$ErrorActionPreference = 'Stop'

$psql = 'C:\Program Files\PostgreSQL\18\bin\psql.exe'
if (-not (Test-Path $psql)) {
    throw "psql not found at $psql"
}

# ---------------------------------------------------------------------------
# Work out the owning role from .env before prompting, so a typo does not waste
# the password entry.
# ---------------------------------------------------------------------------
$repo = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $repo '.env'

if (-not (Test-Path $envFile)) {
    throw ".env not found at $envFile"
}

$urlLine = Select-String -Path $envFile -Pattern '^NUTRITION_DATABASE_URL=' | Select-Object -First 1
if ($urlLine) {
    $url = $urlLine.Line -replace '^NUTRITION_DATABASE_URL=', ''
    $fromUrl = ([uri]$url).UserInfo -split ':', 2 | Select-Object -First 1
    if ($fromUrl) { $Role = $fromUrl }
}

Write-Host "Database : $LabDatabase" -ForegroundColor Cyan
Write-Host "Owner    : $Role" -ForegroundColor Cyan
Write-Host "Server   : ${PgHost}:$PgPort" -ForegroundColor Cyan

# ---------------------------------------------------------------------------
# Superuser password: secure prompt straight into an env var.
# ---------------------------------------------------------------------------
$secure = Read-Host "Password for PostgreSQL role '$SuperUser'" -AsSecureString
$plain = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
    [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
)

$previous = $env:PGPASSWORD
$env:PGPASSWORD = $plain

try {
    $exists = (& $psql -h $PgHost -p $PgPort -U $SuperUser -d postgres -t -A -c "SELECT 1 FROM pg_database WHERE datname = '$LabDatabase';") -join ''

    if ($LASTEXITCODE -ne 0) {
        throw 'Could not connect as the superuser - wrong password, or wrong role name.'
    }

    if ($exists.Trim() -eq '1') {
        if (-not $Reset) {
            Write-Host ''
            Write-Host "'$LabDatabase' already exists - nothing to do." -ForegroundColor Yellow
            Write-Host 'Pass -Reset to drop and recreate it.' -ForegroundColor Yellow
            return
        }

        Write-Host "Dropping existing '$LabDatabase'..." -ForegroundColor Yellow

        $drop = @"
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE datname = '$LabDatabase' AND pid <> pg_backend_pid();
DROP DATABASE "$LabDatabase";
"@

        $drop | & $psql -h $PgHost -p $PgPort -U $SuperUser -d postgres -v ON_ERROR_STOP=1 -f - | Out-Null

        if ($LASTEXITCODE -ne 0) {
            throw 'Could not drop the existing database - a session may still be connected.'
        }
    }

    # -----------------------------------------------------------------------
    # Create it, owned by the dev role.
    #
    # Ownership is what grants the rights needed: since PG15 the public schema is
    # no longer world-writable, but the database owner holds CREATE on it, so no
    # extra grants are required.
    # -----------------------------------------------------------------------
    $create = @"
CREATE DATABASE "$LabDatabase" OWNER $Role;
GRANT CONNECT ON DATABASE "$LabDatabase" TO $Role;
"@

    $create | & $psql -h $PgHost -p $PgPort -U $SuperUser -d postgres -v ON_ERROR_STOP=1 -f - | Out-Null

    if ($LASTEXITCODE -ne 0) {
        throw "Could not create '$LabDatabase'."
    }

    Write-Host ''
    Write-Host "'$LabDatabase' created (empty), owned by $Role." -ForegroundColor Green

    # Prove the role can actually build in it - that is the whole point.
    $sql = "SELECT current_database() || ' | can CREATE: ' || has_database_privilege('$Role', '$LabDatabase', 'CREATE') || ' | objects: ' || (SELECT count(*) FROM pg_class WHERE relnamespace = 'public'::regnamespace);"
    $check = (& $psql -h $PgHost -p $PgPort -U $SuperUser -d $LabDatabase -t -A -c $sql) -join ''

    Write-Host "  $check"
    Write-Host ''
    Write-Host 'Connect as the dev role:' -ForegroundColor Cyan
    Write-Host "  postgresql://$Role`:****@$PgHost`:$PgPort/$LabDatabase"
}
finally {
    $env:PGPASSWORD = $previous
    $plain = $null
}
