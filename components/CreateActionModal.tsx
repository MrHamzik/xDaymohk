'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bot, Briefcase, CarFront, Compass, Globe2, HandHeart, UserPlus, X } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import QiblaModal from '@/components/QiblaModal';

interface CreateActionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenCreateProfile: () => void;
  onOpenTaxi?: () => void;
  onOpenGullaq?: () => void;
  onOpenGo?: () => void;
  onOpenDjanna?: () => void;
}

export default function CreateActionModal({
  isOpen,
  onClose,
  onOpenCreateProfile,
  onOpenTaxi,
  onOpenGullaq,
  onOpenGo,
  onOpenDjanna,
}: CreateActionModalProps) {
  const { t } = useI18n();
  const router = useRouter();
  const [isQiblaOpen, setIsQiblaOpen] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      const raf = requestAnimationFrame(() => setIsMounted(true));
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') onClose();
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => {
        document.body.style.overflow = '';
        cancelAnimationFrame(raf);
        window.removeEventListener('keydown', handleKeyDown);
      };
    } else {
      setIsMounted(false);
    }
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const radius = 110; // Exact radius in pixels

  // 6 actions positioned directly around the center X button in a circle
  const ringActions = [
    {
      id: 'profile',
      label: 'Анкета',
      icon: UserPlus,
      angleDeg: -90, // Top (12 o'clock)
      bg: 'bg-emerald-600 text-white shadow-xl shadow-emerald-600/40 hover:bg-emerald-700',
      action: () => {
        onClose();
        onOpenCreateProfile();
      },
    },
    {
      id: 'taxi',
      label: t.taxiTitle,
      icon: CarFront,
      angleDeg: -30, // Top-Right (2 o'clock)
      bg: 'bg-amber-500 text-white shadow-xl shadow-amber-500/40 hover:bg-amber-600',
      action: () => {
        onClose();
        onOpenTaxi?.();
      },
    },
    {
      id: 'vpn',
      label: t.vpnTitle,
      icon: Globe2,
      angleDeg: 30, // Bottom-Right (4 o'clock)
      bg: 'bg-teal-600 text-white shadow-xl shadow-teal-600/40 hover:bg-teal-700',
      action: () => {
        onClose();
      },
    },
    {
      id: 'gullaq',
      label: t.gullaqTitle,
      icon: Briefcase,
      angleDeg: 90, // Bottom (6 o'clock)
      bg: 'bg-emerald-700 text-white shadow-xl shadow-emerald-700/40 hover:bg-emerald-800',
      action: () => {
        onClose();
        // Раздел реализован — ведём на него; колбэк оставлен для
        // мест, где модалка используется со своим обработчиком.
        if (onOpenGullaq) onOpenGullaq(); else router.push('/vayghullakh');
      },
    },
    {
      id: 'go',
      label: t.goTitle,
      icon: HandHeart,
      angleDeg: 150, // Bottom-Left (8 o'clock)
      bg: 'bg-rose-500 text-white shadow-xl shadow-rose-500/40 hover:bg-rose-600',
      action: () => {
        onClose();
        if (onOpenGo) onOpenGo(); else router.push('/vaygo');
      },
    },
    {
      id: 'djanna',
      label: t.djannaTitle,
      icon: Bot,
      angleDeg: 210, // Top-Left (10 o'clock)
      bg: 'bg-indigo-600 text-white shadow-xl shadow-indigo-600/40 hover:bg-indigo-700',
      action: () => {
        onClose();
        onOpenDjanna?.();
      },
    },
  ];

  return (
    <>
      <div
        className={`fixed inset-0 z-[90] flex items-center justify-center bg-zinc-950/80 backdrop-blur-md transition-opacity duration-300 ${
          isMounted ? 'opacity-100' : 'opacity-0'
        }`}
        role="dialog"
        aria-modal="true"
        aria-label="Быстрый выбор услуги"
        onClick={onClose}
      >
        {/* Single Center Anchor Container: all circular items are strictly relative to this center */}
        <div
          className="relative flex h-16 w-16 items-center justify-center"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Outer circular action buttons positioned relative to center */}
          {ringActions.map((item, idx) => {
            const rad = (item.angleDeg * Math.PI) / 180;
            const x = Math.round(radius * Math.cos(rad));
            const y = Math.round(radius * Math.sin(rad));
            const Icon = item.icon;

            return (
              <div
                key={item.id}
                className="absolute flex flex-col items-center justify-center pointer-events-auto"
                style={{
                  transform: isMounted
                    ? `translate(${x}px, ${y}px) scale(1)`
                    : `translate(0px, 0px) scale(0)`,
                  transition: `transform 0.35s cubic-bezier(0.16, 1, 0.3, 1) ${idx * 35}ms, opacity 0.35s ease ${idx * 35}ms`,
                  opacity: isMounted ? 1 : 0,
                  width: '64px',
                  height: '64px',
                  left: '0px',
                  top: '0px',
                }}
              >
                <button
                  type="button"
                  onClick={item.action}
                  aria-label={item.label}
                  title={item.label}
                  className={`flex h-13 w-13 items-center justify-center rounded-full transition-transform duration-200 hover:scale-115 active:scale-90 ${item.bg}`}
                >
                  <Icon className="h-5.5 w-5.5 stroke-[2.2]" />
                </button>
                <span className="mt-1 max-w-[80px] truncate text-center text-[10px] font-extrabold text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)] select-none">
                  {item.label}
                </span>
              </div>
            );
          })}

          {/* Center Rotating Close Cross */}
          <button
            type="button"
            onClick={onClose}
            aria-label={t.close}
            title={t.close}
            className="z-20 flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-white/25 text-white shadow-2xl backdrop-blur-xl border border-white/50 transition-all duration-300 hover:bg-white/35 hover:scale-110 active:scale-95"
          >
            <X className="h-7 w-7 stroke-[2.5]" />
          </button>
        </div>
      </div>

      <QiblaModal isOpen={isQiblaOpen} onClose={() => setIsQiblaOpen(false)} />
    </>
  );
}
