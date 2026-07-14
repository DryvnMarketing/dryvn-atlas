@echo off
title DRYVN Atlas
echo Starting DRYVN Atlas on http://localhost:3400 ...
set PORT=3400
cd /d C:\Users\info\Documents\GitHub\dryvn-atlas
"C:\Program Files\nodejs\node.exe" --use-system-ca node_modules\next\dist\bin\next dev
pause
