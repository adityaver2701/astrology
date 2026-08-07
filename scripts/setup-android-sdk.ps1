<#
.SYNOPSIS
    Installs the minimum Android SDK needed to build this app — no Android Studio.

.DESCRIPTION
    Android Studio is ~8-12 GB, and almost all of that is the IDE, the emulator,
    and system images. Building an APK needs none of them. This installs only:

        JDK 21 (Temurin)         ~180 MB   AGP 8.13 requires JDK 17+
        cmdline-tools;latest     ~180 MB   provides sdkmanager
        platform-tools           ~15 MB    adb
        platforms;android-36     ~90 MB    compileSdk 36 (from android/variables.gradle)
        build-tools;36.0.0       ~60 MB

    ≈525 MB, plus ~700 MB-1 GB of Gradle cache on your first build.

    No emulator is installed — this assumes you're testing on a real phone over
    USB. To add one later:
        sdkmanager "emulator" "system-images;android-36;google_apis;x86_64"

.NOTES
    Run in a NORMAL PowerShell window (not admin — everything is user-scoped).
    Re-running is safe; each step is skipped if already done.

    If Google publishes newer command-line tools, update $CmdlineToolsZip below.
    The current filename is listed at https://developer.android.com/studio
    under "Command line tools only".
#>

$ErrorActionPreference = 'Stop'

$CmdlineToolsZip = 'commandlinetools-win-15859902_latest.zip'
$SdkRoot         = Join-Path $env:LOCALAPPDATA 'Android\Sdk'
$ProjectRoot     = Split-Path -Parent $PSScriptRoot

function Write-Step($msg) { Write-Host "`n=== $msg ===" -ForegroundColor Cyan }
function Write-Ok($msg)   { Write-Host "  OK  $msg" -ForegroundColor Green }
function Write-Skip($msg) { Write-Host "  --  $msg (already done)" -ForegroundColor DarkGray }

# ── 1. JDK ────────────────────────────────────────────────────────────────
Write-Step 'Java Development Kit 21'

$javaOk = $false
if ($env:JAVA_HOME -and (Test-Path (Join-Path $env:JAVA_HOME 'bin\java.exe'))) {
    $ver = & (Join-Path $env:JAVA_HOME 'bin\java.exe') -version 2>&1 | Select-Object -First 1
    Write-Skip "JAVA_HOME set - $ver"
    $javaOk = $true
}

if (-not $javaOk) {
    Write-Host '  Installing Eclipse Temurin JDK 21 via winget...'
    winget install --id EclipseAdoptium.Temurin.21.JDK --silent --accept-package-agreements --accept-source-agreements
    # winget doesn't set JAVA_HOME; find the install and set it ourselves.
    $jdk = Get-ChildItem 'C:\Program Files\Eclipse Adoptium' -Directory -ErrorAction SilentlyContinue |
           Where-Object { $_.Name -like 'jdk-21*' } | Select-Object -First 1
    if (-not $jdk) { throw 'JDK 21 install not found. Install manually from https://adoptium.net and set JAVA_HOME.' }
    [Environment]::SetEnvironmentVariable('JAVA_HOME', $jdk.FullName, 'User')
    $env:JAVA_HOME = $jdk.FullName
    Write-Ok "JAVA_HOME = $($jdk.FullName)"
}
$env:PATH = "$env:JAVA_HOME\bin;$env:PATH"

# ── 2. Command-line tools ─────────────────────────────────────────────────
Write-Step 'Android SDK command-line tools'

$SdkManager = Join-Path $SdkRoot 'cmdline-tools\latest\bin\sdkmanager.bat'

if (Test-Path $SdkManager) {
    Write-Skip 'cmdline-tools present'
} else {
    New-Item -ItemType Directory -Force -Path $SdkRoot | Out-Null
    $zipPath = Join-Path $env:TEMP $CmdlineToolsZip
    $url     = "https://dl.google.com/android/repository/$CmdlineToolsZip"

    if (-not (Test-Path $zipPath)) {
        Write-Host "  Downloading $CmdlineToolsZip (~180 MB)..."
        # Progress bar makes Invoke-WebRequest dramatically slower on large files.
        $prev = $ProgressPreference; $ProgressPreference = 'SilentlyContinue'
        Invoke-WebRequest -Uri $url -OutFile $zipPath
        $ProgressPreference = $prev
    }

    # The zip contains a bare `cmdline-tools/` folder, but sdkmanager insists on
    # living at cmdline-tools/<channel>/ — so unpack to a staging dir and move.
    $staging = Join-Path $env:TEMP 'cmdline-tools-staging'
    Remove-Item $staging -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host '  Extracting...'
    Expand-Archive -Path $zipPath -DestinationPath $staging -Force

    $dest = Join-Path $SdkRoot 'cmdline-tools\latest'
    New-Item -ItemType Directory -Force -Path (Split-Path $dest) | Out-Null
    Move-Item (Join-Path $staging 'cmdline-tools') $dest -Force
    Remove-Item $staging -Recurse -Force -ErrorAction SilentlyContinue

    if (-not (Test-Path $SdkManager)) { throw "sdkmanager not found at $SdkManager after extraction." }
    Write-Ok "Installed to $SdkRoot"
}

