
@echo off
cd /d "%~dp0"
title Streamer's Word of the Day

echo Checking installation...

if not exist "node_modules" (
    echo.
    echo [FIRST RUN DETECTED]
    echo Installing necessary files...
    call npm install
)

echo.
echo Starting App...
echo.
echo ---------------------------------------------------
echo  App is running! 
echo  If the browser does not open, go to:
echo  http://127.0.0.1:3000
echo ---------------------------------------------------
echo.

REM Automatically open the browser to the reliable IP
start http://127.0.0.1:3000

call npm run dev
pause
