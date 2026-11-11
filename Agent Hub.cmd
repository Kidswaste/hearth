@echo off
rem Starts Hearth with the engine beside it (electron\electron.exe).
rem (round 177, engine177) An engine update you clicked in Settings waits in electron-next\ (downloaded and its
rem checksum checked first). Here it takes the place of electron\; the engine before stays as electron-old\ for one
rem start. If that first start never reaches Hearth's first screen, Hearth goes back to the engine before (the new one
rem stays as electron-failed\). Nothing is deleted here. engineup-core.js does the same steps for the tests.
setlocal
set "HERE=%~dp0"
cd /d "%HERE%"
if exist "electron\.hearth-trial" if exist "electron-old\electron.exe" call :rollback
if exist "electron-next\electron.exe" if not exist "electron-old\" call :swap
start "" "%HERE%electron\electron.exe" "%HERE%."
if exist "electron\.hearth-trial" call :watch
exit /b 0

:swap
rem Hearth may still be closing (its Restart button): its engine's folder can't be renamed until it has.
set /a tries=0
:swaptry
ren "electron" "electron-old" 2>nul && goto swapped
set /a tries+=1
if %tries% geq 60 exit /b 1
ping -n 2 127.0.0.1 >nul
goto swaptry
:swapped
ren "electron-next" "electron" 2>nul || (ren "electron-old" "electron" & exit /b 1)
echo trial> "electron\.hearth-trial"
exit /b 0

:rollback
if exist "electron-failed\" ren "electron-failed" "electron-failed-%RANDOM%"
ren "electron" "electron-failed" 2>nul || exit /b 1
ren "electron-old" "electron" 2>nul || (ren "electron-failed" "electron" & exit /b 1)
exit /b 0

:watch
rem The new engine's first start: Hearth removes the mark once its first screen is up. Closed before that: the engine
rem before comes back and starts.
title Hearth
echo Hearth is starting on its new engine for the first time. This window closes by itself.
set /a waited=0
:watchloop
ping -n 3 127.0.0.1 >nul
if not exist "electron\.hearth-trial" exit /b 0
tasklist /fi "imagename eq electron.exe" /nh 2>nul | find /i "electron.exe" >nul || goto watchfailed
set /a waited+=1
if %waited% lss 60 goto watchloop
exit /b 0
:watchfailed
if not exist "electron\.hearth-trial" exit /b 0
call :rollback && start "" "%HERE%electron\electron.exe" "%HERE%."
exit /b 0
