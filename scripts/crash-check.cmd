@echo off
rem Runs scripts\crash-check.ps1 (double-click to start). Reads public data only.
cd /d "%~dp0.."
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0crash-check.ps1"
