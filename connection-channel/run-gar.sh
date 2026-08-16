#!/usr/bin/env bash
# ============================================================
#  Сбор домов села Самашки (регион 20) из ГАР -> CSV для импорта
#
#  Использование:
#   1. Впишите ключ Яндекса ниже (вместо ВСТАВЬТЕ_ЯНДЕКС_КЛЮЧ).
#      (Dadata НЕ используется — в OSM нет адресов Самашек.)
#   2. При необходимости задайте START (с какого адреса начинать,
#      порядковый номер, 1-based) и MAX (сколько адресов обработать).
#      Пример: START=800 MAX=1000 — начать с 800-го, найти 1000 адресов.
#   3. В Git Bash выполните:  bash run-gar.sh
#
#  Дома, которые Яндекс не найдёт по точному адресу, получат
#  координаты центра села (43.291081, 45.301384) — см. --no-center.
# ============================================================
cd "$(dirname "$0")" || exit 1

export YANDEX_GEOCODER_API_KEY="ВСТАВЬТЕ_ЯНДЕКС_КЛЮЧ"

# С какого адреса начинать (1-based) и сколько обработать.
# START=1 — с самого начала. MAX=0 — без ограничения.
START=1
MAX=0

echo "--- Проверка Python ---"
PY=""
for c in python3 python py; do
  if command -v "$c" >/dev/null 2>&1; then
    if "$c" -c "import sys; sys.exit(0)" >/dev/null 2>&1; then
      PY="$c"
      break
    fi
  fi
done
if [ -z "$PY" ]; then
  echo "Python не найден. Установите Python с https://www.python.org/downloads/ и отметьте галочку 'Add to PATH'."
  exit 1
fi
echo "Использую: $PY ($($PY --version 2>&1))"

echo "--- Проверка файла скрипта ---"
if [ ! -f "gar-houses.py" ]; then
  echo "Не найден gar-houses.py в connection-channel — вы в правильной папке?"
  ls
  exit 1
fi

echo "--- Запуск ---"
ARGS=(--dir "/c/ФИАС-ГАС/20" --city "село Самашки" --region 20 --center-lat 43.291081 --center-lng 45.301384)
[ "$START" -gt 1 ] 2>/dev/null && ARGS+=(--start "$START")
[ "$MAX" -gt 0 ] 2>/dev/null && ARGS+=(--max "$MAX")
"$PY" gar-houses.py "${ARGS[@]}"
