param([switch]$NoOpen)
$ErrorActionPreference = 'Stop'
$appRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $appRoot
$nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
$nodePath = if ($nodeCommand) { $nodeCommand.Source } else { Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' }
if (!(Test-Path -LiteralPath $nodePath)) { throw 'Node.js 24 ou plus récent est requis. Installez Node.js, puis relancez GeneForge.' }
$nodeMajor = [int]((& $nodePath --version).TrimStart('v').Split('.')[0])
if ($nodeMajor -lt 24) { throw 'GeneForge nécessite Node.js 24 ou plus récent.' }
if (!(Test-Path -LiteralPath (Join-Path $appRoot 'dist\index.html'))) { throw 'Application non compilée. Lancez Installer GeneForge.cmd une première fois.' }
$address = 'http://127.0.0.1:4173'
function Test-GeneForge {
    try {
        $health = Invoke-RestMethod -Uri "$address/api/health" -TimeoutSec 2
        return ($health.status -eq 'ok' -and $health.schemaVersion -eq 1 -and $health.primer3.engine -eq 'primer3-py')
    } catch { return $false }
}
if (!(Test-GeneForge)) {
    $dataPath = Join-Path $appRoot 'data'
    New-Item -ItemType Directory -Path $dataPath -Force | Out-Null
    $scriptPath = Join-Path $appRoot 'server\index.ts'
    $process = Start-Process -FilePath $nodePath -ArgumentList @('--disable-warning=ExperimentalWarning', ('"' + $scriptPath + '"')) -WorkingDirectory $appRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $dataPath 'server.log') -RedirectStandardError (Join-Path $dataPath 'server.error.log') -PassThru
    @{ processId = $process.Id; scriptPath = $scriptPath } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $dataPath 'server-process.json') -Encoding utf8
    $ready = $false
    for ($attempt=0; $attempt -lt 30; $attempt++) {
        if (Test-GeneForge) { $ready = $true; break }
        if ($process.HasExited) { break }
        Start-Sleep -Milliseconds 300
    }
    if (!$ready) { throw 'Le serveur local ne répond pas. Consultez data\server.error.log et vérifiez que le port 4173 est disponible.' }
}
Write-Host "GeneForge est disponible : $address"
if (!$NoOpen) { Start-Process $address }
