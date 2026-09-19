@echo off
cd /d "%~dp0"
start "" http://localhost:4210
node server.mjs
