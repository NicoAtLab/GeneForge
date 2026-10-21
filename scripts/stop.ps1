$ErrorActionPreference = 'Stop'
$appRoot = Split-Path -Parent $PSScriptRoot
$processFile = Join-Path $appRoot 'data\server-process.json'
if (!(Test-Path -LiteralPath $processFile)) { Write-Host 'Aucun serveur lancé par le raccourci à arrêter.'; exit 0 }
$record = Get-Content -LiteralPath $processFile -Raw | ConvertFrom-Json
$expectedScript = Join-Path $appRoot 'server\index.ts'
if ($record.scriptPath -ne $expectedScript) { throw 'Le fichier de processus ne correspond pas à cette installation.' }
$running = Get-CimInstance Win32_Process -Filter "ProcessId = $([int]$record.processId)"
if ($running -and $running.Name -eq 'node.exe' -and $running.CommandLine.Contains($expectedScript)) {
    Stop-Process -Id ([int]$record.processId)
    Write-Host 'Serveur GeneForge arrêté. Les données SQLite sont conservées.'
} else { Write-Host 'Le serveur GeneForge est déjà arrêté.' }
Remove-Item -LiteralPath $processFile
