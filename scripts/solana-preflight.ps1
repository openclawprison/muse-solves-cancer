$ErrorActionPreference = 'Stop'

$requiredCommands = @('node', 'solana', 'spl-token', 'rustc', 'cargo', 'anchor')
$missing = @()

foreach ($commandName in $requiredCommands) {
  $command = Get-Command $commandName -ErrorAction SilentlyContinue
  if ($null -eq $command) {
    Write-Host "MISSING  $commandName"
    $missing += $commandName
  } else {
    $version = & $command.Source --version 2>$null | Select-Object -First 1
    Write-Host "OK       $commandName  $version"
  }
}

if ($missing.Count -gt 0) {
  Write-Error "Missing required commands: $($missing -join ', ')"
}

Write-Host 'Solana deployment toolchain is ready.'
