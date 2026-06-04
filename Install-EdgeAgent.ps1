$ErrorActionPreference = "Continue"

$EdgeHubUrl = "http://1.13.247.173"
$ApiKey = "edgehub_secret_key"
$AgentDir = "C:\EdgeAgent"

function Write-Step { param($msg) Write-Host "[INSTALL] $msg" -ForegroundColor Cyan }
function Write-Success { param($msg) Write-Host "[OK] $msg" -ForegroundColor Green }
function Write-Err { param($msg) Write-Host "[ERROR] $msg" -ForegroundColor Red }

# Check admin
Write-Step "Checking admin rights..."
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Err "Need admin rights"
    exit 1
}

# Detect Python
Write-Step "Detecting Python..."
$pythonPath = $null
try { $pythonPath = (Get-Command python -ErrorAction SilentlyContinue).Source } catch {}
if (-not $pythonPath) {
    $paths = @("C:\Python39\python.exe","C:\Python310\python.exe","C:\Python311\python.exe","C:\Python312\python.exe","C:\Program Files\Python39\python.exe","C:\Program Files\Python310\python.exe","C:\Program Files\Python311\python.exe","C:\miniconda3\python.exe")
    foreach ($p in $paths) { if (Test-Path $p) { $pythonPath = $p; break } }
}
if (-not $pythonPath) { Write-Err "Python not found"; exit 1 }
Write-Success "Python: $pythonPath"

# Install deps
Write-Step "Installing dependencies..."
python -m pip install websocket-client requests psutil -i https://pypi.tuna.tsinghua.edu.cn/simple --quiet
Write-Success "Dependencies installed"

# Create directories
Write-Step "Creating directories..."
New-Item -ItemType Directory -Path $AgentDir -Force | Out-Null
New-Item -ItemType Directory -Path "$AgentDir\logs" -Force | Out-Null
New-Item -ItemType Directory -Path "$AgentDir\data" -Force | Out-Null
Write-Success "Directory created: $AgentDir"

# Download EdgeAgent
Write-Step "Downloading EdgeAgent..."
$agentPath = "$AgentDir\edgeagent-win.py"
try {
    $wc = New-Object System.Net.WebClient
    $wc.DownloadFile("$EdgeHubUrl/edgeagent/edgeagent-win.py", $agentPath)
    Write-Success "EdgeAgent downloaded"
} catch {
    Write-Err "Download failed"
    exit 1
}

# Create config
Write-Step "Creating config..."
$deviceName = $env:COMPUTERNAME
$md5 = [System.Security.Cryptography.MD5]::Create()
$hash = $md5.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($deviceName))
$deviceId = -join ($hash | ForEach-Object { $_.ToString("x2") })
$wsUrl = $EdgeHubUrl.Replace('http://', 'ws://').Replace('https://', 'wss://') + "/ws"

$config = @{
    edgehub_url = $EdgeHubUrl
    ws_url = $wsUrl
    device_id = $deviceId
    device_name = $deviceName
    device_type = "windows"
    api_key = $ApiKey
    heartbeat_interval = 30
    log_level = "info"
} | ConvertTo-Json

$config | Out-File -FilePath "$AgentDir\config.json" -Encoding UTF8
Write-Success "Config created (ID: $deviceId)"

# Create run.bat
$runBat = "@echo off`ncd /d `"%~dp0`"`n:loop`npythonw edgeagent-win.py --config config.json`necho Restarting in 5s...`ntimeout /t 5 >nul`ngoto loop"
$runBat | Out-File -FilePath "$AgentDir\run.bat" -Encoding ASCII

$startBat = "@echo off`ncd /d `"%~dp0`"`nstart /b pythonw edgeagent-win.py --config config.json"
$startBat | Out-File -FilePath "$AgentDir\start.bat" -Encoding ASCII
Write-Success "Batch files created"

# Create Windows service using nssm
Write-Step "Creating auto-start service..."
$serviceName = "EdgeAgent"

# Try to stop existing service
$env:Path = "$env:Path;C:\nssm"
nssm stop $serviceName 2>$null
nssm remove $serviceName confirm 2>$null

# Download nssm if not present
$nssmPath = "C:\nssm.exe"
if (-not (Test-Path $nssmPath)) {
    Write-Step "Downloading nssm..."
    New-Item -ItemType Directory -Path "C:\" -Force | Out-Null
    try {
        $wc = New-Object System.Net.WebClient
        $wc.DownloadFile("https://nssm.cc/release/nssm-2.24.zip", "C:\nssm.zip")
        # Extract silently
        Add-Type -AssemblyName System.IO.Compression.FileSystem
        $zip = [System.IO.Compression.ZipFile]::OpenRead("C:\nssm.zip")
        $entry = $zip.Entries | Where-Object { $_.Name -like "*nssm.exe" -and $_.Name -notlike "*64*" }
        if ($entry) {
            [System.IO.File]::WriteAllBytes($nssmPath, $zip.GetEntry($entry.FullName).Open().ReadAll())
        }
        $zip.Dispose()
        Remove-Item C:\nssm.zip -Force
    } catch {
        Write-Step "nssm download skipped, using task scheduler instead"
    }
}

if (Test-Path $nssmPath) {
    # Use nssm
    nssm install $serviceName $pythonPath "$AgentDir\edgeagent-win.py --config $AgentDir\config.json"
    nssm set $serviceName AppDirectory $AgentDir
    nssm set $serviceName Start SERVICE_AUTO_START
    nssm set $serviceName Description "EdgeHub EdgeAgent"
    nssm start $serviceName
    Write-Success "Service created with nssm"
} else {
    # Use schtasks instead
    Write-Step "Using task scheduler..."
    $taskName = "EdgeAgent"
    $cmdLine = "cmd /c `"cd /d $AgentDir && $pythonPath edgeagent-win.py --config config.json`""
    schtasks /create /tn $taskName /tr $cmdLine /sc onstart /ru SYSTEM /f 2>$null
    schtasks /run /tn $taskName 2>$null
    Write-Success "Task created: $taskName"
}

Start-Sleep -Seconds 5

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "   EdgeAgent v4.1 Install Complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Dir: $AgentDir"
Write-Host "Device: $deviceName ($deviceId)"
Write-Host ""
Write-Host "Commands:"
Write-Host "  type $AgentDir\logs\edgeagent.log"
Write-Host ""
Write-Host "Web: $EdgeHubUrl/edgehub-web/" -ForegroundColor Cyan