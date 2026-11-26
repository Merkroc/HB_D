@echo off
chcp 65001 >nul
title Открытка для Даши — просмотр с телефона
cd /d "%~dp0"

set "PORT=8000"
set "IP="
set "PYEXE="

echo.
echo  ============================================================
echo    ОТКРЫТКА ДЛЯ ДАШИ  -  просмотр с телефона
echo  ============================================================
echo.

where python >nul 2>nul && set "PYEXE=python"
if not defined PYEXE (
  where py >nul 2>nul
  if not errorlevel 1 set "PYEXE=py"
)

if not defined PYEXE (
  echo    Python не найден, а он нужен для локального сервера.
  echo.
  echo    Варианты:
  echo     1^) откройте index.html двойным кликом - только на компьютере;
  echo     2^) опубликуйте эту папку на https://app.netlify.com/drop
  echo        и отправьте ссылку - откроется на любом устройстве.
  echo.
  pause
  exit /b 1
)

for /f "usebackq delims=" %%i in (`%PYEXE% "tools\lan_ip.py"`) do set "IP=%%i"

echo    На этом компьютере:  http://localhost:%PORT%/
if defined IP echo    На телефоне:         http://%IP%:%PORT%/
if not defined IP echo    IP-адрес не определился - его можно посмотреть в настройках сети.
echo.
echo    Телефон должен быть в той же Wi-Fi сети, что и компьютер.
echo    Если Windows спросит про доступ к сети - разрешите.
echo    Это окно не закрывайте, пока смотрите открытку.
echo    Остановить сервер: Ctrl + C
echo.
echo  ------------------------------------------------------------
echo.

%PYEXE% -m http.server %PORT% --bind 0.0.0.0

echo.
echo    Сервер остановлен.
pause
