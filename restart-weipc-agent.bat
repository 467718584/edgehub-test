@echo off
REM WEI-PC EdgeAgent 重启脚本
REM 使用方法: 双击运行或右键->以管理员身份运行

setlocal enabledelayedexpansion

set "EDGEAGENT_URL=http://1.13.247.173:80/api/v1"
set "API_KEY=edgehub_secret_key"
set "AGENT_DIR=C:\EdgeAgent"

echo ========================================
echo WEI-PC EdgeAgent 重启脚本
echo 时间: %date% %time%
echo ========================================
echo.

REM 1. 查找并杀死现有进程
echo [1/5] 查找现有EdgeAgent进程...
set "FOUND=0"

for /f "tokens=2" %%a in ('tasklist /FI "IMAGENAME eq python.exe" /FO CSV 2^| findstr /I "edgeagent"') do (
    echo 找到进程 PID: %%a
    taskkill /F /PID %%a >nul 2>&1
    echo 已杀死 PID: %%a
    set "FOUND=1"
)

if !FOUND!==0 (
    echo 未找到edgeagent进程，继续...
)

REM 也检查pythonw
for /f "tokens=2" %%a in ('tasklist /FI "IMAGENAME eq pythonw.exe" /FO CSV 2^| findstr /I "edgeagent"') do (
    echo 找到进程 PID: %%a
    taskkill /F /PID %%a >nul 2>&1
    echo   已杀死 PID: %%a
)

echo.
echo [2/5] 等待进程退出...
timeout /t3 /nobreak >nul

REM 3. 查找脚本
echo [3/5]查找EdgeAgent脚本...

set "SCRIPT_PATH="
if exist "C:\EdgeAgent\edgeagent-win.py" (
    set "SCRIPT_PATH=C:\EdgeAgent\edgeagent-win.py"
) else if exist "C:\Users\Public\edgeagent-win.py" (
    set "SCRIPT_PATH=C:\Users\Public\edgeagent-win.py"
) else if exist "edgeagent-win.py" (
    set "SCRIPT_PATH=%cd%\edgeagent-win.py"
)

if not defined SCRIPT_PATH (
    echo 错误: 未找到edgeagent-win.py
    echo 请确保EdgeAgent已部署
    pause
    exit /b 1
)

echo 找到脚本: !SCRIPT_PATH!

REM 4. 创建日志目录
if not exist "!AGENT_DIR!\logs" mkdir "!AGENT_DIR!\logs"

REM 5. 启动EdgeAgent
echo [4/5] 启动EdgeAgent...
echo 命令: python "!SCRIPT_PATH!" --url !EDGEAGENT_URL!

REM 使用start启动新窗口运行
start "EdgeAgent" python "!SCRIPT_PATH!" --url "!EDGEAGENT_URL!" --api-key "!API_KEY!"

echo.
echo [5/5] 验证启动...
timeout /t 3 /nobreak >nul

REM 检查是否启动成功
tasklist /FI "IMAGENAME eq python.exe" /FO CSV 2^| findstr /I "edgeagent" >nul
if !errorlevel!==0 (
    echo.
    echo ========================================
    echo成功: EdgeAgent已启动
    echo ========================================
    echo 日志: !AGENT_DIR!\logs\edgeagent.log
    echo.
    echo 提示: 检查日志确认连接状态
) else (
    echo.
    echo ========================================
    echo 警告: 未找到edgeagent进程
    echo 请手动运行以下命令检查:
    echo python !SCRIPT_PATH! --url !EDGEAGENT_URL!
    echo ========================================
)

echo.
echo 按任意键退出...
pause >nul