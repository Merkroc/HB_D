# -*- coding: utf-8 -*-
"""
Сборка ассетов для открытки-альбома.
- читает оригиналы из "iCloud Photos"
- делает оптимизированные full/thumb JPEG (с поворотом по EXIF, без приватных метаданных)
- копирует Live-видео
- собирает js/media-data.js (window.ALBUM_DATA) и data/media.json

Запуск: python tools/build_assets.py
"""
import os, json, shutil, struct, datetime, re
from PIL import Image, ImageOps

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "iCloud Photos")
ASSETS = os.path.join(ROOT, "assets")
FULL = os.path.join(ASSETS, "photos", "full")
THUMB = os.path.join(ASSETS, "photos", "thumb")
LIVE = os.path.join(ASSETS, "live")
DATA_DIR = os.path.join(ROOT, "data")
JS_DIR = os.path.join(ROOT, "js")

FULL_MAX = 1900
THUMB_MAX = 880
JPEG_QUALITY_FULL = 84
JPEG_QUALITY_THUMB = 78

# --- Главы альбома: порядок фотографий задаём вручную (по смыслу и датам) ---
CHAPTERS = [
    {"num": "01", "title": "Первая встреча", "date": "26 сентября",
     "note": "Первые дни нашей осени",
     "photos": ["IMG_6733", "IMG_6735", "IMG_6743", "IMG_6751", "IMG_6759", "IMG_6764", "IMG_6768", "IMG_6770"]},
    {"num": "02", "title": "Ещё немного сентября", "date": "27 сентября",
     "note": "Дни, которые хочется повторять",
     "photos": ["IMG_6778", "IMG_6779", "IMG_6780", "IMG_6789", "IMG_6795", "IMG_6796"]},
    {"num": "03", "title": "Ночная примерка", "date": "28 сентября",
     "note": "Кто сказал, что ночью надо спать",
     "photos": ["IMG_6804", "IMG_6805"]},
    {"num": "04", "title": "Октябрь", "date": "11 и 21 октября",
     "note": "Varka, твой приезд и твоя красота",
     "photos": ["IMG_7027", "IMG_7101", "IMG_7167", "IMG_7173", "IMG_7175"]},
    {"num": "05", "title": "Красный свет", "date": "3 ноября",
     "note": "Люблю красный и не только его..",
     "photos": ["IMG_7450", "IMG_7451", "IMG_7455"]},
    {"num": "06", "title": "Тот вечер", "date": "4 ноября",
     "note": "Вечер, который я хочу сохранить",
     "photos": ["IMG_7479", "IMG_7503", "IMG_7517", "IMG_7518", "IMG_7523", "IMG_7525", "IMG_7528"]},
    {"num": "07", "title": "Москва и мы", "date": "23 ноября",
     "note": "Гуляли, не смотря на то, что замерзри",
     "photos": ["IMG_7828", "IMG_7870", "IMG_7900", "IMG_7901", "IMG_7902", "IMG_7903", "IMG_7904", "IMG_7905"]},
    {"num": "08", "title": "Зима, снег и ты", "date": "25 ноября",
     "note": "И тут пошёл снег",
     "photos": ["IMG_7949", "IMG_7950", "IMG_7951", "IMG_7960", "IMG_7961", "IMG_7962"]},
]

# Фотографии без EXIF — дата восстановлена по последовательности съёмки
DATE_FALLBACK = {
    "IMG_6789": ("2026-09-27", "15:10"),
    "IMG_7101": ("2026-10-11", "15:20"),
    "IMG_7523": ("2026-11-04", "21:40"),
    "IMG_7525": ("2026-11-04", "21:41"),
    "IMG_7528": ("2026-11-04", "21:42"),
    "IMG_7949": ("2026-11-25", "12:10"),
    "IMG_7950": ("2026-11-25", "12:12"),
    "IMG_7951": ("2026-11-25", "12:13"),
    "IMG_7960": ("2026-11-25", "12:20"),
    "IMG_7961": ("2026-11-25", "12:21"),
    "IMG_7962": ("2026-11-25", "12:22"),
}

RU_MONTHS_GEN = ["января", "февраля", "марта", "апреля", "мая", "июня",
                 "июля", "августа", "сентября", "октября", "ноября", "декабря"]

# Полноэкранные «интерлюдии» между главами (после главы с индексом after)
INTERLUDES = [
    {"after": 3, "photo": "IMG_6768", "quote": "Мне нравится, как ты смотришь на мир.\nИ как иногда — на меня.", "pos": "center 40%"},
    {"after": 6, "photo": "IMG_7528", "quote": "Я бы выбирал тебя.\nСнова и снова.", "pos": "center 35%"},
    {"after": 8, "photo": "IMG_7961", "quote": "Ты — мой самый тёплый ноябрь.", "pos": "center 30%"},
]

