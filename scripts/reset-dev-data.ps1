#requires -Version 7.0
<#
.SYNOPSIS
  Wipes all local dev data so the next seed starts minimal.

.DESCRIPTION
  Run with PowerShell 7 (pwsh): Windows PowerShell 5.1 strips the quoted
  table names this script passes to psql.
  TRUNCATEs every app table (RESTART IDENTITY, so reference numbers restart
  clean) except _prisma_migrations, then you re-run `npm run db:seed`.
  Dev-database only: aborts unless DATABASE_URL points at localhost, and
  requires the --yes flag. There is no undo.

  Usage:
    pwsh -ExecutionPolicy Bypass -File .\scripts\reset-dev-data.ps1 --yes
#>

param([switch]$yes)

$ErrorActionPreference = 'Stop'

if (-not $yes) {
  throw 'Refusing to wipe without --yes. Re-run with the --yes flag to confirm data loss.'
}

# Load DATABASE_URL from the root .env (gitignored, never committed).
$rootEnv = Join-Path $PSScriptRoot '..\.env'
if (-not (Test-Path $rootEnv)) { throw '.env not found at repo root.' }
$dbUrl = (Get-Content $rootEnv | Where-Object { $_ -match '^DATABASE_URL=' } | ForEach-Object { $_ -replace '^DATABASE_URL=', '' } | Select-Object -First 1).Trim()
if ([string]::IsNullOrWhiteSpace($dbUrl)) { throw 'DATABASE_URL is not set in .env.' }
if ($dbUrl -notmatch '@(localhost|127\.0\.0\.1)(:|\/)') {
  throw "Refusing to wipe a non-local database. DATABASE_URL must point at localhost. Got: $($dbUrl -replace ':[^:@/]+@', ':***@')"
}

if ($dbUrl -notmatch '^postgresql://([^:]+):([^@]+)@([^:/]+)(:(\d+))?/([^?]+)') {
  throw 'Could not parse DATABASE_URL.'
}
$DbUser, $DbPass, $DbHost, $DbPort, $DbName = $Matches[1], $Matches[2], $Matches[3], $(if ($Matches[5]) { $Matches[5] } else { '5432' }), $Matches[6]

# Locate psql. Prefer a PATH entry, else the standard Windows install location.
$psql = Get-Command psql -ErrorAction SilentlyContinue
if (-not $psql) {
  $candidate = Get-ChildItem 'C:\Program Files\PostgreSQL\*\bin\psql.exe' -ErrorAction SilentlyContinue |
    Sort-Object FullName -Descending |
    Select-Object -First 1
  if ($candidate) { $psql = $candidate }
}
if (-not $psql) { throw 'psql not found. Add PostgreSQL\bin to PATH or install Postgres.' }
$psqlPath = if ($psql.Source) { $psql.Source } else { $psql.FullName }

$env:PGPASSWORD = $DbPass

function Invoke-Db([string]$sql) {
  $out = & $psqlPath -w -v ON_ERROR_STOP=1 -U $DbUser -h $DbHost -p $DbPort -d $DbName -tAc $sql
  if ($LASTEXITCODE -ne 0) { throw "psql failed for: $sql" }
  return ($out | Out-String).Trim()
}

# Every model in apps/api/prisma/schema.prisma. _prisma_migrations is
# deliberately excluded so `migrate deploy` stays a no-op afterwards.
$tables = @(
  'AuditLog', 'EmailNotification', 'DistributionItem', 'Distribution',
  'CalendarEvent', 'RequestStatusEvent', 'RequestedItem', 'AssistanceRequest',
  'InventoryMovement', 'InventoryItem', 'DonationItem', 'Donation',
  'CampaignPriorityItem', 'CampaignArea', 'Campaign', 'ItemType',
  'AuthToken', 'RefreshToken', 'ChatUsage', 'SequenceCounter', 'User'
)

Write-Host "Target: $DbHost`:$DbPort/$DbName as $DbUser (local dev only)" -ForegroundColor Yellow
Write-Host 'Row counts before wipe:'
foreach ($t in $tables) {
  $count = Invoke-Db "SELECT COUNT(*) FROM `"$t`";"
  Write-Host ("  {0,-22} {1}" -f $t, $count)
}

$quoted = ($tables | ForEach-Object { "`"$_`"" }) -join ', '
Invoke-Db "TRUNCATE $quoted RESTART IDENTITY CASCADE;" | Out-Null

Write-Host 'Row counts after wipe:'
$remaining = 0
foreach ($t in $tables) {
  $count = Invoke-Db "SELECT COUNT(*) FROM `"$t`";"
  $remaining += [int]$count
}
Write-Host ("  all tables: {0} rows" -f $remaining)
if ($remaining -ne 0) { throw 'Wipe incomplete: rows remain.' }

$env:PGPASSWORD = $null

Write-Host ''
Write-Host 'Done. Re-seed the minimal base with:' -ForegroundColor Green
Write-Host '  npm run db:seed'
