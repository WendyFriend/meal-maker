# Loads USDA FoodData Central SR Legacy CSVs into the local `nutrition` database.
#
# Runs the SQL files in db/ in order, then \copy's the CSVs into staging.
# All CSV parsing happens inside PostgreSQL: COPY ... WITH (FORMAT csv, HEADER)
# handles RFC 4180 quoting, embedded commas and CRLF correctly, and HEADER
# skips the first line so the UTF-8 BOM in the first header cell is irrelevant.
#
# Idempotent: staging tables are recreated and typed tables truncated each run.
#
# Usage (from the repo root):
#   powershell -NoProfile -ExecutionPolicy Bypass -File db\load-sr-legacy.ps1
#
# The password is read from NUTRITION_DATABASE_URL in .env and handed to psql
# via PGPASSWORD, so it never appears on a command line or in the transcript.

$ErrorActionPreference = 'Stop'

$psql = 'C:\Program Files\PostgreSQL\18\bin\psql.exe'
$repo = (Resolve-Path "$PSScriptRoot\..").Path
$envFile = Join-Path $repo '.env'
$csvDir = Join-Path $repo 'data\usda\FoodData_Central_sr_legacy_food_csv_2018-04'

if (-not (Test-Path $csvDir)) {
    throw "CSV directory not found: $csvDir"
}

# --- credentials --------------------------------------------------------
$line = Get-Content $envFile | Where-Object { $_ -match '^NUTRITION_DATABASE_URL=' } | Select-Object -First 1
if (-not $line) { throw 'NUTRITION_DATABASE_URL is not set in .env' }

$url = ($line -split '=', 2)[1].Trim()
$parsed = [System.Uri]$url
$userInfo = $parsed.UserInfo -split ':', 2
$env:PGPASSWORD = $userInfo[1]
$pgUser = $userInfo[0]
$pgHost = $parsed.Host
$pgPort = if ($parsed.Port -gt 0) { $parsed.Port } else { 5432 }
$pgDb = $parsed.AbsolutePath.TrimStart('/')

function Invoke-Psql {
    param([string[]]$Arguments, [string]$Label)

    & $psql -h $pgHost -p $pgPort -U $pgUser -d $pgDb -v ON_ERROR_STOP=1 @Arguments
    if ($LASTEXITCODE -ne 0) { throw "psql failed (exit $LASTEXITCODE): $Label" }
}

function Invoke-SqlFile([string]$RelativePath) {
    Write-Host "`n=== $RelativePath ===" -ForegroundColor Cyan
    Invoke-Psql -Arguments @('-q', '-f', (Join-Path $repo $RelativePath)) -Label $RelativePath
}

function Copy-Csv([string]$Table, [string]$FileName, [string]$Columns) {
    $path = (Join-Path $csvDir $FileName).Replace('\', '/')
    Write-Host ("  loading {0,-34} -> stg_{1}" -f $FileName, $Table)
    $sql = "\copy stg_$Table ($Columns) FROM '$path' WITH (FORMAT csv, HEADER true, ENCODING 'UTF8')"
    Invoke-Psql -Arguments @('-q', '-c', $sql) -Label "copy $FileName"
}

try {
    Write-Host "Target: $pgDb @ ${pgHost}:${pgPort} as $pgUser"

    Invoke-SqlFile 'db\001_staging.sql'

    Write-Host "`n=== loading CSVs ===" -ForegroundColor Cyan
    Copy-Csv 'food_category'    'food_category.csv'    'id, code, description'
    Copy-Csv 'nutrient'         'nutrient.csv'         'id, name, unit_name, nutrient_nbr, rank'
    Copy-Csv 'food'             'food.csv'             'fdc_id, data_type, description, food_category_id, publication_date'
    Copy-Csv 'food_nutrient'    'food_nutrient.csv'    'id, fdc_id, nutrient_id, amount, data_points, derivation_id, min, max, median, footnote, min_year_acquired'
    Copy-Csv 'food_portion'     'food_portion.csv'     'id, fdc_id, seq_num, amount, measure_unit_id, portion_description, modifier, gram_weight, data_points, footnote, min_year_acquired'

    Invoke-SqlFile 'db\002_schema.sql'
    Invoke-SqlFile 'db\003_transform.sql'
    Invoke-SqlFile 'db\004_view.sql'
    Invoke-SqlFile 'db\007_search.sql'
    Invoke-SqlFile 'db\008_synonyms.sql'

    Write-Host "`n=== verification ===" -ForegroundColor Cyan
    Invoke-Psql -Label 'verify' -Arguments @('-c', @'
SELECT 'food'          AS table_name, count(*) FROM food
UNION ALL SELECT 'food_nutrient', count(*) FROM food_nutrient
UNION ALL SELECT 'food_portion',  count(*) FROM food_portion
UNION ALL SELECT 'nutrient',      count(*) FROM nutrient
UNION ALL SELECT 'food_category', count(*) FROM food_category;

SELECT scope, count(*) AS foods FROM food GROUP BY scope ORDER BY scope;

SELECT count(*) AS foods_with_kcal FROM v_food_core WHERE kcal IS NOT NULL;
'@)

    Write-Host "`n=== sample: pasta sauce / canned beans ===" -ForegroundColor Cyan
    Invoke-Psql -Label 'sample' -Arguments @('-c', @'
SELECT description, category, scope, round(kcal) AS kcal,
       round(protein_g, 1) AS protein, round(fat_g, 1) AS fat, round(carb_g, 1) AS carb
FROM v_food_core
WHERE description ILIKE '%pasta%' AND description ILIKE '%sauce%'
   OR description ILIKE 'beans, kidney%canned%'
   OR description ILIKE 'chickpeas%canned%'
ORDER BY description
LIMIT 12;
'@)

    Write-Host "`nLOAD COMPLETE" -ForegroundColor Green
}
finally {
    Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue
}
