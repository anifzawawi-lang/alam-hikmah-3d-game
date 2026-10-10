@echo off
chcp 65001 > nul
cd /d "%~dp0"
where node > nul 2>&1
if errorlevel 1 (
  echo Node.js belum dipasang.
  echo Sila pasang Node.js 20 atau lebih baru daripada https://nodejs.org/
  pause
  exit /b 1
)
echo.
echo =========================================
echo    ALAM HIKMAH 3D - 10 PLAYER KAFA
 echo =========================================
echo.
echo Permainan bermula pada http://localhost:3000
 echo Jangan tutup tetingkap ini semasa bermain.
echo.
start "" cmd /c "timeout /t 3 > nul & start http://localhost:3000"
node server.js
pause
