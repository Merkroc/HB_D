@echo off
chcp 65001 >nul
title Открытка для Даши
cd /d "%~dp0"
echo.
echo  Открываю открытку в браузере...
echo.
start "" "index.html"
echo  Если окно браузера не появилось — просто откройте файл index.html вручную.
timeout /t 3 >nul
