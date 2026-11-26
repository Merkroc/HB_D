@echo off
chcp 65001 >nul
set PYTHONUTF8=1
title Подготовка открытки к публикации
cd /d "%~dp0"

echo.
echo  ============================================================
echo    ПОДГОТОВКА ОТКРЫТКИ К ПУБЛИКАЦИИ
echo  ============================================================
echo.

set "PYEXE="
where python >nul 2>nul && set "PYEXE=python"
if not defined PYEXE (
  where py >nul 2>nul
  if not errorlevel 1 set "PYEXE=py"
)

if not defined PYEXE (
  echo    Python не найден. Тогда скопируйте вручную папки css, js, assets
  echo    и файл index.html в отдельную папку и загружайте только её.
  echo    ВАЖНО: папку "iCloud Photos" с оригиналами загружать нельзя!
  echo.
  pause
  exit /b 1
)

%PYEXE% "tools\prepare_publish.py"

if exist "Публикация" (
  echo  Открываю папку «Публикация» — перетащите её на https://app.netlify.com/drop
  echo.
  explorer "Публикация"
)

echo.
pause
