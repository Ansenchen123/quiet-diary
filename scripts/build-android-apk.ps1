$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$buildNumberPath = Join-Path $root "build-number.txt"
$dist = Join-Path $root "dist"

if (-not (Test-Path $buildNumberPath)) {
  Set-Content -LiteralPath $buildNumberPath -Value "1"
}

$buildNumber = [int]((Get-Content -LiteralPath $buildNumberPath -Raw).Trim())
$buildLabel = "{0:D4}" -f $buildNumber
$versionName = "1.0.$buildNumber"

if (-not $env:JAVA_HOME -and (Test-Path "C:\Program Files\Android\Android Studio\jbr")) {
  $env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
}

if (-not $env:ANDROID_HOME -and (Test-Path "$env:LOCALAPPDATA\Android\Sdk")) {
  $env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
}

if (-not $env:ANDROID_SDK_ROOT -and $env:ANDROID_HOME) {
  $env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
}

Push-Location $root
try {
  npm run build:web
  if ($LASTEXITCODE -ne 0) {
    throw "Web build failed."
  }

  npx cap sync android
  if ($LASTEXITCODE -ne 0) {
    throw "Capacitor sync failed."
  }

  Push-Location (Join-Path $root "android")
  try {
    .\gradlew.bat assembleDebug "-PdiaryVersionCode=$buildNumber" "-PdiaryVersionName=$versionName"
    if ($LASTEXITCODE -ne 0) {
      throw "Android build failed."
    }
  } finally {
    Pop-Location
  }

  New-Item -ItemType Directory -Force -Path $dist | Out-Null
  $sourceApk = Join-Path $root "android\app\build\outputs\apk\debug\app-debug.apk"
  $targetApk = Join-Path $dist "quiet-diary-$buildLabel-debug.apk"
  Copy-Item -LiteralPath $sourceApk -Destination $targetApk -Force

  Set-Content -LiteralPath $buildNumberPath -Value ($buildNumber + 1)
  Write-Host "APK created: $targetApk"
} finally {
  Pop-Location
}