# ── 3. Environment variables ──────────────────────────────────────────────
Write-Step 'Environment variables'

[Environment]::SetEnvironmentVariable('ANDROID_HOME', $SdkRoot, 'User')
# ANDROID_SDK_ROOT is deprecated but native-run and some Gradle plugins still read it.
[Environment]::SetEnvironmentVariable('ANDROID_SDK_ROOT', $SdkRoot, 'User')
$env:ANDROID_HOME = $SdkRoot
$env:ANDROID_SDK_ROOT = $SdkRoot

$userPath = [Environment]::GetEnvironmentVariable('PATH', 'User')
$toAdd = @(
    (Join-Path $SdkRoot 'platform-tools'),
    (Join-Path $SdkRoot 'cmdline-tools\latest\bin')
) | Where-Object { $userPath -notlike "*$_*" }

if ($toAdd) {
    [Environment]::SetEnvironmentVariable('PATH', (($userPath.TrimEnd(';')) + ';' + ($toAdd -join ';')), 'User')
    Write-Ok "Added to PATH: $($toAdd -join ', ')"
} else {
    Write-Skip 'PATH already contains the SDK directories'
}
$env:PATH = "$env:PATH;$($toAdd -join ';')"

# ── 4. SDK packages ───────────────────────────────────────────────────────
Write-Step 'Accepting licenses'
# sdkmanager prompts y/N per license; feed it enough confirmations to clear them.
$yes = ("y`r`n" * 50)
$yes | & $SdkManager --sdk_root="$SdkRoot" --licenses | Out-Null
Write-Ok 'Licenses accepted'

Write-Step 'Installing SDK packages (~165 MB)'
# Versions come from android/variables.gradle: compileSdk 36, minSdk 24.
& $SdkManager --sdk_root="$SdkRoot" `
    'platform-tools' `
    'platforms;android-36' `
    'build-tools;36.0.0'
if ($LASTEXITCODE -ne 0) { throw "sdkmanager failed with exit code $LASTEXITCODE" }
Write-Ok 'platform-tools, platforms;android-36, build-tools;36.0.0'

# ── 5. local.properties ───────────────────────────────────────────────────
Write-Step 'Project configuration'

$androidDir = Join-Path $ProjectRoot 'android'
if (Test-Path $androidDir) {
    # local.properties is a Java Properties file, where `\` is an escape
    # character — backslash paths must be doubled, and it is very easy to
    # double them twice. Gradle accepts forward slashes on Windows, so use
    # those and avoid the escaping problem completely.
    $sdkPath = $SdkRoot -replace '\\', '/'
    Set-Content -Path (Join-Path $androidDir 'local.properties') `
        -Value "sdk.dir=$sdkPath" -Encoding ASCII
    Write-Ok "android/local.properties -> $sdkPath"
} else {
    Write-Host '  android/ not found - run `npm run android:init` first, then re-run this script.' -ForegroundColor Yellow
}

# ── 6. Verify ─────────────────────────────────────────────────────────────
Write-Step 'Verification'

$adb = Join-Path $SdkRoot 'platform-tools\adb.exe'
if (Test-Path $adb) {
    Write-Ok "adb: $(& $adb --version | Select-Object -First 1)"
} else {
    Write-Host '  adb NOT found - platform-tools may have failed to install.' -ForegroundColor Red
}

$size = (Get-ChildItem $SdkRoot -Recurse -File -ErrorAction SilentlyContinue |
         Measure-Object -Property Length -Sum).Sum / 1GB
Write-Host ("`nSDK size on disk: {0:N2} GB" -f $size)

Write-Host @"

Done. Next steps:

  1. CLOSE this terminal and open a new one, so the new PATH is picked up.
  2. On your phone: Settings > About phone > tap 'Build number' 7 times,
     then Settings > Developer options > enable 'USB debugging'.
  3. Plug the phone in and accept the 'Allow USB debugging?' prompt.
  4. Confirm it's visible:   adb devices
  5. Build and launch:       npm run android:run

The first Gradle build downloads ~700 MB-1 GB of dependencies and takes several
minutes. Subsequent builds are fast.
"@ -ForegroundColor White
