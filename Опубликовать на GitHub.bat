@echo off
chcp 65001 >nul
set PYTHONUTF8=1
title Публикация открытки на GitHub Pages
cd /d "%~dp0"
setlocal EnableDelayedExpansion

echo.
echo  ============================================================
echo    ПУБЛИКАЦИЯ ОТКРЫТКИ НА GITHUB PAGES
echo  ============================================================
echo.

rem ---------- проверяем git ----------
where git >nul 2>nul
if errorlevel 1 (
  echo    Git не найден.
  echo.
  echo    Варианты:
  echo     1^) установить Git for Windows: https://git-scm.com/download/win
  echo        и запустить этот файл снова;
  echo     2^) поставить GitHub Desktop: https://desktop.github.com
  echo        ^(там всё мышкой: Add local repository ^-^> папка «Публикация» ^-^> Publish^)
  echo     3^) загрузить папку «Публикация» вручную на github.com.
  echo.
  pause
  exit /b 1
)

rem ---------- python: обновляем папку публикации ----------
set "PYEXE="
where python >nul 2>nul && set "PYEXE=python"
if not defined PYEXE (
  where py >nul 2>nul
  if not errorlevel 1 set "PYEXE=py"
)

if defined PYEXE (
  %PYEXE% "tools\check_site.py"
  if errorlevel 1 (
    echo.
    echo    Проверка нашла проблемы — публиковать пока нельзя.
    pause
    exit /b 1
  )
  echo.
  echo  Обновляю папку «Публикация»...
  %PYEXE% "tools\prepare_publish.py"
) else (
  echo  Python не найден — беру уже готовую папку «Публикация».
)

if not exist "Публикация\index.html" (
  echo.
  echo    Нет папки «Публикация». Сначала запустите «Подготовить к публикации.bat».
  pause
  exit /b 1
)

cd "Публикация"

rem ---------- git-репозиторий ----------
if not exist ".git" (
  echo  Создаю локальный git-репозиторий...
  git init -b main >nul 2>nul
  if errorlevel 1 git init >nul
  git symbolic-ref HEAD refs/heads/main >nul 2>nul
)

rem кто автор коммита (если в системе не настроено — подставим логин Windows)
git config --get user.name >nul 2>nul || git config user.name "%USERNAME%"
git config --get user.email >nul 2>nul || git config user.email "%USERNAME%@users.noreply.github.com"

echo  Добавляю файлы в коммит...
git add -A
git commit -m "Открытка-альбом для Даши" >nul 2>nul
if errorlevel 1 echo  Новых изменений нет — отправляю то, что уже закоммичено.

rem ---------- адрес репозитория ----------
git remote get-url origin >nul 2>nul
if errorlevel 1 (
  echo.
  echo  ------------------------------------------------------------
  echo   Сначала создайте НОВЫЙ ПУСТОЙ репозиторий:
  echo     https://github.com/new
  echo.
  echo   Важно:
  echo    - репозиторий должен быть ПУБЛИЧНЫМ ^(иначе GitHub Pages платный^);
  echo    - НЕ добавляйте README и .gitignore при создании;
  echo    - имя репозитория лучше нейтральное, например "dasha-2611".
  echo  ------------------------------------------------------------
  echo.
  set /p "REPO= Вставьте ссылку на репозиторий и нажмите Enter: "
  if "!REPO!"=="" (
    echo  Отменено.
    pause
    exit /b 1
  )
  set "REPO=!REPO:"=!"
  git remote add origin "!REPO!"
)

rem ---------- отправка ----------
echo.
echo  Отправляю на GitHub (при первом разе откроется окно входа в браузере)...
echo.
git push -u origin main
if errorlevel 1 (
  echo.
  echo  Не удалось с первого раза, пробую подтянуть изменения из репозитория...
  git pull --rebase origin main
  git push -u origin main
)
if errorlevel 1 (
  echo.
  echo  Отправить не получилось. Что проверить:
  echo   - репозиторий существует и он публичный;
  echo   - вход в GitHub подтверждён в открывшемся окне;
  echo   - если в репозитории уже был README: закройте это окно,
  echo     выполните в папке «Публикация»: git pull --rebase origin main
  echo     и запустите батник снова.
  echo.
  pause
  exit /b 1
)

echo.
echo  ============================================================
echo    ФАЙЛЫ НА GITHUB. ОСТАЛОСЬ ВКЛЮЧИТЬ САЙТ (один раз)
echo  ============================================================
echo.
echo   1^) откройте ваш репозиторий на github.com
echo   2^) Settings  -^>  Pages
echo   3^) Source: Deploy from a branch
echo   4^) Branch: main,  папка: / (root)  -^>  Save
echo.
echo   Через 1-2 минуты открытка будет жить по адресу:
echo     https://ВАШ-ЛОГИН.github.io/ИМЯ-РЕПОЗИТОРИЯ/
echo.
echo   Если поменяли текст письма или подпись — просто запустите этот
echo   файл ещё раз, он добавит новый коммит и GitHub обновит сайт.
echo.
pause
