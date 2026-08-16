@echo off
chcp 65001 >nul
cd /d "%~dp0"

rem Впишите ключ Яндекса вместо ВСТАВЬТЕ_ЯНДЕКС_КЛЮЧ
set YANDEX_GEOCODER_API_KEY=ВСТАВЬТЕ_ЯНДЕКС_КЛЮЧ

rem С какого адреса начинать (1-based) и сколько обработать.
rem START=1 — с самого начала. MAX=0 — без ограничения.
rem Пример: START=800 MAX=1000 — начать с 800-го, найти 1000 адресов.
set START=1
set MAX=0

echo --- Проверка Python ---
set PY=python
where py >nul 2>nul && set PY=py
%PY% -c "import sys" >nul 2>nul || (
  echo Python не найден. Установите Python с https://www.python.org/downloads/ и отметьте галочку 'Add to PATH'.
  pause
  exit /b 1
)
%PY% --version

echo --- Запуск ---
set CMD=%PY% gar-houses.py --dir "C:\ФИАС-ГАС\20" --city "село Самашки" --region 20 --center-lat 43.291081 --center-lng 45.301384
if %START% GTR 1 set CMD=%CMD% --start %START%
if %MAX% GTR 0 set CMD=%CMD% --max %MAX%
%CMD%

pause
