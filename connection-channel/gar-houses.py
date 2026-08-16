#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
gar-houses.py — сбор домов региона из ГАР (ФНС) в CSV для импорта в админку xDaymohk.

Что делает (одной командой):
  1. Скачивает полный архив ГАР (gar_xml.zip, ~37 ГБ) с докачкой
     (aria2c, если установлен, иначе python-загрузчик с Range-докачкой),
     либо принимает уже скачанный архив через --zip.
  2. Извлекает ТОЛЬКО папку региона (по умолчанию 20 — Чеченская Республика),
     не распаковывая весь архив.
  3. Разбирает XML: находит населённый пункт (по умолчанию «Даймохк»),
     его улицы и дома (AS_ADDR_OBJ + AS_ADM_HIERARCHY/AS_MUN_HIERARCHY + AS_HOUSES).
  4. Для каждого дома «ул. X, д. N» получает координаты:
       - слой 1: Dadata  (DADATA_API_TOKEN, бесплатно);
       - слой 2: Яндекс Геокодер (YANDEX_GEOCODER_API_KEY, бесплатно 25k/сутки);
       - если оба недоступны/не нашли — строка уходит в houses_missing.csv
         (без координат), чтобы расставить вручную.
  5. Пишет:
       houses_final.csv   — street;house_number;lat;lng  (готово к импорту);
       houses_missing.csv — street;house_number           (координаты не найдены);
       houses_addresses.csv — street;house_number         (все адреса без координат).

Запуск:
    # если есть РАСПАКОВАННАЯ папка региона с XML ГАР (самый быстрый путь):
    python3 scripts/gar-houses.py --dir "C:\\ФИАС-ГАС\\20" --city "село Самашки" --region 20

    # если есть архив gar_xml.zip:
    python3 scripts/gar-houses.py --zip /путь/к/gar_xml.zip --city "Самашки" --region 20

    # скачать архив и обработать:
    DADATA_API_TOKEN=... YANDEX_GEOCODER_API_KEY=... \
      python3 scripts/gar-houses.py --city "Даймохк" --region 20

    # только адреса, без геокодинга:
    python3 scripts/gar-houses.py --dir "C:\\ФИАС-ГАС\\20" --no-geocode

    # ограничить геокод-вызовы (Dadata + Яндекс) до 100:
    python3 scripts/gar-houses.py --dir "C:\\ФИАС-ГАС\\20" --city "село Самашки" --max 100

    # начать с 800-го адреса и обработать 1000 (адреса 800..1799):
    python3 scripts/gar-houses.py --dir "C:\\ФИАС-ГАС\\20" --city "село Самашки" --start 800 --max 1000

