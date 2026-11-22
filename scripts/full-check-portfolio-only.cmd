@echo off
rem Runs only the two-wallet Portfolio test, 6 times (crash isolation).
cd /d "%~dp0.."
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0full-check.ps1" -TestArgs "--grep=removable --repeat-each=3"
