'use client';

import { createPortal } from 'react-dom';
import { useEffect, useRef, useState, useCallback } from 'react';
import { Compass, Navigation, X } from 'lucide-react';
import { calculateQiblaAzimuth, DEFAULT_LAT, DEFAULT_LNG } from '@/lib/islamic';
import { useI18n } from '@/lib/i18n';

const DEFAULT_QIBLA_AZIMUTH = calculateQiblaAzimuth(DEFAULT_LAT, DEFAULT_LNG);

interface QiblaModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type CompassMode = 'idle' | 'no-support' | 'no-permission' | 'needs-calibration' | 'ready';

export default function QiblaModal({ isOpen, onClose }: QiblaModalProps) {
  const { language } = useI18n();
  const dialRef = useRef<HTMLDivElement | null>(null);
  const needleRef = useRef<HTMLDivElement | null>(null);
  const headingLabelRef = useRef<HTMLDivElement | null>(null);
  const turnLabelRef = useRef<HTMLDivElement | null>(null);

  const [qiblaAngle, setQiblaAngle] = useState<number>(DEFAULT_QIBLA_AZIMUTH);
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [mode, setMode] = useState<CompassMode>('idle');
  const [heading, setHeading] = useState<number>(0);
  const [permissionNeeded, setPermissionNeeded] = useState(false);
  // On devices where e.absolute is true but e.alpha is the
  // device's z-axis rotation rather than a true compass heading,
  // the user must mark the current e.alpha as "this is local
  // North" so future readings can be turned into a real heading.
  const [calibration, setCalibration] = useState<number | null>(null);
  const calibrationRef = useRef<number | null>(null);
  const lastAlphaRef = useRef<number | null>(null);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = ''; };
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    if (!navigator.geolocation) {
      setQiblaAngle(DEFAULT_QIBLA_AZIMUTH);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setQiblaAngle(calculateQiblaAzimuth(pos.coords.latitude, pos.coords.longitude));
      },
      () => setQiblaAngle(DEFAULT_QIBLA_AZIMUTH),
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }, [isOpen]);

  // Convert a DeviceOrientationEvent into a 0..360 compass heading
  // where 0 = North, 90 = East, 180 = South, 270 = West.
  //   * iOS: e.webkitCompassHeading is already a true compass heading.
  //   * Android w/ e.absolute === true: e.alpha is technically a
  //     compass heading, but on many devices it's actually a
  //     rotation around the z-axis. We only trust it after the
  //     user calibrates (marks the current e.alpha as 0).
  //   * Everything else: return null and park the dial.
  const extractHeading = useCallback((e: DeviceOrientationEvent): number | null => {
    const anyEvent = e as DeviceOrientationEvent & { webkitCompassHeading?: number };
    if (typeof anyEvent.webkitCompassHeading === 'number' && !Number.isNaN(anyEvent.webkitCompassHeading)) {
      return anyEvent.webkitCompassHeading;
    }
    if (typeof e.alpha === 'number' && !Number.isNaN(e.alpha)) {
      lastAlphaRef.current = e.alpha;
      const cal = calibrationRef.current;
      if (cal === null) return null;
      return ((e.alpha - cal) % 360 + 360) % 360;
    }
    return null;
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    const anyWindow = window as unknown as {
      DeviceOrientationEvent?: { requestPermission?: () => Promise<'granted' | 'denied'> };
    };
    if (anyWindow.DeviceOrientationEvent?.requestPermission) {
      setPermissionNeeded(true);
      setMode('no-permission');
      return;
    }

    if (typeof window.DeviceOrientationEvent === 'undefined') {
      setMode('no-support');
      return;
    }

    const handle = (e: DeviceOrientationEvent) => {
      const h = extractHeading(e);
      if (h === null) return;
      setMode('ready');
      setHeading(h);
    };

    window.addEventListener('deviceorientationabsolute', handle, true);
    window.addEventListener('deviceorientation', handle, true);
    window.addEventListener('orientationchange', () => {
      window.dispatchEvent(new Event('deviceorientation'));
    }, true);

    const id = window.setTimeout(() => {
      setMode((m) => {
        if (m === 'ready') return m;
        if (lastAlphaRef.current !== null) return 'needs-calibration';
        return 'no-support';
      });
    }, 3000);

    return () => {
      window.clearTimeout(id);
      window.removeEventListener('deviceorientationabsolute', handle, true);
      window.removeEventListener('deviceorientation', handle, true);
    };
  }, [isOpen, extractHeading]);

  const requestPermission = useCallback(async () => {
    const anyWindow = window as unknown as {
      DeviceOrientationEvent?: { requestPermission?: () => Promise<'granted' | 'denied'> };
    };
    if (!anyWindow.DeviceOrientationEvent?.requestPermission) return;
    try {
      const response = await anyWindow.DeviceOrientationEvent.requestPermission();
      if (response === 'granted') {
        setPermissionNeeded(false);
        setMode('ready');
        const handle = (e: DeviceOrientationEvent) => {
          const h = extractHeading(e);
          if (h === null) return;
          setHeading(h);
        };
        window.addEventListener('deviceorientationabsolute', handle, true);
        window.addEventListener('deviceorientation', handle, true);
      } else {
        setMode('no-permission');
      }
    } catch {
      setMode('no-permission');
    }
  }, [extractHeading]);

  const handleCalibrate = useCallback(() => {
    if (lastAlphaRef.current !== null) {
      calibrationRef.current = lastAlphaRef.current;
      setCalibration(lastAlphaRef.current);
      setMode('ready');
    } else {
      const handler = (e: DeviceOrientationEvent) => {
        if (typeof e.alpha === 'number' && !Number.isNaN(e.alpha)) {
          calibrationRef.current = e.alpha;
          setCalibration(e.alpha);
          setMode('ready');
          window.removeEventListener('deviceorientation', handler, true);
          window.removeEventListener('deviceorientationabsolute', handler, true);
        }
      };
      window.addEventListener('deviceorientation', handler, true);
      window.addEventListener('deviceorientationabsolute', handler, true);
    }
  }, []);

  // Apply heading to the DOM via rAF. Layout:
  //   * DIAL (the ring with N/S/E/W + tick marks) is STATIC. North
  //     stays at the top of the screen.
  //   * NEEDLE (the green Navigation icon) rotates by
  //     (qiblaAngle - heading) every frame, so the user can see
  //     how far they are from facing the Kaaba and which way to
  //     turn. When the needle points straight up, the user is
  //     facing the Qibla.
  useEffect(() => {
    if (!isOpen) return;
    let raf = 0;
    const tick = () => {
      const needle = needleRef.current;
      const needleAngle = (qiblaAngle - heading + 360) % 360;
      if (needle) needle.style.transform = `rotate(${needleAngle}deg)`;

      if (headingLabelRef.current) {
        headingLabelRef.current.textContent = mode === 'ready' ? `${Math.round(heading)}°` : '—';
      }
      if (turnLabelRef.current) {
        const diff = ((qiblaAngle - heading + 540) % 360) - 180;
        const absDiff = Math.abs(Math.round(diff));
        const turn = diff > 0
          ? (language === 'ce' ? 'аьттухьа' : 'вправо')
          : (language === 'ce' ? 'аьррухьа' : 'влево');
        const aligned = absDiff < 8;
        if (mode === 'ready') {
          turnLabelRef.current.textContent = aligned
            ? (language === 'ce' ? 'ТОЧНО!' : 'Точно!')
            : `${absDiff}° ${turn}`;
        } else {
          turnLabelRef.current.textContent = '—';
        }
      }
      raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, [isOpen, mode, heading, qiblaAngle, language]);

  if (!isOpen) return null;
  if (typeof document === 'undefined') return null;

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
                {language === 'ce' ? 'Къилба' : 'Кибла'}
              </h2>
              <p className="text-xs text-slate-500 dark:text-zinc-500">
                {userCoords ? `${userCoords.lat.toFixed(4)}, ${userCoords.lng.toFixed(4)}` : 'Самашки / Даймохк'} · {qiblaAngle.toFixed(1)}°
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Закрыть" className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-zinc-800 dark:text-zinc-400">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="my-5 flex flex-col items-center justify-center">
          <div className="relative flex h-72 w-72 items-center justify-center rounded-full border-[6px] border-slate-100 bg-white shadow-inner dark:border-zinc-800 dark:bg-zinc-900">
            {/* ROTATING dial — the ring with N/S/E/W and tick marks.
                rAF rotates it by -heading so N always points to the
                local North that the compass sensor reports. */}
            <div
              ref={dialRef}
              className="absolute inset-0"
              style={{ willChange: 'transform' }}
            >
              <span className="absolute left-1/2 top-1 -translate-x-1/2 text-[12px] font-black text-red-600">N</span>
              <span className="absolute bottom-1 left-1/2 -translate-x-1/2 text-[11px] font-bold text-slate-400">S</span>
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] font-bold text-slate-400">E</span>
              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[11px] font-bold text-slate-400">W</span>
              <div className="absolute inset-2 rounded-full border border-dashed border-slate-200 dark:border-zinc-700" />
              {Array.from({ length: 12 }).map((_, i) => (
                <div
                  key={i}
                  className="absolute left-1/2 top-0 h-2 w-0.5 -translate-x-1/2 bg-slate-300 dark:bg-zinc-700"
                  style={{ transform: `rotate(${i * 30}deg)`, transformOrigin: '50% 144px' }}
                />
              ))}
            </div>

            {/* STATIC needle — stays at qiblaAngle relative to the
                rotating dial, so it ALWAYS points to the Kaaba from
                the user's current perspective. The arrow tip is
                aimed "up" (toward the top of the dial) at angle
                qiblaAngle; because the dial is rotated to North,
                the arrow tip therefore points to North + qiblaAngle,
                which is the actual Kaaba bearing. */}
            <div
              ref={needleRef}
              className="absolute inset-0 pointer-events-none"
              style={{ willChange: 'transform', transform: `rotate(${qiblaAngle}deg)` }}
            >
              <div className="absolute left-1/2 top-1/2 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-emerald-600 text-white shadow-lg ring-4 ring-emerald-500/30">
                <Navigation className="h-9 w-9" fill="currentColor" />
              </div>
            </div>
          </div>

          <div className="mt-4 grid w-full grid-cols-3 gap-2 text-center">
            <div className="rounded-xl bg-slate-50 p-2.5 dark:bg-zinc-900 border border-slate-100 dark:border-zinc-800">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Кибла</p>
              <p className="text-sm font-black text-slate-900 dark:text-white">{qiblaAngle.toFixed(1)}°</p>
              <p className="text-[10px] text-slate-500">от севера</p>
            </div>
            <div className="rounded-xl bg-slate-50 p-2.5 dark:bg-zinc-900 border border-slate-100 dark:border-zinc-800">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Вы</p>
              <p
                ref={headingLabelRef}
                className="text-sm font-black text-slate-900 dark:text-white"
              >
                —
              </p>
              <p className="text-[10px] text-slate-500">
                {mode === 'ready' ? 'компас' : mode === 'needs-calibration' ? 'калибровка' : mode === 'no-permission' ? 'нужно разрешение' : 'нет датчика'}
              </p>
            </div>
            <div
              className={`rounded-xl p-2.5 border ${
                mode === 'ready'
                  ? 'bg-amber-50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-900'
                  : 'bg-slate-50 border-slate-100 dark:bg-zinc-900 dark:border-zinc-800'
              }`}
            >
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Поворот</p>
              <p
                ref={turnLabelRef}
                className={`text-sm font-black ${
                  mode === 'ready'
                    ? 'text-amber-700 dark:text-amber-300'
                    : 'text-slate-500 dark:text-zinc-500'
                }`}
              >
                —
              </p>
              <p className="text-[10px] text-slate-500">
                {mode === 'ready' ? 'повернитесь' : '—'}
              </p>
            </div>
          </div>

          {permissionNeeded && (
            <button
              type="button"
              onClick={requestPermission}
              className="mt-3 w-full rounded-xl bg-amber-500 px-4 py-2.5 text-xs font-bold text-white hover:bg-amber-600"
            >
              Разрешить доступ к компасу (iOS)
            </button>
          )}

          {mode === 'needs-calibration' && (
            <button
              type="button"
              onClick={handleCalibrate}
              className="mt-3 w-full rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-emerald-700"
            >
              {language === 'ce' ? 'Калибровкха — хьан кIоштта Норд тIехула' : 'Откалибровать — направьте телефон на север'}
            </button>
          )}

          {calibration !== null && mode === 'ready' && (
            <button
              type="button"
              onClick={handleCalibrate}
              className="mt-3 w-full rounded-xl bg-slate-100 px-4 py-2 text-[11px] font-bold text-slate-600 hover:bg-slate-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
            >
              {language === 'ce' ? 'Цакалибровкха' : 'Перекалибровать'}
            </button>
          )}

          {mode === 'no-support' && (
            <p className="mt-3 rounded-xl bg-slate-100 p-2 text-center text-[11px] text-slate-500 dark:bg-zinc-800 dark:text-zinc-400">
              На этом устройстве нет датчика компаса. Стрелка показывает статичное направление на Каабу: {qiblaAngle.toFixed(1)}° от севера.
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={onClose}
          className="w-full rounded-2xl bg-emerald-600 py-3 text-xs font-bold text-white hover:bg-emerald-700"
        >
          {language === 'ce' ? 'Къовла' : 'Понятно'}
        </button>
      </div>
    </div>,
    document.body,
  );
}
