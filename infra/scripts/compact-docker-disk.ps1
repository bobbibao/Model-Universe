# Shrinks Docker Desktop's WSL disk file (docker_data.vhdx) after images or build cache were deleted. Windows never
# shrinks the file by itself, so space freed inside Docker stays used on C: until it is compacted.
# Run from an elevated PowerShell (Run as administrator):  powershell -ExecutionPolicy Bypass -File infra\scripts\compact-docker-disk.ps1
# Volumes (the shop database, uploads) are kept; only free space inside the disk file is released.

$ErrorActionPreference = 'Stop'
$principal = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw 'Run this script from PowerShell opened with "Run as administrator".'
}
$vhdx = Join-Path $env:LOCALAPPDATA 'Docker\wsl\disk\docker_data.vhdx'
if (-not (Test-Path $vhdx)) { throw "Docker disk not found: $vhdx" }

# Remove what Docker can rebuild: build cache and dangling images (containers and volumes are kept).
if (Get-Command docker -ErrorAction SilentlyContinue) {
  docker builder prune -af | Select-Object -Last 1
  docker image prune -f | Select-Object -Last 1
}

$before = (Get-Item $vhdx).Length / 1GB
Write-Host ('Docker disk before: {0:N1} GB' -f $before)
Get-Process 'Docker Desktop', 'com.docker.backend' -ErrorAction SilentlyContinue | Stop-Process -Force
wsl --shutdown
Start-Sleep -Seconds 5

if (Get-Command Optimize-VHD -ErrorAction SilentlyContinue) {
  Optimize-VHD -Path $vhdx -Mode Full
} else {
  # Windows Home has no Hyper-V module: diskpart compacts the same file.
  $script = Join-Path $env:TEMP 'compact-docker-disk.txt'
  @("select vdisk file=`"$vhdx`"", 'attach vdisk readonly', 'compact vdisk', 'detach vdisk') | Set-Content $script -Encoding ascii
  diskpart /s $script
  Remove-Item $script
}

$after = (Get-Item $vhdx).Length / 1GB
Write-Host ('Docker disk after: {0:N1} GB (freed {1:N1} GB)' -f $after, ($before - $after))
Start-Process (Join-Path $env:ProgramFiles 'Docker\Docker\Docker Desktop.exe')
