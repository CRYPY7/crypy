@echo off
rem Runs scripts\full-check.ps1: server with a log + full browser tests + Windows crash records.
cd /d "%~dp0.."
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0full-check.ps1"
