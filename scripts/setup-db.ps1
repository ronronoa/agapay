<#
.SYNOPSIS
  Creates the local `agapay` role and database, then applies migrations and seed.

.DESCRIPTION
  Prompts for the local Postgres superuser password so the secret is never
  written to disk or echoed into a terminal history. Run this once:

    powershell -ExecutionPolicy Bypass -File .\scripts\setup-db.ps1

  It is safe to re-run: CREATE ROLE/DATABASE are guarded, and the seed is
  idempotent (uses upsert).
#>

$ErrorActionPreference = 'Stop'

$DbName    = 'agapay'
$AppRole   = 'agapay'
$AppPass   = 'agapay'
$SuperUser = 'postgres'
$Port      = 5432

# Locate psql. Prefer a PATH entry, else the standard Windows install location.
$psql = Get-Command psql -ErrorAction SilentlyContinue
if (-not $psql) {
    $candidate = Get-ChildItem 'C:\Program Files\PostgreSQL\*\bin\psql.exe' -ErrorAction SilentlyContinue |
        Sort-Object FullName -Descending |
        Select-Object -First 1
    if ($candidate) { $psql = $candidate }
}
if (-not $psql) {
    throw 'psql not found. Add PostgreSQL\18\bin to PATH or install Postgres.'
}
$psqlPath = if ($psql.Source) { $psql.Source } else { $psql.FullName }
Write-Host "Using psql: $psqlPath"

Write-Host ''
Write-Host 'PostgreSQL superuser password (input is hidden):' -ForegroundColor Cyan
$secure = Read-Host -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try {
    $superPass = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
}
finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
}

if ([string]::IsNullOrWhiteSpace($superPass)) { throw 'Empty password.' }

$env:PGPASSWORD = $superPass

function Invoke-Sql([string]$sql, [string]$db = 'postgres') {
    & $psqlPath -w -v ON_ERROR_STOP=1 -U $SuperUser -h 127.0.0.1 -p $Port -d $db -tAc $sql
    if ($LASTEXITCODE -ne 0) { throw "psql failed for: $sql" }
}

Write-Host 'Checking superuser credentials...'
Invoke-Sql 'SELECT 1;' | Out-Null
Write-Host '  OK' -ForegroundColor Green

# Idempotent role creation: DO blocks skip when the role already exists.
Write-Host 'Ensuring role...'
Invoke-Sql @"
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '$AppRole') THEN
    CREATE ROLE $AppRole LOGIN PASSWORD '$AppPass';
  END IF;
END
\$\$;
"@ | Out-Null

# The database cannot be created inside a DO block, so check first.
$exists = Invoke-Sql "SELECT 1 FROM pg_database WHERE datname = '$DbName';"
if ($exists.Trim() -ne '1') {
    Write-Host 'Creating database...'
    Invoke-Sql "CREATE DATABASE $DbName OWNER $AppRole;" | Out-Null
}
else {
    Write-Host 'Database already exists; skipping.' -ForegroundColor DarkGray
}

$env:PGPASSWORD = $AppPass

Write-Host 'Applying migrations...'
Push-Location (Join-Path $PSScriptRoot '..\apps\api')
try {
    & npx prisma migrate deploy
    if ($LASTEXITCODE -ne 0) { throw 'migrate deploy failed' }

    Write-Host 'Seeding...'
    & npm run db:seed
    if ($LASTEXITCODE -ne 0) { throw 'db:seed failed' }
}
finally {
    Pop-Location
}

$env:PGPASSWORD = $null

Write-Host ''
Write-Host 'Done. Verify with:' -ForegroundColor Green
Write-Host '  npm run test:integration'
Write-Host ''
Write-Host "DATABASE_URL in .env should be: postgresql://${AppRole}:${AppPass}@localhost:${Port}/${DbName}?schema=public"