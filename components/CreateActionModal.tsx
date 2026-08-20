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
 * Меню плюса: мягкая сияющая змейка.
 *
 * Телефон — дуга вверх, подписи сбоку от линии.
 * ПК — сначала влево (место под текст), потом вверх; иконки и текст справа.
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
  const [anchor, setAnchor] = useState({ x: 0, y: 0, desktop: false, scale: 1 });

  useEffect(() => {
    if (!isOpen) {
      setIsMounted(false);
      return;
    }
    document.body.style.overflow = 'hidden';
    const place = () => {
      const desktop = window.innerWidth >= 1024;
      const scale = window.visualViewport?.scale || window.devicePixelRatio || 1;
      if (desktop) {
        setAnchor({
          x: window.innerWidth - 24 - 28,
          y: window.innerHeight - 24 - 28,
          desktop: true,
          scale,
        });
      } else {
        setAnchor({
          x: window.innerWidth / 2,
          y: window.innerHeight - 36,
          desktop: false,
          scale,
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
    window.visualViewport?.addEventListener('resize', place);
    return () => {
      document.body.style.overflow = '';
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', place);
      window.visualViewport?.removeEventListener('resize', place);
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
    const gapY = 68;
    const longest = actions.reduce((max, item) => Math.max(max, item.label.length), 0);
    const textW = Math.min(280, Math.max(148, longest * 8.2));
    const reach = Math.min(anchor.x - 28, textW + 88 + (anchor.scale > 1 ? 36 : 0));
    return actions.map((item, index) => {
      const step = index + 1;
      if (anchor.desktop) {
        return {
          ...item,
          x: -reach,
          y: -step * gapY,
          align: 'right' as const,
        };
      }
      const side = index % 2 === 0 ? -1 : 1;
      return {
        ...item,
        x: side * 18,
        y: -step * gapY,
        align: (side < 0 ? 'left' : 'right') as 'left' | 'right',
      };
    });
  }, [actions, anchor.desktop, anchor.x, anchor.scale]);

  if (!isOpen) return null;

  const last = laid[laid.length - 1];
  const midX = last ? anchor.x + last.x : anchor.x;
  const path = last
    ? `M ${anchor.x} ${anchor.y}
       C ${anchor.x - 8} ${anchor.y - 18}, ${midX + 48} ${anchor.y - 10}, ${midX} ${anchor.y - 52}
       C ${midX - 10} ${anchor.y - 90}, ${midX + 10} ${last.y + anchor.y + 40}, ${midX} ${last.y + anchor.y}`
    : '';

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
      <svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden>
        <defs>
          <filter id="smk-snake-glow" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="3.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <path
          d={path}
          fill="none"
          stroke="var(--smk-gold)"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          filter="url(#smk-snake-glow)"
          className="smk-snake-line"
          style={{ opacity: isMounted ? 1 : 0 }}
        />
      </svg>

      {laid.map((item, index) => {
        const Icon = item.icon;
        const rowOnRight = item.align === 'right';
        return (
          <button
            key={item.id}
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              item.run();
            }}
            aria-label={item.label}
            className={`absolute z-10 flex max-w-[min(18rem,calc(100vw-1.5rem))] items-center gap-2.5 ${
              rowOnRight ? 'flex-row' : 'flex-row-reverse text-right'
            }`}
            style={{
              left: anchor.x + item.x,
              top: anchor.y + item.y,
              transform: isMounted
                ? (rowOnRight ? 'translate(0, -50%) scale(1)' : 'translate(-100%, -50%) scale(1)')
                : (rowOnRight ? 'translate(0, -50%) scale(0.7)' : 'translate(-100%, -50%) scale(0.7)'),
              opacity: isMounted ? 1 : 0,
              transition: `transform 0.4s cubic-bezier(0.16, 1, 0.3, 1) ${index * 45}ms, opacity 0.3s ease ${index * 45}ms`,
            }}
          >
            <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl shadow-lg ${item.tone}`}>
              <Icon className="h-5 w-5" />
            </span>
            <span className="rounded-xl bg-zinc-950/55 px-2.5 py-1.5 smk-text-body font-extrabold leading-snug text-white backdrop-blur-sm">
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
