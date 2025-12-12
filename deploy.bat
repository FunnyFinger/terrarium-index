@echo off
REM Quick deploy batch file - runs the PowerShell script
powershell.exe -ExecutionPolicy Bypass -File "%~dp0deploy.ps1" %*

