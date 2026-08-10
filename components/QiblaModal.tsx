'use client';

import { createPortal } from 'react-dom';
import { useEffect, useState, useCallback } from 'react';
import { Compass, Navigation, X } from 'lucide-react';
import { calculateQiblaAzimuth, DEFAULT_LAT, DEFAULT_LNG } from '@/lib/islamic';
import { useI18n } from '@/lib/i18n';

const DEFAULT_QIBLA_AZIMUTH = calculateQiblaAzimuth(DEFAULT_LAT, DEFAULT_LNG);

interface QiblaModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function QiblaModal({ isOpen, onClose }: QiblaModalProps) {
  const { language } = useI18n();
  const [deviceHeading, setDeviceHeading] = useState<number>(0);
  const [hasCompassSupport, setHasCompassSupport] = useState(false);
  const [permissionNeeded, setPermissionNeeded] = useState(false);
  const [qiblaAngle, setQiblaAngle] = useState<number>(DEFAULT_QIBLA_AZIMUTH);
  const [userCoords, setUserCoords] = useState<{lat:number,lng:number}|null>(null);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = ''; };
    }
  }, [isOpen]);

  // Получаем геолокацию для точного расчёта Киблы
  useEffect(() => {
    if (!isOpen) return;
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setUserCoords({ lat, lng });
        setQiblaAngle(calculateQiblaAzimuth(lat, lng));
      },
      () => {
        setQiblaAngle(DEFAULT_QIBLA_AZIMUTH);
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }, [isOpen]);

  const requestPermission = useCallback(async () => {
    try {
      const anyWindow = window as any;
      if (typeof anyWindow.DeviceOrientationEvent !== 'undefined' && typeof anyWindow.DeviceOrientationEvent.requestPermission === 'function') {
        const response = await anyWindow.DeviceOrientationEvent.requestPermission();
        if (response === 'granted') {
          setPermissionNeeded(false);
          setHasCompassSupport(true);
        }
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    const handleOrientation = (e: DeviceOrientationEvent) => {
      let heading: number | null = null;
      const anyEvent = e as any;
      if (typeof anyEvent.webkitCompassHeading === 'number') {
        // iOS
        heading = anyEvent.webkitCompassHeading;
        setHasCompassSupport(true);
      } else if (typeof e.alpha === 'number') {
        // Android - alpha is 0..360, 0 = North, but need to adjust
        // e.absolute true means compass heading
        heading = 360 - e.alpha;
        setHasCompassSupport(true);
      }
      if (heading !== null && !isNaN(heading)) {
        setDeviceHeading(heading);
      }
    };

    const anyWindow = window as any;
    if (typeof anyWindow.DeviceOrientationEvent !== 'undefined' && typeof anyWindow.DeviceOrientationEvent.requestPermission === 'function') {
      setPermissionNeeded(true);
    } else if ('ondeviceorientation' in window) {
      window.addEventListener('deviceorientationabsolute' as any, handleOrientation as any, true);
      window.addEventListener('deviceorientation', handleOrientation, true);
      return () => {
        window.removeEventListener('deviceorientationabsolute' as any, handleOrientation as any, true);
        window.removeEventListener('deviceorientation', handleOrientation, true);
      };
    } else if ('ondeviceorientationabsolute' in window) {
      (window as any).addEventListener('deviceorientationabsolute', handleOrientation, true);
      return () => {
        (window as any).removeEventListener('deviceorientationabsolute', handleOrientation, true);
      };
    }
  }, [isOpen]);

  if (!isOpen) return null;
  if (typeof document === 'undefined') return null;

  // Вычисляем куда поворачивать
  let diff = qiblaAngle - deviceHeading;
  // Нормализуем к -180..180
  diff = ((diff + 540) % 360) - 180;
  const absDiff = Math.abs(Math.round(diff));
  const turnDirection = diff > 0 ? (language === 'ce' ? 'аьттухьа' : 'вправо') : (language === 'ce' ? 'аьррухьа' : 'влево');
  const isAligned = absDiff < 8;

  const compassRotation = hasCompassSupport ? -deviceHeading : 0;
  const needleRotation = hasCompassSupport ? diff : 0;

  return createPortal(
    <div className="fixed inset-0 z-[85] flex items-center justify-center bg-zinc-950/70 p-4 backdrop-blur-md" role="dialog" aria-modal="true" aria-labelledby="qibla-title">
      <div className="w-full max-w-md overflow-hidden rounded-3xl bg-white p-6 shadow-2xl dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-zinc-800">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-md">
              <Compass className="h-4 w-4" />
            </div>
            <div>
              <h2 id="qibla-title" className="text-base font-bold text-slate-900 dark:text-white">
                {language === 'ce' ? 'Къилба' : 'Кибла — направление на Каабу'}
              </h2>
              <p className="text-xs text-slate-500 dark:text-zinc-500">
                {userCoords ? `${userCoords.lat.toFixed(4)}, ${userCoords.lng.toFixed(4)}` : 'Самашки / Даймохк'} · {qiblaAngle.toFixed(1)}°
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Закрыть" className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-zinc-800 dark:text-zinc-400"><X className="h-4 w-4" /></button>
        </div>

        {/* Compass Dial */}
        <div className="my-5 flex flex-col items-center justify-center">
          <div className="relative flex h-56 w-56 items-center justify-center rounded-full border-[6px] border-slate-100 bg-white shadow-inner dark:border-zinc-800 dark:bg-zinc-900">
            {/* Rotating compass background with cardinal points */}
            <div className="absolute inset-0 transition-transform duration-200 ease-out" style={{ transform: `rotate(${compassRotation}deg)` }}>
              <span className="absolute left-1/2 top-1 -translate-x-1/2 text-[11px] font-black text-red-600">N</span>
              <span className="absolute bottom-1 left-1/2 -translate-x-1/2 text-[10px] font-bold text-slate-400">S</span>
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400">E</span>
              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400">W</span>
              {/* Tick marks */}
              <div className="absolute inset-2 rounded-full border border-dashed border-slate-200 dark:border-zinc-700" />
            </div>

            {/* Qibla needle - rotates relative to compass */}
            <div className="absolute inset-0 flex items-center justify-center transition-transform duration-100 ease-out" style={{ transform: `rotate(${hasCompassSupport ? qiblaAngle : needleRotation}deg)` }}>
              {/* When compass support exists, needle is fixed to qibla angle, compass rotates, so needle rotation = qibla */}
              {/* When no compass, needle shows qibla angle */}
            </div>

            {/* Dynamic needle pointing to Qibla */}
            <div className="absolute inset-0 flex items-center justify-center transition-transform duration-150 ease-out" style={{ transform: `rotate(${hasCompassSupport ? needleRotation : 0}deg)` }}>
              <div className={`flex h-10 w-10 items-center justify-center rounded-full shadow-lg transition-colors ${isAligned ? 'bg-emerald-600 text-white' : 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'}`}>
                <Navigation className="h-5 w-5" />
              </div>
            </div>

            <div className={`absolute h-3 w-3 rounded-full shadow-md border-2 border-white dark:border-zinc-900 ${isAligned ? 'bg-emerald-500' : 'bg-slate-800 dark:bg-white'}`} />
          </div>

          {/* Degrees info */}
          <div className="mt-4 grid w-full grid-cols-3 gap-2 text-center">
            <div className="rounded-xl bg-slate-50 p-2.5 dark:bg-zinc-900 border border-slate-100 dark:border-zinc-800">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Кибла</p>
              <p className="text-sm font-black text-slate-900 dark:text-white">{qiblaAngle.toFixed(1)}°</p>
              <p className="text-[10px] text-slate-500">от севера</p>
            </div>
            <div className="rounded-xl bg-slate-50 p-2.5 dark:bg-zinc-900 border border-slate-100 dark:border-zinc-800">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Вы</p>
              <p className="text-sm font-black text-slate-900 dark:text-white">{hasCompassSupport ? `${Math.round(deviceHeading)}°` : '—'}</p>
              <p className="text-[10px] text-slate-500">{hasCompassSupport ? 'компас' : 'нет датчика'}</p>
            </div>
            <div className={`rounded-xl p-2.5 border ${isAligned ? 'bg-emerald-50 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-900' : 'bg-amber-50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-900'}`}>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Поворот</p>
              <p className={`text-sm font-black ${isAligned ? 'text-emerald-700 dark:text-emerald-300' : 'text-amber-700 dark:text-amber-300'}`}>{isAligned ? 'Точно!' : `${absDiff}° ${turnDirection}`}</p>
              <p className="text-[10px] text-slate-500">{isAligned ? 'вы на Кибле' : 'повернитесь'}</p>
            </div>
          </div>

          {permissionNeeded && (
            <button type="button" onClick={requestPermission} className="mt-3 w-full rounded-xl bg-amber-500 px-4 py-2.5 text-xs font-bold text-white hover:bg-amber-600">
              Разрешить доступ к компасу (iOS)
            </button>
          )}

          {!hasCompassSupport && !permissionNeeded && (
            <p className="mt-3 rounded-xl bg-slate-100 p-2 text-center text-[11px] text-slate-500 dark:bg-zinc-800 dark:text-zinc-400">
              На этом устройстве нет датчика компаса. Показываем статичное направление Киблы для {userCoords ? 'вашего местоположения' : 'Самашек'}: {qiblaAngle.toFixed(1)}° от севера (юго-запад).
            </p>
          )}
        </div>

        <button type="button" onClick={onClose} className="w-full rounded-2xl bg-emerald-600 py-3 text-xs font-bold text-white hover:bg-emerald-700">
          {language === 'ce' ? 'Къовла' : 'Понятно'}
        </button>
      </div>
    </div>,
    document.body
  );
}
