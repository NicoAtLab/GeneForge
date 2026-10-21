$ErrorActionPreference = 'Stop'
$appRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $appRoot
$bundledRoot = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies'
$nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
$nodePath = if ($nodeCommand) { $nodeCommand.Source } else { Join-Path $bundledRoot 'node\bin\node.exe' }
if (!(Test-Path -LiteralPath $nodePath)) { throw 'Installez Node.js 24 ou plus récent, puis relancez cet installateur.' }
$nodeMajor = [int]((& $nodePath --version).TrimStart('v').Split('.')[0])
if ($nodeMajor -lt 24) { throw 'Node.js 24 ou plus récent est requis.' }
$env:PATH = (Split-Path -Parent $nodePath) + ';' + $env:PATH
$pnpmCommand = Get-Command pnpm.cmd -ErrorAction SilentlyContinue
$pnpmPath = if ($pnpmCommand) { $pnpmCommand.Source } else { Join-Path $bundledRoot 'bin\fallback\pnpm.cmd' }
if (!(Test-Path -LiteralPath $pnpmPath)) { throw 'pnpm est requis : installez-le avec npm install -g pnpm@11.25.0, puis relancez cet installateur.' }
Write-Host 'Installation des dépendances de l''interface…'
& $pnpmPath install --frozen-lockfile
if ($LASTEXITCODE -ne 0) { throw 'Échec de l''installation JavaScript.' }
Write-Host 'Compilation de l''application…'
& $pnpmPath run build
if ($LASTEXITCODE -ne 0) { throw 'Échec de la compilation.' }
$pythonPath = $env:GENEFORGE_PYTHON
if (!$pythonPath) {
    $bundledPython = Join-Path $bundledRoot 'python\python.exe'
    if (Test-Path -LiteralPath $bundledPython) { $pythonPath = $bundledPython }
    else { $pythonCommand = Get-Command python.exe -ErrorAction SilentlyContinue; if ($pythonCommand) { $pythonPath = $pythonCommand.Source } }
}
if ($pythonPath) {
    Write-Host 'Installation du moteur scientifique local…'
    & $pythonPath -m pip install --target .python-deps --only-binary=:all: -r requirements-science.txt
    if ($LASTEXITCODE -ne 0) { Write-Warning 'Primer3 n''a pas pu être installé. Les autres modules restent utilisables. Voir README.md.' }
} else { Write-Warning 'Python est absent. Installez Python 3.12 et Primer3 pour activer le calcul thermodynamique avancé. Voir README.md.' }
Write-Host 'Installation terminée. Vous pouvez lancer Lancer GeneForge.cmd.'
