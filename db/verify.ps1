# Runs db/005_verify.sql against the nutrition database.
# Kept as a script because parsing the connection URL inline in PowerShell is
# error-prone (quotes/colons get mangled by the shell).

$ErrorActionPreference = 'Stop'

$psql = 'C:\Program Files\PostgreSQL\18\bin\psql.exe'
$repo = (Resolve-Path "$PSScriptRoot\..").Path
$envFile = Join-Path $repo '.env'

$line = Get-Content $envFile | Where-Object { $_ -match '^NUTRITION_DATABASE_URL=' } | Select-Object -First 1
if (-not $line) { throw 'NUTRITION_DATABASE_URL is not set in .env' }

$parsed = [System.Uri](($line -split '=', 2)[1].Trim())
$userInfo = $parsed.UserInfo -split ':', 2
$env:PGPASSWORD = $userInfo[1]

try {
    & $psql -h $parsed.Host `
        -p $(if ($parsed.Port -gt 0) { $parsed.Port } else { 5432 }) `
        -U $userInfo[0] `
        -d $parsed.AbsolutePath.TrimStart('/') `
        -f (Join-Path $repo 'db\005_verify.sql')
}
finally {
    Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue
}
