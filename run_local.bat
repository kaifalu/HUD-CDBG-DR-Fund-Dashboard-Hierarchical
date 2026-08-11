@echo off
cd /d "%~dp0"
echo Starting CDBG-DR Fund Dashboard at http://127.0.0.1:8000/
python -m http.server 8000
pause
