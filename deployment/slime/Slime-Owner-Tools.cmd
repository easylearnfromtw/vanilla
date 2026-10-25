@echo off
setlocal
rem Owner-only local toolbox: do not pair a friend node or call remote APIs.
if not exist "%~dp0Slime-Owner.exe" (
  echo Missing Slime-Owner.exe in the same folder.
  pause
  exit /b 2
)
"%~dp0Slime-Owner.exe" --tools
exit /b %errorlevel%
