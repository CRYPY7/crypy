@echo off
rem Same as full-check.cmd, but without the two-wallet Portfolio test (crash isolation).
cd /d "%~dp0.."
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0full-check.ps1" -TestArgs "--grep-invert=removable"
