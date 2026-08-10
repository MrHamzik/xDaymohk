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

type CompassMode = 'idle' | 'no-support' | 'no-permission' | 'ready';

export default function QiblaModal({ isOpen, onClose }: QiblaModalProps) {
  const { language } = useI18n();
  const needleRef = useRef<HTMLDivElement | null>(null);
  const centerDotRef = useRef<HTMLDivElement | null>(null);
  const headingLabelRef = useRef<HTMLDivElement | null>(null);
  const turnLabelRef = useRef<HTMLDivElement | null>(null);

  const [qiblaAngle, setQiblaAngle] = useState<number>(DEFAULT_QIBLA_AZIMUTH);
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [mode, setMode] = useState<CompassMode>('idle');
  const [heading, setHeading] = useState<number>(0);
  const [permissionNeeded, setPermissionNeeded] = useState(false);

  // Lock body scroll while open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = ''; };
    }
  }, [isOpen]);

  // Fetch geolocation for accurate Qibla angle
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

  // Normalize any device heading to a 0..360 number, with 0 = North.
  // iOS: e.webkitCompassHeading already in 0..360.
  // Android: e.alpha (0..360) where 0 = North, but reported relative to
  // the device's current orientation. Modern Chrome also dispatches
  // 'deviceorientationabsolute' with e.absolute === true; that alpha is
  // the true compass heading.
  const extractHeading = useCallback((e: DeviceOrientationEvent): number | null => {
    const anyEvent = e as DeviceOrientationEvent & { webkitCompassHeading?: number };
    if (typeof anyEvent.webkitCompassHeading === 'number' && !Number.isNaN(anyEvent.webkitCompassHeading)) {
      return anyEvent.webkitCompassHeading;
    }
    if (typeof e.alpha === 'number' && !Number.isNaN(e.alpha)) {
      // alpha = 0..360 where 0 means "pointing North" on Android when
      // absolute is true. When absolute is false we flip it.
      return e.absolute ? e.alpha : 360 - e.alpha;
    }
    return null;
  }, []);

  // Subscribe to device orientation; on iOS we need a user gesture
  // to grant the permission, so the first invocation of requestPermission
  // is triggered by the "Разрешить" button rather than on mount.
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

    // Subscribe to BOTH events: absolute (when supported) and
    // relative. The first event to fire with a real alpha wins.
    window.addEventListener('deviceorientationabsolute', handle, true);
    window.addEventListener('deviceorientation', handle, true);
    // Some browsers only fire on orientation change
    window.addEventListener('orientationchange', () => {
      // re-request a sample; some devices need a nudge
      window.dispatchEvent(new Event('deviceorientation'));
    }, true);

    // Defer the initial reading to give the sensor time to settle
    const id = window.setTimeout(() => setMode((m) => (m === 'ready' ? m : 'no-support')), 3000);

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
        // Subscribe now
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

  // Apply heading directly to the DOM via rAF for 60fps updates.
  // This bypasses React re-render overhead and keeps the needle
  // buttery-smooth on slow devices.
  //
  // Compass layout:
  //   * The outer dial with N/S/E/W stays STATIC — North is always
  //     at the top of the screen, just like a real compass face.
  //   * The needle rotates by (qiblaAngle - heading) so that it
  //     ALWAYS points to the Qibla from the user's current
  //     perspective. When the user faces North, the needle points
  //     at qiblaAngle from N. When they turn East, the needle
  //     swings left by 90° because Qibla is now 90° to their right
  //     (which is the top of the screen if North just rotated off).
  useEffect(() => {
    if (!isOpen || mode !== 'ready') return;
    let raf = 0;
    const tick = () => {
      const needle = needleRef.current;
      // Needle angle: how far from "up on the screen" the Qibla
      // direction is, given the current phone heading.
      const needleAngle = (qiblaAngle - heading + 360) % 360;
      if (needle) needle.style.transform = `rotate(${needleAngle}deg)`;
      if (headingLabelRef.current) headingLabelRef.current.textContent = `${Math.round(heading)}°`;
      if (centerDotRef.current) {
        // Highlight when aligned (within 8 degrees)
        const diff = ((qiblaAngle - heading + 540) % 360) - 180;
        const aligned = Math.abs(diff) < 8;
        centerDotRef.current.className = `absolute h-4 w-4 rounded-full shadow-md border-2 border-white dark:border-zinc-900 ${
          aligned ? 'bg-emerald-500' : 'bg-slate-800 dark:bg-white'
        }`;
      }
      if (turnLabelRef.current) {
        const diff = ((qiblaAngle - heading + 540) % 360) - 180;
        const absDiff = Math.abs(Math.round(diff));
        const turn = diff > 0
          ? (language === 'ce' ? 'аьттухьа' : 'вправо')
          : (language === 'ce' ? 'аьррухьа' : 'влево');
        const aligned = absDiff < 8;
        turnLabelRef.current.textContent = aligned
          ? (language === 'ce' ? 'ТОЧНО!' : 'Точно!')
          : `${absDiff}° ${turn}`;
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
            {/* STATIC compass background with cardinal points. North is
                always at the top of the screen, just like a real compass
                face. The needle rotates on top of this. */}
            <div className="absolute inset-0">
              <span className="absolute left-1/2 top-1 -translate-x-1/2 text-[12px] font-black text-red-600">N</span>
              <span className="absolute bottom-1 left-1/2 -translate-x-1/2 text-[11px] font-bold text-slate-400">S</span>
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] font-bold text-slate-400">E</span>
              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[11px] font-bold text-slate-400">W</span>
              <div className="absolute inset-2 rounded-full border border-dashed border-slate-200 dark:border-zinc-700" />
              {/* Ticks every 30° for visual reference (static) */}
              {Array.from({ length: 12 }).map((_, i) => (
                <div
                  key={i}
                  className="absolute left-1/2 top-0 h-2 w-0.5 -translate-x-1/2 bg-slate-300 dark:bg-zinc-700"
                  style={{ transform: `rotate(${i * 30}deg)`, transformOrigin: '50% 144px' }}
                />
              ))}
            </div>

            {/* ROTATING needle. The rAF tick below sets
                `transform: rotate(<qiblaAngle - heading>deg)` on this
                element on every frame, so the needle visibly rotates
                when the user turns the phone and ALWAYS points to
                the Qibla from the user's current perspective. */}
            <div
              ref={needleRef}
              className="absolute inset-0 pointer-events-none"
              style={{ willChange: 'transform', transform: `rotate(${qiblaAngle}deg)` }}
            >
              {/* Tail (opposite side, dimmer) */}
              <div className="absolute left-1/2 top-1/2 h-24 w-2 -translate-x-1/2 translate-y-2 rounded-full bg-slate-300/70 dark:bg-zinc-600/70" />
              {/* Head — long bright pointer to Qibla */}
              <div className="absolute left-1/2 top-1/2 h-28 w-3 -translate-x-1/2 -translate-y-28 rounded-full bg-emerald-500 shadow-lg shadow-emerald-500/40" />
              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-32 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-600 text-white shadow-lg ring-4 ring-emerald-500/30">
                <Navigation className="h-6 w-6" fill="currentColor" />
              </div>
            </div>

            {/* Center dot — colour updates via rAF tick */}
            <div
              ref={centerDotRef}
              className="absolute h-4 w-4 rounded-full shadow-md border-2 border-white dark:border-zinc-900 bg-slate-800 dark:bg-white"
            />
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
                {mode === 'ready' ? '0°' : '—'}
              </p>
              <p className="text-[10px] text-slate-500">
                {mode === 'ready' ? 'компас' : mode === 'no-permission' ? 'нужно разрешение' : 'нет датчика'}
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

          {mode === 'no-support' && (
            <p className="mt-3 rounded-xl bg-slate-100 p-2 text-center text-[11px] text-slate-500 dark:bg-zinc-800 dark:text-zinc-400">
              На этом устройстве нет датчика компаса. Показываем статичное направление Киблы для {userCoords ? 'вашего местоположения' : 'Самашек'}: {qiblaAngle.toFixed(1)}° от севера (юго-запад).
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
