# Verifies the nutrition database is reachable and writable using
# NUTRITION_DATABASE_URL from .env.
#
# Why a script rather than an inline command: the connection string contains a
# password, so it must never appear on a command line or in output. PowerShell
# 5.1 also mangles quotes and || inside inline node/psql invocations, which has
# repeatedly broken one-liners. Here the password is parsed out of .env and put
# straight into PGPASSWORD, and only non-secret facts are echoed.
#
# Usage (from the repo root):
#   powershell -NoProfile -ExecutionPolicy Bypass -File script/check-nutrition-db.ps1

$ErrorActionPreference = 'Stop'
$psql = 'C:\Program Files\PostgreSQL\18\bin\psql.exe'

$line = Get-Content .env | Where-Object { $_ -match '^NUTRITION_DATABASE_URL=' } | Select-Object -First 1
if (-not $line) {
    Write-Output 'NUTRITION_DATABASE_URL is NOT set in .env'
    exit 1
}

$url = ($line -split '=', 2)[1].Trim()
$parsed = [System.Uri]$url
$userInfo = $parsed.UserInfo -split ':', 2
$user = $userInfo[0]
$pass = $userInfo[1]
$host_ = $parsed.Host
$port = if ($parsed.Port -gt 0) { $parsed.Port } else { 5432 }
$db = $parsed.AbsolutePath.TrimStart('/')

Write-Output "host=$host_ port=$port db=$db user=$user passwordLength=$($pass.Length)"
Write-Output ''

# Keep the secret out of the command line and out of the transcript.
$env:PGPASSWORD = $pass

try {
    Write-Output '--- identity ---'
    & $psql -h $host_ -p $port -U $user -d $db -t -A -c "SELECT current_user || ' @ ' || current_database();"

    Write-Output '--- server version ---'
    & $psql -h $host_ -p $port -U $user -d $db -t -A -c "SHOW server_version;"

    Write-Output '--- tables ---'
    $tables = & $psql -h $host_ -p $port -U $user -d $db -t -A -c "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE';"
    Write-Output "public base tables: $tables"

    Write-Output '--- extensions ---'
    & $psql -h $host_ -p $port -U $user -d $db -t -A -c "SELECT extname FROM pg_extension ORDER BY extname;"

    Write-Output '--- write test ---'
    & $psql -h $host_ -p $port -U $user -d $db -t -A -c "CREATE TABLE _write_probe (id int primary key, note text); INSERT INTO _write_probe VALUES (1, 'ok'); SELECT note FROM _write_probe WHERE id = 1; DROP TABLE _write_probe;"

    Write-Output '--- truncate/delete rights ---'
    & $psql -h $host_ -p $port -U $user -d $db -t -A -c "SELECT has_schema_privilege('public','CREATE') AS can_create, has_database_privilege(current_database(),'CONNECT') AS can_connect;"

    Write-Output ''
    Write-Output 'ALL CHECKS PASSED'
}
finally {
    Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue
}
