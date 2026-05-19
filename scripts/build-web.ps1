$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$www = Join-Path $root "www"

if (Test-Path $www) {
  Remove-Item -LiteralPath $www -Recurse -Force
}

New-Item -ItemType Directory -Force -Path $www | Out-Null

$items = @(
  "index.html",
  "styles.css",
  "app.js",
  "manifest.webmanifest",
  "sw.js",
  "icons",
  "opendesign"
)

foreach ($item in $items) {
  $source = Join-Path $root $item
  $target = Join-Path $www $item
  if (Test-Path $source -PathType Container) {
    Copy-Item -LiteralPath $source -Destination $target -Recurse -Force
  } else {
    Copy-Item -LiteralPath $source -Destination $target -Force
  }
}

Write-Host "Web assets copied to $www"
