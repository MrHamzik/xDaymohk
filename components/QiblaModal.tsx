'use client';

import { createPortal } from 'react-dom';
import { useEffect, useRef, useState, useCallback } from 'react';
import { Compass, X } from 'lucide-react';
import { calculateQiblaAzimuth, DEFAULT_LAT, DEFAULT_LNG } from '@/lib/islamic';
import { useI18n } from '@/lib/i18n';
import { useLockBody } from '@/lib/hooks/useLockBody';

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
  // Буквы сторон света вращаются вместе с циферблатом, но каждая
  // доворачивается обратно на +heading — как на компасе iOS: «Ю»
  // остаётся читаемой, а не переворачивается вверх ногами.
  const lettersRef = useRef<SVGGElement | null>(null);
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

  useLockBody(isOpen);

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
  //   * DIAL (the ring with N/S/E/W + tick marks) rotates by
  //     -heading so that N always points to the local North
  //     direction the sensor reports.
  //   * NEEDLE (the flat teal triangle) is STATIC at qiblaAngle
  //     relative to the dial. Because the dial moves underneath
  //     it, the needle visually swings to the correct Kaaba
  //     direction on the screen.
  // Without a working sensor, heading === 0, the dial doesn't
  // rotate, and the needle stays at qiblaAngle (pointing to the
  // Kaaba from the static N).
  useEffect(() => {
    if (!isOpen) return;
    let raf = 0;
    const tick = () => {
      const dial = dialRef.current;
      const needle = needleRef.current;
      if (dial) dial.style.transform = `rotate(${-heading}deg)`;
      // Контрвращение подписей: сам циферблат повернулся на -heading,
      // каждая буква возвращается на +heading вокруг своего центра.
      if (lettersRef.current) {
        for (const node of Array.from(lettersRef.current.children)) {
          const cx = node.getAttribute('data-cx');
          const cy = node.getAttribute('data-cy');
          if (cx && cy) {
            (node as SVGElement).setAttribute(
              'transform', `rotate(${heading} ${cx} ${cy})`,
            );
          }
        }
      }
      // Needle rotates by (qiblaAngle - heading) so it visually
      // swings to where the Kaaba is from the user's current
      // perspective. When the needle points straight up, the
      // user is facing the Qibla.
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
        const aligned = absDiff < 1;
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
      <div className="smk-sheet w-full max-w-md overflow-hidden rounded-3xl p-6 shadow-2xl">
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
                {userCoords ? `${userCoords.lat.toFixed(4)}, ${userCoords.lng.toFixed(4)}` : 'Даймохк / Чеченская Республика'} · {qiblaAngle.toFixed(1)}°
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Закрыть" className="smk-hit flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-zinc-800 dark:text-zinc-400">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="my-5 flex flex-col items-center justify-center">
          {/* Корпус: цвета из палитры темы вместо литералов #0b2c41 /
              #2c4b61, которые ломались на светлых и цветных темах.
              Латунное кольцо — двойная обводка золотом акцента плюс
              мягкое свечение, отсюда «аристократический» вид. */}
          <div
            className="smk-qibla relative flex h-[273.6px] w-[273.6px] items-center justify-center rounded-full"
          >
            {/* ROTATING dial — the ring with N/S/E/W and tick marks.
                The whole ring rotates by -heading so N always points
                to local North. The N/S/E/W letters are CHILDREN of
                the dial and rotate with it — that's how a real
                compass face works (S is at the bottom and reads
                upside-down when the phone is held upright). */}
            <div
              ref={dialRef}
              className="absolute inset-0"
              style={{ willChange: 'transform' }}
            >
              {/* SVG face: guide circles + 60 ticks, masked so the lines
                  never cross the cardinal letters. The letters themselves
                  are drawn in a separate (unmasked) group and centered
                  exactly on the N/S/E/W tick axes. */}
              <svg viewBox="0 0 273.6 273.6" className="absolute inset-0 h-full w-full" aria-hidden="true">
                <defs>
                  <mask id="qibla-letter-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="273.6" height="273.6">
                    <rect x="0" y="0" width="273.6" height="273.6" fill="white" />
                    <rect x="116.8" y="0" width="40" height="40" rx="6" fill="black" />
                    <rect x="116.8" y="233.6" width="40" height="40" rx="6" fill="black" />
                    <rect x="0" y="116.8" width="40" height="40" rx="6" fill="black" />
                    <rect x="233.6" y="116.8" width="40" height="40" rx="6" fill="black" />
                  </mask>
                </defs>
                <g mask="url(#qibla-letter-mask)">
                  {/* Направляющие круги и орнаментальное золотое кольцо. */}
                  <circle cx="136.8" cy="136.8" r="124.8" fill="none" strokeWidth="1" style={{ stroke: 'var(--smk-divider)' }} />
                  <circle cx="136.8" cy="136.8" r="112.8" fill="none" strokeWidth="1" style={{ stroke: 'var(--smk-divider)', opacity: 0.6 }} />
                  <circle
                    cx="136.8" cy="136.8" r="103" fill="none" strokeWidth="1"
                    strokeDasharray="2 7" strokeLinecap="round"
                    style={{ stroke: 'var(--smk-gold)', opacity: 0.55 }}
                  />
                  {Array.from({ length: 60 }).map((_, i) => {
                    const a = (i * 6 * Math.PI) / 180;
                    const major = i % 15 === 0;
                    const medium = i % 5 === 0;
                    const len = major ? 12 : medium ? 8 : 6;
                    const rOuter = 132;
                    const x1 = 136.8 + rOuter * Math.sin(a);
                    const y1 = 136.8 - rOuter * Math.cos(a);
                    const x2 = 136.8 + (rOuter - len) * Math.sin(a);
                    const y2 = 136.8 - (rOuter - len) * Math.cos(a);
                    return (
                      <line
                        key={i}
                        x1={x1.toFixed(2)}
                        y1={y1.toFixed(2)}
                        x2={x2.toFixed(2)}
                        y2={y2.toFixed(2)}
                        strokeWidth={major ? 1.5 : 1}
                        style={{
                          stroke: major ? 'var(--foreground)' : 'var(--smk-muted)',
                          opacity: major ? 0.9 : medium ? 0.6 : 0.35,
                        }}
                      />
                    );
                  })}
                </g>
                {/* Подписи сторон света. Каждая доворачивается обратно
                    на +heading (см. tick выше), поэтому читается прямо
                    при любом повороте телефона — как на компасе iOS.
                    Цвета из палитры темы, а не литералами Tailwind. */}
                <g ref={lettersRef}>
                  <text
                    x="136.8" y="21" data-cx="136.8" data-cy="21"
                    textAnchor="middle" dominantBaseline="central"
                    fontSize="19" fontWeight="900"
                    style={{ fill: 'rgb(var(--smk-danger-rgb))' }}
                  >
                    С
                  </text>
                  <text
                    x="136.8" y="252.6" data-cx="136.8" data-cy="252.6"
                    textAnchor="middle" dominantBaseline="central"
                    fontSize="19" fontWeight="900"
                    style={{ fill: 'var(--foreground)' }}
                  >
                    Ю
                  </text>
                  <text
                    x="21" y="136.8" data-cx="21" data-cy="136.8"
                    textAnchor="middle" dominantBaseline="central"
                    fontSize="19" fontWeight="900"
                    style={{ fill: 'var(--foreground)' }}
                  >
                    З
                  </text>
                  <text
                    x="252.6" y="136.8" data-cx="252.6" data-cy="136.8"
                    textAnchor="middle" dominantBaseline="central"
                    fontSize="19" fontWeight="900"
                    style={{ fill: 'var(--foreground)' }}
                  >
                    В
                  </text>
                </g>
              </svg>
            </div>

            {/* STATIC needle — stays at qiblaAngle relative to the
                rotating dial, so it ALWAYS points to the Kaaba from
                the user's current perspective. Minimalist flat
                triangle, no gradients, no gloss, no Kaaba icon. */}
            <div
              ref={needleRef}
              className="absolute inset-0 pointer-events-none"
              style={{ willChange: 'transform', transform: `rotate(${qiblaAngle}deg)` }}
            >
              <svg
                viewBox="0 0 64 64"
                className="absolute left-1/2 top-1/2 h-[171.6px] w-[171.6px] -translate-x-1/2 -translate-y-1/2"
                aria-hidden="true"
              >
                {/* Стрелка: остриё главным цветом темы, хвост — тенью
                    того же тона, чтобы читался объём. */}
                <path d="M 32 6 L 28.5 40 L 35.5 40 Z" style={{ fill: 'var(--color-emerald-600)' }} />
                <path d="M 32 6 L 32 40 L 35.5 40 Z" style={{ fill: 'var(--color-emerald-700)', opacity: 0.55 }} />
              </svg>
            </div>

            {/* Center pivot — tiny static axis dot */}
            {/* Ось: золотая точка в тон латунному кольцу. */}
            <div
              className="absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full"
              style={{
                background: 'var(--smk-gold)',
                boxShadow: '0 0 0 2px var(--smk-card-a), 0 0 8px -1px var(--smk-gold)',
              }}
            />
          </div>

          <div className="mt-6 grid w-full grid-cols-3 gap-2 text-center">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-2.5 shadow-[0_2px_10px_-2px_rgba(15,45,60,0.1)] dark:border-zinc-700/60 dark:bg-zinc-900 dark:shadow-[0_2px_10px_-2px_rgba(0,0,0,0.5)]">
              <p className="smk-text-label font-bold uppercase tracking-wider text-slate-400">Кибла</p>
              <p className="smk-text-title font-black text-[#0d7379] dark:text-[#2ba6ad]">{qiblaAngle.toFixed(1)}°</p>
              <p className="smk-text-label text-slate-500">от севера</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-2.5 shadow-[0_2px_10px_-2px_rgba(15,45,60,0.1)] dark:border-zinc-700/60 dark:bg-zinc-900 dark:shadow-[0_2px_10px_-2px_rgba(0,0,0,0.5)]">
              <p className="smk-text-label font-bold uppercase tracking-wider text-slate-400">Вы</p>
              <p
                ref={headingLabelRef}
                className="smk-text-label font-black text-slate-900 dark:text-white"
              >
                —
              </p>
              <p className="smk-text-label text-slate-500">
                {mode === 'ready' ? 'компас' : mode === 'needs-calibration' ? 'калибровка' : mode === 'no-permission' ? 'нужно разрешение' : 'нет датчика'}
              </p>
            </div>
            <div
              className={`rounded-xl border p-2.5 shadow-[0_2px_10px_-2px_rgba(15,45,60,0.1)] dark:shadow-[0_2px_10px_-2px_rgba(0,0,0,0.5)] ${
                mode === 'ready'
                  ? 'border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/20'
                  : 'border-slate-200 bg-slate-50 dark:border-zinc-700/60 dark:bg-zinc-900'
              }`}
            >
              <p className="smk-text-label font-bold uppercase tracking-wider text-slate-400">Поворот</p>
              <p
                ref={turnLabelRef}
                className={`smk-text-label font-black ${
                  mode === 'ready'
                    ? 'text-amber-700 dark:text-amber-300'
                    : 'text-slate-500 dark:text-zinc-500'
                }`}
              >
                —
              </p>
              <p className="smk-text-label text-slate-500">
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
              className="mt-3 w-full rounded-xl bg-slate-100 px-4 py-2 smk-text-label font-bold text-slate-600 hover:bg-slate-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
            >
              {language === 'ce' ? 'Цакалибровкха' : 'Перекалибровать'}
            </button>
          )}

          {mode === 'no-support' && (
            <p className="mt-3 rounded-xl border border-slate-200 bg-slate-100 p-2 text-center smk-text-label text-slate-500 shadow-[0_2px_10px_-2px_rgba(15,45,60,0.1)] dark:border-zinc-700/60 dark:bg-zinc-800 dark:text-zinc-400 dark:shadow-[0_2px_10px_-2px_rgba(0,0,0,0.5)]">
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
