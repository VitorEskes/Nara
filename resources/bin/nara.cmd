@echo off
rem The `nara` command for canvas terminals on Windows, as resources/bin/nara is elsewhere: cmd
rem and PowerShell find this one on the PATH. Runs cli.js with Electron itself in Node mode.
setlocal
set ELECTRON_RUN_AS_NODE=1
"%NARA_ELECTRON%" "%NARA_CLI%" %*
