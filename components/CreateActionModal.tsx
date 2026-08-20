'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bot, Briefcase, CarFront, Globe2, HandHeart, UserPlus, X } from 'lucide-react';
import { useI18n } from '@/lib/i18n';

interface CreateActionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenCreateProfile: () => void;
  onOpenTaxi?: () => void;
  onOpenGullaq?: () => void;
  onOpenGo?: () => void;
  onOpenDjanna?: () => void;
}

/**
 * Меню плюса: змейка вверх зигзагом, полный текст, связующая линия.
 *
 * Растёт от живой кнопки «+» (низ экрана), а не кольцом из центра —
 * иначе на телефоне пункты наезжали на контент и обрезали подписи.
 */
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
  const [isMounted, setIsMounted] = useState(false);
  const [anchor, setAnchor] = useState({ x: 0, y: 0, desktop: false });

  useEffect(() => {
    if (!isOpen) {
      setIsMounted(false);
      return;
    }
    document.body.style.overflow = 'hidden';
    const place = () => {
      const desktop = window.innerWidth >= 1024;
      if (desktop) {
        setAnchor({
          x: window.innerWidth - 24 - 28,
          y: window.innerHeight - 24 - 28,
          desktop: true,
        });
      } else {
        setAnchor({
          x: window.innerWidth / 2,
          y: window.innerHeight - 36,
          desktop: false,
        });
      }
    };
    place();
    const raf = requestAnimationFrame(() => setIsMounted(true));
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', place);
    return () => {
      document.body.style.overflow = '';
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', place);
    };
  }, [isOpen, onClose]);

  const actions = useMemo(() => [
    {
      id: 'profile',
      label: t.createProfileOption,
      icon: UserPlus,
      tone: 'bg-emerald-600 text-white',
      run: () => { onClose(); onOpenCreateProfile(); },
    },
    {
      id: 'gullaq',
      label: t.createGullaqOption,
      icon: Briefcase,
      tone: 'bg-emerald-700 text-white',
      run: () => {
        onClose();
        if (onOpenGullaq) onOpenGullaq();
        else router.push('/vayghullakh?create=1');
      },
    },
    {
      id: 'go',
      label: t.createGoOption,
      icon: HandHeart,
      tone: 'bg-rose-500 text-white',
      run: () => {
        onClose();
        if (onOpenGo) onOpenGo();
        else router.push('/vaygo?create=1');
      },
    },
    {
      id: 'taxi',
      label: t.taxiTitle,
      icon: CarFront,
      tone: 'bg-amber-500 text-white',
      run: () => { onClose(); onOpenTaxi?.(); },
    },
    {
      id: 'vpn',
      label: t.vpnTitle,
      icon: Globe2,
      tone: 'bg-teal-600 text-white',
      run: () => { onClose(); },
    },
    {
      id: 'djanna',
      label: t.djannaAssistantOption,
      icon: Bot,
      tone: 'bg-indigo-600 text-white',
      run: () => { onClose(); onOpenDjanna?.(); },
    },
  ], [t, onClose, onOpenCreateProfile, onOpenGullaq, onOpenGo, onOpenTaxi, onOpenDjanna, router]);

  const laid = useMemo(() => {
    const gapY = 62;
    const zig = anchor.desktop ? 18 : 56;
    return actions.map((item, index) => {
      const step = index + 1;
      const side = index % 2 === 0 ? -1 : 1;
      const x = anchor.desktop ? -(48 + index * 10) : side * zig;
      const y = -step * gapY;
      return { ...item, x, y };
    });
  }, [actions, anchor.desktop]);

  if (!isOpen) return null;

  const linePoints = [
    `${anchor.x},${anchor.y}`,
    ...laid.map((item) => `${anchor.x + item.x},${anchor.y + item.y}`),
  ].join(' ');

  return (
    <div
      className={`fixed inset-0 z-[90] bg-zinc-950/75 backdrop-blur-md transition-opacity duration-300 ${
        isMounted ? 'opacity-100' : 'opacity-0'
      }`}
      role="dialog"
      aria-modal="true"
      aria-label={t.quickCreateAria}
      onClick={onClose}
    >
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full"
        aria-hidden
      >
        <polyline
          points={linePoints}
          fill="none"
          stroke="var(--smk-gold)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="5 7"
          style={{
            opacity: isMounted ? 0.85 : 0,
            transition: 'opacity 0.35s ease',
          }}
        />
      </svg>

      {laid.map((item, index) => {
        const Icon = item.icon;
        return (
          <button
            key={item.id}
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              item.run();
            }}
            aria-label={item.label}
            className="absolute z-10 flex max-w-[min(18rem,calc(100vw-1.5rem))] items-center gap-2.5 text-left"
            style={{
              left: anchor.x + item.x,
              top: anchor.y + item.y,
              transform: isMounted
                ? 'translate(-50%, -50%) scale(1)'
                : 'translate(-50%, -50%) scale(0.6)',
              opacity: isMounted ? 1 : 0,
              transition: `transform 0.35s cubic-bezier(0.16, 1, 0.3, 1) ${index * 40}ms, opacity 0.3s ease ${index * 40}ms`,
            }}
          >
            <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl shadow-lg ${item.tone}`}>
              <Icon className="h-5 w-5" />
            </span>
            <span className="smk-text-body font-extrabold leading-snug text-white drop-shadow-[0_2px_6px_rgba(0,0,0,0.85)]">
              {item.label}
            </span>
          </button>
        );
      })}

      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onClose();
        }}
        aria-label={t.close}
        className="smk-close-orb absolute z-20 flex h-14 w-14 items-center justify-center rounded-full"
        style={{
          left: anchor.x,
          top: anchor.y,
          transform: 'translate(-50%, -50%)',
        }}
      >
        <X className="h-7 w-7 stroke-[2.5]" />
      </button>
    </div>
  );
}