Требования: Python 3.8+. Все данные — открытый источник ФНС (ГАР).
"""

import argparse
import csv
import json
import os
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
import zipfile

# Свежая версия из официального API ФНС (GetAllDownloadFileInfo).
# Скрипт сначала пытается получить актуальный URL из API, при неудаче — этот.
FALLBACK_GAR_URL = "https://fias-file.nalog.ru/downloads/2026.08.11/gar_xml.zip"
FILE_INFO_API = "https://fias.nalog.ru/WebServices/Public/GetAllDownloadFileInfo"

# Типы улично-дорожной сети (TYPENAME в ГАР), чтобы отличать улицы от НП/районов.
STREET_TYPE_HINTS = (
    "ул", "улица", "пер", "переулок", "пр-кт", "проспект", "ш", "шоссе",
    "пр-д", "проезд", "наб", "набережная", "б-р", "бульвар", "аллея",
    "туп", "тупик", "пл", "площадь", "линия", "мкр", "микрорайон", "тер", "территория",
)

HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125.0 Safari/537.36"}


def log(msg: str) -> None:
    print(msg, flush=True)


# ---------------------------------------------------------------- download

def get_latest_gar_url() -> str:
    """Тянет актуальный GarXMLFullURL из API ФНС, при ошибке — fallback."""
    try:
        req = urllib.request.Request(FILE_INFO_API, headers=HEADERS)
        with urllib.request.urlopen(req, timeout=30) as r:
            data = json.loads(r.read().decode("utf-8"))
        if isinstance(data, list) and data:
            url = data[0].get("GarXMLFullURL")
            if url:
                return url
    except Exception as e:
        log(f"[warn] Не удалось получить URL из API ФНС ({e}); беру fallback.")
    return FALLBACK_GAR_URL


def download_with_aria2(url: str, dest: str) -> bool:
    if shutil.which("aria2c") is None:
        return False
    log("[i] Качаю через aria2c (многопоточно, с докачкой)...")
    subprocess.run(
        ["aria2c", "-x16", "-s16", "-c", "--file-allocation=none", "-d", os.path.dirname(dest), "-o", os.path.basename(dest), url],
        check=False,
    )
    return os.path.exists(dest) and os.path.getsize(dest) > 0


def download_python(url: str, dest: str) -> None:
    """Простой загрузчик с докачкой через Range. Сервер ФНС любит обрывать — не паникуем."""
    log("[i] Качаю python-загрузчиком (с докачкой)...")
    while True:
        size = os.path.getsize(dest) if os.path.exists(dest) else 0
        headers = dict(HEADERS)
        if size > 0:
            headers["Range"] = f"bytes={size}-"
        req = urllib.request.Request(url, headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=60) as r, open(dest, "ab") as f:
                while True:
                    chunk = r.read(1 << 20)
                    if not chunk:
                        break
                    f.write(chunk)
            break
        except (urllib.error.URLError, OSError) as e:
            log(f"[warn] Обрыв загрузки ({e}); продолжаю с {os.path.getsize(dest) if os.path.exists(dest) else 0} байт...")
            time.sleep(2)


def ensure_gar_zip(zip_path: str, url: str) -> str:
    if os.path.exists(zip_path) and os.path.getsize(zip_path) > 0:
        log(f"[i] Архив уже есть: {zip_path} ({os.path.getsize(zip_path) / 2**30:.1f} ГБ)")
        return zip_path
    if not download_with_aria2(url, zip_path):
        download_python(url, zip_path)
    log(f"[ok] Скачано: {zip_path} ({os.path.getsize(zip_path) / 2**30:.1f} ГБ)")
    return zip_path


# ---------------------------------------------------------------- extract

def extract_region(zip_path: str, region: str, outdir: str) -> str:
    """Извлекает из гигантского zip только папку региона (без распаковки всего)."""
    region_dir = os.path.join(outdir, f"region_{region}")
    os.makedirs(region_dir, exist_ok=True)
    wanted = {region, region.zfill(2), region.lstrip("0")}
    log(f"[i] Извлекаю папку региона {region} из {os.path.basename(zip_path)}...")
    with zipfile.ZipFile(zip_path) as zf:
        for name in zf.namelist():
            parts = name.replace("\\", "/").split("/")
            if not parts or parts[0] not in wanted:
                continue
            # нужны только таблицы: адресные объекты, иерархия, дома
            base = os.path.basename(name)
            if not any(base.startswith(p) for p in ("AS_ADDR_OBJ_", "AS_ADM_HIERARCHY_", "AS_MUN_HIERARCHY_", "AS_HOUSES_")):
                continue
            # параметры/справочники/деления не нужны (большие, без адресной иерархии)
            if "PARAMS" in base or "TYPES" in base or "DIVISION" in base:
                continue
            target = os.path.join(region_dir, base)
            with zf.open(name) as src, open(target, "wb") as dst:
                shutil.copyfileobj(src, dst, 1 << 20)
    log(f"[ok] Регион {region} извлечён в {region_dir}")
    return region_dir


# ---------------------------------------------------------------- parse

def _local(tag: str) -> str:
    """Убирает namespace из имени тега."""
    return tag.rsplit("}", 1)[-1]


def list_region_files(region_dir: str, prefix: str) -> list[str]:
    """Все файлы с префиксом в папке региона (в т.ч. во вложенных подпапках)."""
    out: list[str] = []
    for root, _dirs, files in os.walk(region_dir):
        for fn in files:
            if fn.startswith(prefix):
                out.append(os.path.join(root, fn))
    return sorted(out)


def iter_records(xml_path: str, element_names):
    """Стриминговый обход больших XML ГАР (ElementTree.iterparse + очистка).

    element_names — имя тега или кортеж имён (в реальных выгрузках ГАР
    элементы внутри AS_ADDR_OBJ называются <OBJECT>, в старых — <ADDR_OBJ>).
    """
    if isinstance(element_names, str):
        element_names = (element_names,)
    for event, elem in ET.iterparse(xml_path, events=("end",)):
        if _local(elem.tag) in element_names:
            yield dict(elem.attrib)
        elem.clear()


def load_addr_objects(region_dir: str) -> dict[str, dict]:
    """OBJECTID -> {name, typename, level, is_actual}.

    Ищем и <OBJECT>, и <ADDR_OBJ> — разные версии выгрузок ГАР используют
    разные имена тегов. Файлы *_DIVISION_/*_PARAMS_/*_TYPES пропускаем.
    """
    objs: dict[str, dict] = {}
    files = [
        p for p in list_region_files(region_dir, "AS_ADDR_OBJ_")
        if "DIVISION" not in p and "PARAMS" not in p and "TYPES" not in p
    ]
    log(f"[i] Файлов AS_ADDR_OBJ (без DIVISION/PARAMS/TYPES): {len(files)}")
    for path in files:
        for rec in iter_records(path, ("OBJECT", "ADDR_OBJ")):
            oid = rec.get("OBJECTID")
            if not oid:
                continue
            objs[oid] = {
                "name": rec.get("NAME", "").strip(),
                "typename": rec.get("TYPENAME", "").strip().lower(),
                "level": rec.get("LEVEL", ""),
                "actual": rec.get("ISACTUAL", "") == "1" and rec.get("ISACTIVE", "") != "0",
            }
    if not objs and files:
        # диагностика: покажем начало первого файла, чтобы понять реальный формат
        try:
            with open(files[0], "r", encoding="utf-8", errors="replace") as f:
                head = f.read(400)
            log(f"[warn] Объектов не найдено. Начало файла {os.path.basename(files[0])}:")
            log(head)
        except Exception as e:
            log(f"[warn] Не удалось прочитать {files[0]}: {e}")
    return objs


def load_parent_map(region_dir: str) -> dict[str, str]:
    """OBJECTID -> PARENTOBJID (адм. иерархия приоритетнее, затем муниципальная)."""
    parents: dict[str, str] = {}
    for prefix in ("AS_ADM_HIERARCHY_", "AS_MUN_HIERARCHY_"):
        for path in list_region_files(region_dir, prefix):
            for rec in iter_records(path, "ITEM"):
                oid = rec.get("OBJECTID")
                pid = rec.get("PARENTOBJID")
                if oid and pid and rec.get("ISACTIVE", "") != "0":
                    parents[oid] = pid
    return parents


# Префиксы типов населённых пунктов — отрезаем от --city, чтобы «село Самашки»
# находило запись ГАР с NAME="Самашки" (тип лежит в отдельном поле TYPENAME).
NP_PREFIXES = (
    "сельское поселение ", "село ", "посёлок городского типа ", "посёлок ", "поселок ",
    "городской округ ", "город ", "городок ", "г-к ", "пгт ", "деревня ", "станица ",
    "ст-ца ", "аул ", "хутор ", "кишлак ", "рабочий посёлок ", "р-н ", "район ",
    "с ", "г ", "п ", "д ", "х ",
)


def normalize_np_name(s: str) -> str:
    t = s.strip().lower()
    changed = True
    while changed:
        changed = False
        for p in NP_PREFIXES:
            if t.startswith(p):
                t = t[len(p):].strip()
                changed = True
                break
    return t


def find_city(objs: dict[str, dict], target: str) -> str | None:
    target_l = normalize_np_name(target)
    # точное совпадение среди актуальных
    for oid, o in objs.items():
        if o["actual"] and o["name"].lower() == target_l:
            return oid
    # частичное (начинается с)
    for oid, o in objs.items():
        if o["actual"] and o["name"].lower().startswith(target_l):
            return oid
    return None


def is_street(o: dict) -> bool:
    return o["level"] in ("7", "8") or o["typename"] in STREET_TYPE_HINTS


def find_streets_of_city(objs: dict[str, dict], parents: dict[str, str], city_id: str) -> set[str]:
    street_ids: set[str] = set()
    for oid, o in objs.items():
        if not (o["actual"] and is_street(o)):
            continue
        cur = parents.get(oid)
        hops = 0
        while cur and hops < 12:
            if cur == city_id:
                street_ids.add(oid)
                break
            cur = parents.get(cur)
            hops += 1
    return street_ids


def load_houses(region_dir: str) -> list[dict]:
    """Все актуальные дома из AS_HOUSES (без фильтра по улицам).

    В реальном ГАР дом НЕ хранит родителя: тег HOUSE имеет только OBJECTID,
    NUMBER и т.п. Привязка «дом -> улица/НП» лежит в файлах иерархии
    (AS_ADM_HIERARCHY / AS_MUN_HIERARCHY), где есть запись
    OBJECTID = ID дома, PARENTOBJID = ID улицы/НП.
    Возвращает список {objectid, parentobjid, housenum}.
    """
    rows: list[dict] = []
    for path in list_region_files(region_dir, "AS_HOUSES_"):
        for rec in iter_records(path, "HOUSE"):
            if rec.get("ISACTUAL", "") != "1" or rec.get("ISACTIVE", "") == "0":
                continue
            # в реальных выгрузках номер — атрибут NUMBER, в старых — HOUSENUM
            num = (rec.get("HOUSENUM") or rec.get("NUMBER") or "").strip()
            extra = (rec.get("ADDNUM1") or "").strip()  # корпус/строение
            if extra:
                num = f"{num} к.{extra}"
            if not num:
                continue
            rows.append({
                "objectid": rec.get("OBJECTID", "").strip(),
                "parentobjid": rec.get("PARENTOBJID", "").strip(),
                "housenum": num,
            })
    return rows


# ---------------------------------------------------------------- geocode

def geocode_dadata(token: str, query: str) -> tuple[str, str, str, str]:
    """Возвращает (lat, lng, qc_geo, value) или („“, „“, „“, „“)."""
    body = json.dumps({
        "query": query,
        "from_bound": {"value": "street"},
        "to_bound": {"value": "house"},
        "count": 1,
    }).encode("utf-8")
    req = urllib.request.Request(
        "https://suggestions.dadata.ru/suggestions/api/4_1/rs/suggest/address",
        data=body,
        headers={"Authorization": f"Token {token}", "Content-Type": "application/json", **HEADERS},
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            data = json.loads(r.read().decode("utf-8"))
    except Exception:
        return "", "", "", ""
    sugg = data.get("suggestions") or []
    if not sugg:
        return "", "", "", ""
    d = sugg[0].get("data", {}) or {}
    return str(d.get("geo_lat") or ""), str(d.get("geo_lon") or ""), str(d.get("qc_geo") or ""), str(sugg[0].get("value") or "")


def geocode_yandex(key: str, query: str) -> tuple[str, str, str]:
    """Возвращает (lat, lng, info). info — 'yandex' при успехе, иначе текст ошибки/пусто."""
    params = urllib.parse.urlencode({"apikey": key, "geocode": query, "format": "json", "results": 1})
    url = f"https://geocode-maps.yandex.ru/1.x/?{params}"
    req = urllib.request.Request(url, headers=HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            data = json.loads(r.read().decode("utf-8"))
    except Exception as e:
        return "", "", f"ошибка сети: {e}"
    try:
        geo = data["response"]["GeoObjectCollection"]["featureMember"][0]["GeoObject"]
        pos = geo["Point"]["pos"].split()  # "lon lat"
        return pos[1], pos[0], "yandex"
    except Exception:
        # если API вернул ошибку — покажем её текст (в --debug)
        err = str(data.get("error") or data.get("message") or data)[:200]
        return "", "", err


# ---------------------------------------------------------------- main

def main() -> None:
    ap = argparse.ArgumentParser(description="Сбор домов региона из ГАР в CSV для импорта")
    ap.add_argument("--dir", help="путь к РАСПАКОВАННОЙ папке региона с XML ГАР (напр. C:\\ФИАС-ГАС\\20)")
    ap.add_argument("--zip", help="путь к уже скачанному gar_xml.zip (пропускает скачивание)")
    ap.add_argument("--region", default="20", help="код региона (по умолчанию 20 — Чечня)")
    ap.add_argument("--city", default="Даймохк", help="населённый пункт (по умолчанию Даймохк)")
    ap.add_argument("--out", default=".", help="куда писать результат")
    ap.add_argument("--no-geocode", action="store_true", help="только адреса, без координат")
    ap.add_argument("--dadata", action="store_true",
                    help="использовать Dadata (по умолчанию ВЫКЛЮЧЕН — в OSM нет адресов Самашек)")
    ap.add_argument("--no-center", action="store_true",
                    help="не ставить координаты центра села для домов, которые геокодер не нашёл")
    ap.add_argument("--center-lat", type=float, default=None,
                    help="координаты центра села (широта) для фолбэка, напр. 43.291081")
    ap.add_argument("--center-lng", type=float, default=None,
                    help="координаты центра села (долгота) для фолбэка, напр. 45.301384")
    ap.add_argument("--max", type=int, default=None,
                    help="лимит на число геокод-вызовов (Яндекс, +Dadata если включён); по умолчанию без ограничения")
    ap.add_argument("--start", type=int, default=1,
                    help="с какого адреса (1-based, порядковый номер в списке) начинать геокодинг; "
                         "адреса до него пропускаются без вызовов. Пример: --start 800 --max 1000")
    ap.add_argument("--sleep", type=float, default=0.15, help="пауза между геокод-запросами, сек")
    ap.add_argument("--strict-qc", action="store_true", help="Dadata: брать только qc_geo 0/1 (дом/улица)")
    ap.add_argument("--debug", action="store_true", help="показывать первые запросы и ответы геокодеров")
    args = ap.parse_args()

    dadata_token = os.environ.get("DADATA_API_TOKEN", "")
    yandex_key = os.environ.get("YANDEX_GEOCODER_API_KEY", "")
    os.makedirs(args.out, exist_ok=True)

    # 1. источник данных: готовая папка с XML региона (--dir) или архив (--zip/скачивание)
    if args.dir:
        region_dir = os.path.abspath(args.dir)
        if not os.path.isdir(region_dir):
            log(f"[!] Папка не найдена: {region_dir}")
            sys.exit(1)
        log(f"[i] Использую готовую папку с XML региона: {region_dir}")
    else:
        zip_path = args.zip or os.path.join(args.out, "gar_xml.zip")
        if args.zip:
            log(f"[i] Использую готовый архив: {zip_path}")
        else:
            url = get_latest_gar_url()
            log(f"[i] URL архива: {url}")
            zip_path = ensure_gar_zip(zip_path, url)
        region_dir = extract_region(zip_path, args.region, args.out)

    # 3. разбор
    log("[i] Читаю адресные объекты...")
    objs = load_addr_objects(region_dir)
    log(f"[i] Объектов адресации: {len(objs)}")

    parents = load_parent_map(region_dir)
    city_id = find_city(objs, args.city)
    if not city_id:
        hints = [o["name"] for o in objs.values() if args.city.lower() in o["name"].lower()][:10]
        log(f"[!] НП «{args.city}» не найден. Похожие названия: {hints or 'нет'}")
        log("    Попробуйте --city с другим написанием (например: --city Дай)")
        sys.exit(1)
    log(f"[ok] НП найден: {objs[city_id]['name']} (id {city_id})")
    # Полное имя для геокодера: «село Самашки» (тип + название из ГАР).
    city_full = f"{objs[city_id]['typename']} {objs[city_id]['name']}".strip()

    streets = find_streets_of_city(objs, parents, city_id)
    log(f"[i] Улиц: {len(streets)}")

    # Связываем дома через иерархию: parents[OBJECTID дома] = ID улицы/НП.
    # (в HOUSE нет PARENTOBJID — он лежит в AS_ADM_HIERARCHY/AS_MUN_HIERARCHY)
    house_rows = load_houses(region_dir)
    log(f"[i] Всего актуальных домов в файлах AS_HOUSES: {len(house_rows)}")
    with_street = []
    without_street = []
    unknown = []
    no_parent = 0
    for h in house_rows:
        pid = parents.get(h["objectid"], "")
        if not pid:
            no_parent += 1
            unknown.append(h)
        elif pid in streets:
            with_street.append(h)
        elif pid == city_id:
            without_street.append(h)  # дом привязан напрямую к селу
        else:
            unknown.append(h)
    log(f"[i]   с улицей (родитель ∈ улицы):  {len(with_street)}")
    log(f"[i]   без улицы (родитель == НП):    {len(without_street)}")
    log(f"[i]   прочие (родитель не улица/НП): {len(unknown)} (из них без записи в иерархии: {no_parent})")

    # Дома с улицей + (если улиц в цепочке нет) дома, привязанные к селу.
    unique = set()
    for h in with_street:
        unique.add((objs[parents[h["objectid"]]]["name"], h["housenum"]))
    for h in without_street:
        unique.add(("", h["housenum"]))  # улица неизвестна (дом привязан к селу)
    unique = sorted(unique)

    if not unique and unknown:
        log("[!] Домов с улицей/НП не найдено. Диагностика первых 10 домов:")
        for h in unknown[:10]:
            pid = parents.get(h["objectid"], "")
            parent_name = objs.get(pid, {}).get("name", "(нет в AS_ADDR_OBJ)")
            parent_typename = objs.get(pid, {}).get("typename", "?")
            log(f"    HOUSE id={h['objectid']} -> PARENTOBJID={pid or '(нет записи)'} "
                f"(«{parent_name}», тип «{parent_typename}») номер={h['housenum']}")
        log("[!] Пришлите этот вывод — поправлю скрипт под реальную структуру.")
        sys.exit(1)

    log(f"[i] Домов: {len(unique)}" + (" (часть без улицы)" if without_street else ""))
    if not unique:
        log("[!] Домов не найдено — возможно, в ГАР у села нет домов (бывает).")
        sys.exit(1)

    # 4. адреса без координат
    addr_csv = os.path.join(args.out, "houses_addresses.csv")
    with open(addr_csv, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f, delimiter=";")
        w.writerow(["street", "house_number"])
        for street, num in unique:
            w.writerow([street, num])
    log(f"[ok] Адреса: {addr_csv}")

    # 5. координаты
    final_rows: list[tuple[str, str, str, str]] = []
    center_rows: list[tuple[str, str, str, str]] = []
    missing: list[tuple[str, str]] = []
    if args.no_geocode or not (dadata_token or yandex_key):
        if not args.no_geocode:
            log("[warn] Нет токенов (DADATA_API_TOKEN / YANDEX_GEOCODER_API_KEY) — геокодинг пропущен.")
        missing = unique
    else:
        log("[i] Геокодинг: Яндекс (основной). Dadata — только при --dadata.")
        if args.max:
            log(f"[i] Лимит геокод-вызовов: {args.max}")
        if args.start and args.start > 1:
            log(f"[i] Старт: с {args.start}-го адреса (пропускаю {args.start - 1} шт.)")
        if args.debug:
            log("[i] Режим --debug: покажу первые 5 запросов и ответы.")
        calls = 0
        stop_reason = ""
        # Полное имя села с типом: «село Самашки» — так село называется в базе Яндекса.
        city_q = city_full

        # Центр села — для домов, которые геокодер не найдёт по точному адресу.
        center_lat = center_lng = ""
        if yandex_key and not args.no_center:
            if args.max is not None and calls >= args.max:
                stop_reason = "лимит --max"
            else:
                calls += 1
                center_lat, center_lng, info = geocode_yandex(
                    yandex_key, f"Чеченская Республика, {city_q}")
                if args.debug:
                    log(f"    [Яндекс-центр] «Чеченская Республика, {city_q}» -> "
                        f"lat={center_lat or '—'} ({info})")
        if (not center_lat) and args.center_lat and args.center_lng:
            center_lat, center_lng = str(args.center_lat), str(args.center_lng)
            log(f"[i] Центр села (из --center-lat/lng): {center_lat}, {center_lng}")
        if center_lat and not args.no_center:
            log(f"[i] Дома без точных координат получат центр села "
                f"({center_lat}, {center_lng}). Отключить: --no-center")

        for i, (street, num) in enumerate(unique, 1):
            if i < args.start:
                continue  # пропускаем адреса до --start (вызовы не тратим)
            if args.max is not None and calls >= args.max:
                stop_reason = "лимит --max"
                break
            base_addr = f"Чеченская Республика, {city_q}"
            if street:
                base_addr += f", {street}"
            query = f"{base_addr}, {num}"
            lat = lng = ""
            # Яндекс — основной геокодер
            if yandex_key:
                if args.max is not None and calls >= args.max:
                    stop_reason = "лимит --max"
                    break
                calls += 1
                lat, lng, info = geocode_yandex(yandex_key, query)
                if args.debug and i <= 5:
                    log(f"    [Яндекс] «{query}» -> lat={lat or '—'} ({info})")
            # Dadata — только если явно включён флагом --dadata
            if not lat and args.dadata and dadata_token:
                if args.max is not None and calls >= args.max:
                    stop_reason = "лимит --max"
                    break
                calls += 1
                lat, lng, qc, value = geocode_dadata(dadata_token, query)
                if args.debug and i <= 5:
                    log(f"    [Dadata] «{query}» -> value=«{value}» lat={lat or '—'} qc={qc or '—'}")
                if args.strict_qc and qc not in ("0", "1"):
                    lat = lng = ""
                if not lat and street:
                    if args.max is not None and calls >= args.max:
                        stop_reason = "лимит --max"
                        break
                    calls += 1
                    lat, lng, qc, value = geocode_dadata(dadata_token, base_addr)
                    if args.debug and i <= 5:
                        log(f"    [Dadata-улица] «{base_addr}» -> value=«{value}» lat={lat or '—'} qc={qc or '—'}")
                    if args.strict_qc and qc not in ("0", "1"):
                        lat = lng = ""
            if lat and lng:
                final_rows.append((street, num, lat, lng))
            elif center_lat and center_lng and not args.no_center:
                center_rows.append((street, num, center_lat, center_lng))
            else:
                missing.append((street, num))
            if i % 25 == 0:
                log(f"    {i}/{len(unique)} (вызовов: {calls})")
            time.sleep(args.sleep)
        if stop_reason:
            log(f"[i] Остановлено по {stop_reason} ({calls} вызовов). Остальные адреса — в houses_addresses.csv.")

    final_csv = os.path.join(args.out, "houses_final.csv")
    with open(final_csv, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f, delimiter=";")
        w.writerow(["street", "house_number", "lat", "lng"])
        for row in final_rows:
            w.writerow(row)
    log(f"[ok] Готово к импорту: {final_csv} ({len(final_rows)} с координатами)")

    if center_rows:
        center_csv = os.path.join(args.out, "houses_center.csv")
        with open(center_csv, "w", encoding="utf-8-sig", newline="") as f:
            w = csv.writer(f, delimiter=";")
            w.writerow(["street", "house_number", "lat", "lng"])
            for row in center_rows:
                w.writerow(row)
        log(f"[i] Координаты центра села (фолбэк): {center_csv} ({len(center_rows)})")

    if missing:
        miss_csv = os.path.join(args.out, "houses_missing.csv")
        with open(miss_csv, "w", encoding="utf-8-sig", newline="") as f:
            w = csv.writer(f, delimiter=";")
            w.writerow(["street", "house_number"])
            for row in missing:
                w.writerow(row)
        log(f"[i] Без координат: {miss_csv} ({len(missing)}) — расставьте вручную в админке")

    log("Готово. Импортируйте houses_final.csv через Админка → Адреса → Импорт.")


if __name__ == "__main__":
    main()
