@echo off
rem Diagnosis: the full check with the alerts worker (checker, delivery, Telegram bot) switched off.
cd /d "%~dp0.."
set "CRYPY_WORKER=off"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0full-check.ps1"