# Карточки в «живой ленте»
LIVE_STRIP = ["IMG_6764", "IMG_7173", "IMG_7450", "IMG_7517", "IMG_7828",
              "IMG_7900", "IMG_6779", "IMG_7503", "IMG_6735", "IMG_7167",
              "IMG_7479", "IMG_7903", "IMG_6751", "IMG_7870"]

HERO_POLAROIDS = ["IMG_6735", "IMG_7027", "IMG_7173", "IMG_7951"]

# Подписи для избранных кадров (показываются в галерее/лайтбоксе)
CAPTIONS = {
    "IMG_6733": "первый кадр нашей встречи",
    "IMG_6735": "любимая груша",
    "IMG_6743": "Дарья Корж",
    "IMG_6768": "ветер, сентябрь, ты",
    "IMG_6770": "покоряем высоты",
    "IMG_6778": "первые драники",
    "IMG_6789": "в отражении — мы",
    "IMG_6804": "банька-парилка",
    "IMG_7027": "Varka и твои истории",
    "IMG_7101": "самое милое лицо",
    "IMG_7173": "книжка на память",
    "IMG_7450": "красный = красивый",
    "IMG_7479": "твой взгляд",
    "IMG_7523": "мы",
    "IMG_7528": "поцелуй в щёку",
    "IMG_7828": "первый завтрак в Москве",
    "IMG_7900": "даже ракета захотела фото с тобой",
    "IMG_7949": "наш первый снег",
    "IMG_7951": "самый тёплый кадр",
    "IMG_7961": "легенды",
}


def find_files():
    photos, videos = {}, {}
    for name in os.listdir(SRC):
        base, ext = os.path.splitext(name)
        e = ext.lower()
        if e in (".jpeg", ".jpg"):
            photos[base] = name
        elif e in (".mov", ".mp4"):
            videos[base] = name
    return photos, videos


def exif_datetime(im, base):
    if base in DATE_FALLBACK:
        return DATE_FALLBACK[base] + ("fallback",)
    try:
        ex = im.getexif()
        raw = ex.get(36867) or ex.get(306)
        if raw:
            dt = datetime.datetime.strptime(str(raw).strip(), "%Y:%m:%d %H:%M:%S")
            return (dt.strftime("%Y-%m-%d"), dt.strftime("%H:%M"), "exif")
    except Exception:
        pass
    return ("", "", "none")


def video_meta(path):
    data = open(path, "rb").read()
    meta = {
        "dur": None, "w": None, "h": None,
        "audio": (b"mp4a" in data) or (b"soun" in data),
        "codec": "h264" if b"avc1" in data else ("hevc" if (b"hvc1" in data or b"hev1" in data) else "unknown"),
    }
    idx = data.find(b"mvhd")
    if idx > 0:
        off = idx + 4
        ver = data[off]
        try:
            if ver == 1:
                base = off + 4 + 8 + 8
                timescale = struct.unpack(">I", data[base:base + 4])[0]
                duration = struct.unpack(">Q", data[base + 4:base + 12])[0]
            else:
                base = off + 4 + 4 + 4
                timescale = struct.unpack(">I", data[base:base + 4])[0]
                duration = struct.unpack(">I", data[base + 4:base + 8])[0]
            if timescale:
                meta["dur"] = round(duration / timescale, 2)
        except Exception:
            pass
    # размеры из tkhd (fixed point 16.16)
    t = data.find(b"tkhd")
    if t > 0:
        try:
            off = t + 4
            ver = data[off]
            p = off + 4 + (8 if ver == 1 else 4) + 8 + (8 if ver == 1 else 4)
            p += 2 + 2 + 2 + 2 + 4 + 4 + 8 + 2 + 2 + 2 + 2 + 36  # пропускаем служебные поля
            w = struct.unpack(">I", data[p:p + 4])[0] / 65536.0
            h = struct.unpack(">I", data[p + 4:p + 8])[0] / 65536.0
            if w > 1 and h > 1:
                meta["w"], meta["h"] = int(round(w)), int(round(h))
        except Exception:
            pass
    return meta


def save_jpeg(im, path, long_side, quality):
    src = im.copy()
    src.thumbnail((long_side, long_side), Image.LANCZOS)
    src.save(path, "JPEG", quality=quality, optimize=True, progressive=True)
    return src.size


def avg_color(im):
    small = im.resize((1, 1), Image.BOX).convert("RGB")
    r, g, b = small.getpixel((0, 0))
    return "#%02x%02x%02x" % (r, g, b)


