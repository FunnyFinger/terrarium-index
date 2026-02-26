@echo off
cd /d "%~dp0"
git add -A
git status
if errorlevel 1 exit /b 1
set /p MSG="Commit message (or press Enter for 'Deploy'): "
if "%MSG%"=="" set MSG=Deploy
git commit -m "%MSG%"
if errorlevel 1 (
    echo Nothing to commit or commit failed.
    pause
    exit /b 0
)
git push
pause
