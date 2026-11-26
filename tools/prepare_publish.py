# -*- coding: utf-8 -*-
"""
Готовит папку «Публикация» только с тем, что нужно сайту, и — при желании —
сразу версионирует её для GitHub Pages.

Зачем: в папке проекта лежат оригиналы в "iCloud Photos" (с EXIF и геометками).
Если загрузить на хостинг всю папку, оригиналы станут публично доступны.
Этот скрипт копирует только index.html, css, js и assets — их можно смело
перетаскивать на GitHub Pages (или любой другой хостинг).

Особенности для GitHub Pages:
  * .nojekyll          — отключает обработку Jekyll, файлы отдаются как есть;
  * robots.txt         — просит поисковики не индексировать открытку;
  * папка .git (если уже была) сохраняется, чтобы не терять историю коммитов.

Запуск: python tools/prepare_publish.py
"""
import os
import shutil
import sys

# чтобы не падать с UnicodeEncodeError в консоли Windows с cp866/cp1251
try:
    sys.stdout.reconfigure(errors="replace")
except Exception:
    pass

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_NAME = "Публикация"
OUT = os.path.join(ROOT, OUT_NAME)

ITEMS = ["index.html", "css", "js", "assets"]
ROBOTS = "User-agent: *\nDisallow: /\n"


def human(n):
    return ("%.1f МБ" % (n / 1048576)) if n >= 1048576 else ("%.0f КБ" % (n / 1024))


def main():
    real_root = os.path.realpath(ROOT)
    real_out = os.path.realpath(OUT)

    # защита: удаляем только нашу папку внутри проекта
    if os.path.basename(real_out) != OUT_NAME or os.path.dirname(real_out) != real_root:
        sys.exit("Отказ: неожиданный путь для папки публикации: %s" % real_out)

    git_dir = os.path.join(real_out, ".git")
    git_tmp = os.path.join(real_root, ".git_publish_tmp")

    # 1) сохраняем git-историю, если она уже есть
    if os.path.isdir(git_dir):
        if os.path.isdir(git_tmp):
            shutil.rmtree(git_tmp)
        shutil.move(git_dir, git_tmp)

    if os.path.isdir(real_out):
        shutil.rmtree(real_out)
    os.makedirs(real_out)

    if os.path.isdir(git_tmp):
        shutil.move(git_tmp, git_dir)

    # 2) копируем сайт
    total = 0
    copied = 0
    for item in ITEMS:
        src = os.path.join(real_root, item)
        dst = os.path.join(real_out, item)
        if not os.path.exists(src):
            print("  ! пропущено (нет файла): %s" % item)
            continue
        if os.path.isdir(src):
            shutil.copytree(src, dst)
        else:
            shutil.copy2(src, dst)

    # 3) служебные файлы хостинга
    with open(os.path.join(real_out, "robots.txt"), "w", encoding="utf-8", newline="\n") as f:
        f.write(ROBOTS)
    open(os.path.join(real_out, ".nojekyll"), "w", encoding="utf-8").close()

    for root, _, files in os.walk(real_out):
        if os.sep + ".git" in root or root.endswith(os.sep + ".git"):
            continue
        for name in files:
            total += os.path.getsize(os.path.join(root, name))
            copied += 1

    print()
    print("  Готово: папка «%s»" % OUT_NAME)
    print("  Файлов: %d, объём: %s" % (copied, human(total)))
    print("  Оригиналы из «iCloud Photos» и служебные файлы НЕ включены.")
    print("  Для GitHub Pages добавлены .nojekyll и robots.txt.")

    music_dir = os.path.join(real_out, "assets", "music")
    tracks = []
    if os.path.isdir(music_dir):
        tracks = sorted(f for f in os.listdir(music_dir)
                        if f.lower().startswith("track.") and not f.startswith("."))
    if tracks:
        tpath = os.path.join(music_dir, tracks[0])
        print("  Музыка: assets/music/%s (%s)" % (tracks[0], human(os.path.getsize(tpath))))
    else:
        print("  Музыка: файла нет — будет играть встроенная музыкальная шкатулка.")
    print()
    print("  Дальше:")
    print("   • проще всего — запустить «Опубликовать на GitHub.bat», он сам")
    print("     создаст репозиторий, закоммитит файлы и отправит их на GitHub;")
    print("   • или загрузить содержимое папки «%s» вручную" % OUT_NAME)
    print("     (репозиторий должен быть публичным, иначе GitHub Pages платный).")
    print()
    print("  После первой публикации: Settings → Pages → Deploy from a branch →")
    print("  Branch: main, папка /(root) → Save. Ссылка появится через 1–2 минуты.")
    print()
    print("  Если поменяли тексты/фото — запустите этот файл снова, а затем батник")
    print("  публикации: он просто добавит новый коммит.")
    print()


if __name__ == "__main__":
    main()
