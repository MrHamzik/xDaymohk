# connection-channel — папка для обмена файлами

Эта папка — **исключение из `.gitignore`**: всё, что в неё положено,
коммитится и доходит до собеседника через `git pull` / `git push`.

## Как пользоваться

- Положил файл сюда → `git add connection-channel/...` → `git commit` → `git push` — файл ушёл.
- Забрал файл: `git pull` → файл появился в `connection-channel/`.

## Что здесь лежит

| Файл | Назначение |
|---|---|
| `gar-houses.py` | Скрипт: сбор домов села из ГАР (XML ФНС) в CSV для импорта в админку |
| `run-gar.sh` | Обёртка для запуска в Git Bash (Windows) |
| `run-gar.bat` | Обёртка для запуска двойным кликом (Windows) |

## Как использовать скрипт (кратко)

1. Скопируй нужные файлы из `connection-channel/` в корень проекта
   (или запускай прямо отсюда, указав путь к `gar-houses.py`).
2. Впиши ключ Яндекса в `run-gar.sh` / `run-gar.bat`
   (переменная `YANDEX_GEOCODER_API_KEY`).
3. Запусти `bash run-gar.sh` (Git Bash) или двойной клик по `run-gar.bat`.

Подробности — в шапке файла `gar-houses.py` (опции `--dir`, `--city`,
`--max`, `--center-lat/--center-lng`, `--no-geocode`, `--debug`).

## Правило

Обычные скрипты/данные (`*.py`, `*.csv`, `*.bat`, `*.sh`, ...) в git **не**
коммитятся — только через эту папку.
