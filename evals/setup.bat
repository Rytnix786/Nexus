@echo off
REM Setup script for running Nexus evaluation on Windows
REM Usage: evals\setup.bat

setlocal enabledelayedexpansion

echo.
echo 🧪 Setting up Nexus Researcher Evaluation Environment
echo ==================================================
echo.

REM Check prerequisites
echo 📋 Checking prerequisites...

where /q npm
if !errorlevel! neq 0 (
    echo ❌ npm not found. Please install Node.js 18+
    exit /b 1
)

where /q curl
if !errorlevel! neq 0 (
    echo ❌ curl not found
    exit /b 1
)

for /f "tokens=*" %%i in ('npm --version') do set NPM_VERSION=%%i
for /f "tokens=*" %%i in ('node --version') do set NODE_VERSION=%%i

echo ✅ npm version: !NPM_VERSION!
echo ✅ node version: !NODE_VERSION!
echo.

REM Check if backend is running
echo 🔍 Checking backend availability...
curl -sf http://localhost:8000/api/health > nul 2>&1
if !errorlevel! equ 0 (
    echo ✅ Backend API is running at http://localhost:8000
) else (
    echo ⚠️  Backend API not ready. Starting Docker containers...
    call docker compose up -d backend
    
    echo ⏳ Waiting for backend to be ready...
    setlocal enabledelayedexpansion
    for /l %%i in (1,1,30) do (
        curl -sf http://localhost:8000/api/health > nul 2>&1
        if !errorlevel! equ 0 (
            echo ✅ Backend is ready
            goto backend_ready
        )
        if %%i equ 30 (
            echo ❌ Backend failed to start
            exit /b 1
        )
        timeout /t 2 /nobreak > nul
    )
)

:backend_ready

echo.

REM Install frontend dependencies
echo 📦 Installing frontend dependencies...
cd frontend
if not exist "node_modules" (
    call npm ci
) else (
    echo ✅ Dependencies already installed
)
cd ..

echo.

REM Set up environment
echo 🔐 Setting up environment variables...
set NEXUS_EVAL_API=http://localhost:8000
if not defined API_KEY set API_KEY=dev-key-for-eval
set NEXUS_EVAL_API_KEY=!API_KEY!
set NODE_ENV=test

echo   NEXUS_EVAL_API=!NEXUS_EVAL_API!
echo   NODE_ENV=!NODE_ENV!
echo.

REM Ready to run
echo ✅ Setup complete!
echo.
echo 📊 To run evaluation:
echo   cd frontend
echo   npm run eval
echo.
echo 📈 To view results:
echo   npm run eval:view
echo.

endlocal
