@echo off
rem Diagnosis: the full check with the extra providers (*_RPC_URLS) switched off for the test server only.
rem Your .env.local is not changed.
cd /d "%~dp0.."
set "ETH_RPC_URLS= "
set "BSC_RPC_URLS= "
set "BASE_RPC_URLS= "
set "ARBITRUM_RPC_URLS= "
set "POLYGON_RPC_URLS= "
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0full-check.ps1"