def main():
    for d in (FULL, THUMB, LIVE, DATA_DIR, JS_DIR):
        os.makedirs(d, exist_ok=True)

    photos_map, videos_map = find_files()
    wanted = [pid for ch in CHAPTERS for pid in ch["photos"]]
    missing = [pid for pid in wanted if pid not in photos_map]
    if missing:
        raise SystemExit("Нет файлов фотографий: %s" % missing)

    entries, used_videos = [], set()
    for pid in wanted:
        src_path = os.path.join(SRC, photos_map[pid])
        with Image.open(src_path) as raw:
            im = ImageOps.exif_transpose(raw).convert("RGB")
            date, time, source = exif_datetime(raw, pid)
            color = avg_color(im)
            fw, fh = save_jpeg(im, os.path.join(FULL, pid + ".jpg"), FULL_MAX, JPEG_QUALITY_FULL)
            tw, th = save_jpeg(im, os.path.join(THUMB, pid + ".jpg"), THUMB_MAX, JPEG_QUALITY_THUMB)
            orig_w, orig_h = im.size

        entry = {
            "id": pid,
            "full": "assets/photos/full/%s.jpg" % pid,
            "thumb": "assets/photos/thumb/%s.jpg" % pid,
            "w": orig_w, "h": orig_h,
            "ar": round(orig_w / orig_h, 4),
            "fullW": fw, "fullH": fh,
            "color": color,
            "date": date, "time": time, "dateSource": source,
            "dateLabel": ("%d %s" % (int(date[8:10]), RU_MONTHS_GEN[int(date[5:7]) - 1])) if date else "",
            "caption": CAPTIONS.get(pid, ""),
            "live": None,
        }
        if pid in videos_map:
            vname = videos_map[pid]
            dst = os.path.join(LIVE, pid + ".mov")
            shutil.copy2(os.path.join(SRC, vname), dst)
            used_videos.add(pid)
            vm = video_meta(dst)
            entry["live"] = {
                "src": "assets/live/%s.mov" % pid,
                "w": vm["w"] or orig_w, "h": vm["h"] or orig_h,
                "dur": vm["dur"], "audio": bool(vm["audio"]), "codec": vm["codec"],
            }
        entries.append(entry)

    by_id = {e["id"]: e for e in entries}

    chapters = []
    for ch in CHAPTERS:
        chapters.append({
            "num": ch["num"], "title": ch["title"], "date": ch["date"], "note": ch["note"],
            "photos": [by_id[p] for p in ch["photos"]],
        })

    dates = sorted(e["date"] for e in entries if e["date"])
    first, last = dates[0], dates[-1]
    days = (datetime.date.fromisoformat(last) - datetime.date.fromisoformat(first)).days + 1
    live_count = sum(1 for e in entries if e["live"])

    data = {
        "generated": datetime.date.today().isoformat(),
        "stats": {
            "photos": len(entries),
            "live": live_count,
            "chapters": len(chapters),
            "days": days,
            "firstDate": first,
            "lastDate": last,
            "firstLabel": "%d %s" % (int(first[8:10]), RU_MONTHS_GEN[int(first[5:7]) - 1]),
            "lastLabel": "%d %s" % (int(last[8:10]), RU_MONTHS_GEN[int(last[5:7]) - 1]),
        },
        "hero": [by_id[p] for p in HERO_POLAROIDS if p in by_id],
        "chapters": chapters,
        "interludes": [dict(i, photo=by_id[i["photo"]]) for i in INTERLUDES if i["photo"] in by_id],
        "liveStrip": [by_id[p] for p in LIVE_STRIP if p in by_id and by_id[p]["live"]],
    }

    with open(os.path.join(DATA_DIR, "media.json"), "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)

    payload = "/* Автоматически создано tools/build_assets.py — не редактируй вручную */\n" \
              "window.ALBUM_DATA = " + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";\n"
    with open(os.path.join(JS_DIR, "media-data.js"), "w", encoding="utf-8") as f:
        f.write(payload)

    total = 0
    for root, _, files in os.walk(ASSETS):
        for fn in files:
            total += os.path.getsize(os.path.join(root, fn))
    print("photos:", len(entries), "live:", live_count, "chapters:", len(chapters), "days:", days)
    print("videos copied:", len(used_videos), "| skipped video-only:", len(set(videos_map) - used_videos))
    print("assets size: %.1f MB" % (total / 1048576))
    print("per-codec:", {e["live"]["codec"] for e in entries if e["live"]})
    print("audio in live:", sum(1 for e in entries if e["live"] and e["live"]["audio"]), "/", live_count)


if __name__ == "__main__":
    main()
