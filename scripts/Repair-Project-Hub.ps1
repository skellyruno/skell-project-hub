# Only run this for a trusted download of Skell Project Hub.
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$exe = Join-Path $root 'Skell Project Hub.exe'
$dll = Join-Path $root '_internal\pythonnet\runtime\Python.Runtime.dll'
if (-not (Test-Path -LiteralPath $exe) -or -not (Test-Path -LiteralPath $dll)) {
    Write-Host 'Run this repair from the extracted Skell Project Hub folder.' -ForegroundColor Red
    exit 1
}
Write-Host 'Only bundled EXE/DLL/PYD files in this folder will be unblocked:'
Write-Host $root
Write-Host 'Your project data in AppData will not be touched.'
$answer = Read-Host 'Do you trust this download and want to unblock its runtime? [y/N]'
if ($answer -notin @('y','Y','yes','YES')) { Write-Host 'Cancelled'; exit 2 }
$count = 0
Get-ChildItem -LiteralPath $root -Recurse -File | Where-Object { $_.Extension -in @('.exe','.dll','.pyd') } | ForEach-Object {
    Unblock-File -LiteralPath $_.FullName -ErrorAction Stop
    $count++
}
Write-Host "Unblocked $count bundled runtime files. Launch Skell Project Hub.exe." -ForegroundColor Green
