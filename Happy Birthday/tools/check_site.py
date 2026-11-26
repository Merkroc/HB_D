# -*- coding: utf-8 -*-
"""
Проверка сайта перед публикацией.

1) Все пути из data/media.json существуют ровно в том регистре, в котором записаны
   (GitHub Pages — Linux, там IMG_1.JPG и img_1.jpg — разные файлы).
2) В index.html нет абсолютных путей вида src="/assets/..." (они ломаются
   при публикации в подпапке github.io/имя-репозитория/).
3) Нет лишних/«сиротских» файлов в assets (не критично, просто показывает).

Запуск: python tools/check_site.py
"""
import os
import re
import sys
import json

# чтобы не падать с UnicodeEncodeError в консоли Windows с cp866/cp1251
try:
    sys.stdout.reconfigure(errors="replace")
except Exception:
    pass

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS = os.path.join(ROOT, "assets")


def real_files():
    """Пути относительно корня, с сохранением регистра, в posix-виде."""
    out = set()
    for base in ("assets", "css", "js"):
        start = os.path.join(ROOT, base)
        for dirpath, _dirs, files in os.walk(start):
            for name in files:
                full = os.path.join(dirpath, name)
                out.add(os.path.relpath(full, ROOT).replace(os.sep, "/"))
    return out


def referenced():
    refs = set()
    data_path = os.path.join(ROOT, "data", "media.json")
    if os.path.exists(data_path):
        with open(data_path, encoding="utf-8") as f:
            d = json.load(f)
        for ch in d.get("chapters", []):
            for p in ch.get("photos", []):
                refs.add(p["full"])
                refs.add(p["thumb"])
                if p.get("live"):
                    refs.add(p["live"]["src"])
        for p in d.get("hero", []):
            refs.add(p["thumb"])
        for it in d.get("interludes", []):
            refs.add(it["photo"]["full"])
        for p in d.get("liveStrip", []):
            refs.add(p["thumb"])
            if p.get("live"):
                refs.add(p["live"]["src"])
    return refs


def main():
    problems = []
    actual = real_files()
    refs = referenced()

    missing = sorted(r for r in refs if r not in actual)
    if missing:
        problems.append("Нет файлов (или не совпадает регистр):\n   " + "\n   ".join(missing[:20]))

    # регистронезависимая проверка — чтобы отличить «нет файла» от «другой регистр»
    lower_map = {}
    for a in actual:
        lower_map.setdefault(a.lower(), []).append(a)
    case_only = [r for r in missing if r.lower() in lower_map]
    if case_only:
        problems.append("Только регистр не совпадает (сломается на GitHub Pages):\n   " + "\n   ".join(case_only[:20]))

    # абсолютные пути в html/css/js
    abs_refs = []
    for name in ("index.html",):
        with open(os.path.join(ROOT, name), encoding="utf-8") as f:
            html = f.read()
        for attr in ("src", "href"):
            for m in re.finditer(attr + r'="(/[^"]*)"', html):
                if not m.group(1).startswith("//"):
                    abs_refs.append(name + ": " + attr + '="' + m.group(1) + '"')
    if abs_refs:
        problems.append("Абсолютные пути (не заведутся в подпапке):\n   " + "\n   ".join(abs_refs))

    print("Файлов в assets/css/js: %d" % len(actual))
    print("Ссылок в данных: %d" % len(refs))
    print("Сиротских файлов (есть, но не используются): %d" % len(actual - refs - {"css/style.css"})) 
    if problems:
        print("\n[!] НАЙДЕНЫ ПРОБЛЕМЫ:")
        for p in problems:
            print("  - " + p)
        sys.exit(1)

    print("\n[OK] Всё в порядке: пути корректны, регистр совпадает, абсолютных путей нет.")
    print("     Можно публиковать.")


if __name__ == "__main__":
    main()
