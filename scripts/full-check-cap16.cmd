@echo off
rem Diagnosis: the full check with at most 16 outbound requests in flight (default 32).
cd /d "%~dp0.."
set "CRYPY_MAX_IN_FLIGHT=16"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0full-check.ps1"
