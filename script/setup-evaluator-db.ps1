# Sets up the database side of the search evaluator (db/lab/evaluator.py).
#
#   powershell -ExecutionPolicy Bypass -File script\setup-evaluator-db.ps1
#
# 1. As mealmaker_dev (password read from .env): the owned-name tables, the
#    evaluator overlay (eval schema, search_pin) and the search resolver.
# 2. As the postgres admin (psql asks for that password): the lab_evaluator
#    login, which can read the lab but write only to the eval schema. Its
#    password is generated here and saved to .env as EVAL_DATABASE_URL.
# 3. Checks lab_evaluator can read the lab and cannot write to it.
#
# Safe to run again: every step replaces what it made before, and a new
# lab_evaluator password replaces the old one in .env.

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$psql = 'C:\Program Files\PostgreSQL\18\bin\psql.exe'
$envFile = Join-Path $root '.env'
$db = 'nutrition_lab'

function Run-Psql([string[]]$psqlArgs, [string]$what) {
    Write-Host "-> $what"
    & $psql @psqlArgs
    if ($LASTEXITCODE -ne 0) { throw "psql failed: $what" }
}

# --- mealmaker_dev, from NUTRITION_DATABASE_URL in .env
$lines = [IO.File]::ReadAllLines($envFile)
$urlLine = $lines | Where-Object { $_ -match '^\s*NUTRITION_DATABASE_URL\s*=' } | Select-Object -First 1
if (-not $urlLine) { throw 'NUTRITION_DATABASE_URL is not in .env' }
$uri = [Uri](($urlLine -split '=', 2)[1].Trim().Trim('"').Trim("'"))
$user, $pass = $uri.UserInfo -split ':', 2
$user = [Uri]::UnescapeDataString($user)
$dbHost = $uri.Host
$port = if ($uri.Port -gt 0) { $uri.Port } else { 5432 }

Push-Location $root
try {
    $env:PGPASSWORD = [Uri]::UnescapeDataString($pass)
    $dev = @('-h', $dbHost, '-p', "$port", '-U', $user, '-d', $db, '-q', '-v', 'ON_ERROR_STOP=1')
    Run-Psql ($dev + @('-f', 'db/lab/9_food_names.sql')) 'owned-name tables (9_food_names.sql)'
    Run-Psql ($dev + @('-f', 'db/lab/10_eval.sql')) 'evaluator overlay (10_eval.sql)'
    Run-Psql ($dev + @('-f', 'db/lab/4_search.sql')) 'search resolver (4_search.sql)'
    Remove-Item Env:PGPASSWORD

    # --- postgres admin: the lab_evaluator login
    $chars = [char[]]'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
    $evalPass = -join (1..24 | ForEach-Object { $chars | Get-Random })
    Write-Host ''
    Write-Host 'Now the postgres admin password, to create the lab_evaluator login:'
    Run-Psql @('-h', $dbHost, '-p', "$port", '-U', 'postgres', '-d', $db, '-q', '-v', "pw=$evalPass", '-f', 'db/lab/eval-role.sql') 'lab_evaluator login (eval-role.sql)'

    # --- save EVAL_DATABASE_URL to .env (no BOM, other lines untouched)
    $evalUrl = "EVAL_DATABASE_URL=postgresql://lab_evaluator:$evalPass@${dbHost}:$port/$db"
    $kept = @($lines | Where-Object { $_ -notmatch '^\s*EVAL_DATABASE_URL\s*=' })
    [IO.File]::WriteAllLines($envFile, [string[]]($kept + $evalUrl), (New-Object Text.UTF8Encoding $false))
    Write-Host '-> saved EVAL_DATABASE_URL to .env'

    # --- check: can read, cannot write outside eval. psql's error text is
    # captured, so stop treating stderr as fatal here.
    $ErrorActionPreference = 'Continue'
    $env:PGPASSWORD = $evalPass
    $ev = @('-h', $dbHost, '-p', "$port", '-U', 'lab_evaluator', '-d', $db, '-At')
    $read = & $psql @ev -c 'SELECT count(*) FROM food_name' 2>&1
    if ($LASTEXITCODE -ne 0) { throw "lab_evaluator cannot read the lab: $read" }
    Write-Host "-> lab_evaluator can read the lab ($read owned names)"
    $null = & $psql @ev -c 'UPDATE food SET scope = scope WHERE false' 2>&1
    if ($LASTEXITCODE -eq 0) { throw 'lab_evaluator CAN write to food: the safeguard is not working' }
    Write-Host '-> lab_evaluator cannot write to the lab tables (as intended)'
    Remove-Item Env:PGPASSWORD

    Write-Host ''
    Write-Host 'Done. Start the evaluator with:  python db\lab\evaluator.py'
}
finally {
    Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
    Pop-Location
}
