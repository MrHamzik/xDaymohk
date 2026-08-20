'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bot, Briefcase, CarFront, Globe2, HandHeart, UserPlus, X } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { emitTourEvent, useTourActive, useTourCommands, type TourCommand } from '@/lib/tour';

interface CreateActionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenCreateProfile: () => void;
  onOpenTaxi?: () => void;
  onOpenGullaq?: () => void;
  onOpenGo?: () => void;
  onOpenDjanna?: () => void;
  /**
   * Открыть это же меню по команде гида (п.8). Состоянием владеет
   * страница, поэтому открыть себя изнутри компонент не может.
   */
  onOpenPlus?: () => void;
}

/**
 * Меню плюса: линия ровно по центру.
 * Иконка справа от линии — текст слева; иконка слева — текст справа.
 * Между ними — золотой ромб-связка.
 */
export default function CreateActionModal({
  isOpen,
  onClose,
  onOpenCreateProfile,
  onOpenTaxi,
  onOpenGullaq,
  onOpenGo,
  onOpenDjanna,
  onOpenPlus,
}: CreateActionModalProps) {
  const { t } = useI18n();
  const router = useRouter();
  // Во время гида меню плюса открывается и закрывается по-настоящему,
  // но пункты не срабатывают: человек изучает список, а не создаёт
  // анкету на середине обучения.
  const tourActive = useTourActive();
  const [isMounted, setIsMounted] = useState(false);
  // Узел остаётся в дереве, пока идёт анимация закрытия. Раньше стояло
  // `if (!isOpen) return null` — меню исчезало мгновенно: открытие было
  // плавным, а закрытие рубилось насухо.
  const [isPresent, setIsPresent] = useState(false);
  const [anchor, setAnchor] = useState({ x: 0, y: 0, midX: 0, desktop: false });

  // Длительность обратной анимации. Совпадает с transition ниже.
  const CLOSE_MS = 260;

  useEffect(() => {
    if (!isOpen) {
      setIsMounted(false);
      if (!isPresent) return;
      // Гид на шаге «Задания» ждёт именно закрытия крестиком.
      emitTourEvent('plus-close');
      // Снимаем узел только после того, как иконки уехали и фон
      // разморозился, иначе прощальный кадр не успеет отрисоваться.
      const timer = window.setTimeout(() => setIsPresent(false), CLOSE_MS);
      return () => window.clearTimeout(timer);
    }
    setIsPresent(true);
    emitTourEvent('plus-open');
    document.body.style.overflow = 'hidden';
    const place = () => {
      const desktop = window.innerWidth >= 1024;
      const midX = window.innerWidth / 2;
      if (desktop) {
        setAnchor({
          x: window.innerWidth - 24 - 28,
          y: window.innerHeight - 24 - 28,
          midX,
          desktop: true,
        });
      } else {
        setAnchor({
          x: midX,
          y: window.innerHeight - 36,
          midX,
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
    window.visualViewport?.addEventListener('resize', place);
    return () => {
      document.body.style.overflow = '';
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', place);
      window.visualViewport?.removeEventListener('resize', place);
    };
  }, [isOpen, onClose, isPresent]);

  /**
   * Гид открывает и закрывает меню сам (п.8).
   *
   * На шаге про «+» кнопка «Дальше» обязана делать ровно то же, что и
   * нажатие на «+»: убрать окно гида и показать список. Раньше «Дальше»
   * лишь прятала карточку, и человеку приходилось искать кнопку под
   * размытием.
   *
   * onOpenPlus передаёт страница — состояние меню живёт там.
   */
  const onCommand = useCallback((command: TourCommand) => {
    if (command === 'plus-open') onOpenPlus?.();
    if (command === 'plus-close') onClose();
  }, [onOpenPlus, onClose]);
  useTourCommands(onCommand);

  const actions = useMemo(() => [
    {
      id: 'profile',
      label: t.createProfileOption,
      icon: UserPlus,
      tone: 'bg-emerald-600 text-white',
      chip: undefined as 'dev' | 'plan' | undefined,
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
        else router.push('/temshik?create=1');
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
        else router.push('/goncholla?create=1');
      },
    },
    // Три пункта ниже — незаконченные разделы.
    //
    // Раньше они молча закрывали меню: onOpenTaxi и onOpenDjanna не
    // передавала ни одна страница, а у «Чистой линии» обработчик был
    // пустой. Человек нажимал и не понимал, сломалось у него что-то или
    // так задумано. Теперь у них честная пометка, как в боковом меню, и
    // переход на страницу-заглушку, которая объясняет, чего ждать.
    {
      id: 'taxi',
      label: t.taxiTitle,
      icon: CarFront,
      tone: 'bg-amber-500 text-white',
      chip: 'dev' as const,
      run: () => {
        onClose();
        if (onOpenTaxi) onOpenTaxi();
        else router.push('/taxi');
      },
    },
    {
      id: 'vpn',
      label: t.vpnTitle,
      icon: Globe2,
      tone: 'bg-teal-600 text-white',
      chip: 'dev' as const,
      run: () => { onClose(); router.push('/vpn'); },
    },
    {
      id: 'djanna',
      label: t.djannaAssistantOption,
      icon: Bot,
      tone: 'bg-indigo-600 text-white',
      chip: 'plan' as const,
      run: () => { onClose(); onOpenDjanna?.(); },
    },
  ], [t, onClose, onOpenCreateProfile, onOpenGullaq, onOpenGo, onOpenTaxi, onOpenDjanna, router]);

  const laid = useMemo(() => {
    const gapY = 70;
    return actions.map((item, index) => {
      const iconOnRight = index % 2 === 0;
      return {
        ...item,
        y: -(index + 1) * gapY,
        iconOnRight,
      };
    });
  }, [actions]);

  if (!isOpen && !isPresent) return null;

  const last = laid[laid.length - 1];
  const topY = last ? anchor.y + last.y : anchor.y - 80;
  const path = `M ${anchor.x} ${anchor.y}
    C ${anchor.x} ${anchor.y - 18}, ${anchor.midX} ${anchor.y - 10}, ${anchor.midX} ${anchor.y - 56}
    L ${anchor.midX} ${topY}`;

  return (
    <div
      className={`fixed inset-0 z-[90] bg-zinc-950/55 transition-all duration-[260ms] ease-out ${
        isMounted ? 'opacity-100 backdrop-blur-md' : 'opacity-0 backdrop-blur-0'
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
        const top = anchor.y + item.y;
        return (
          <button
            key={item.id}
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              // Во время гида пункты показываются, но никуда не ведут.
              if (tourActive) return;
              item.run();
            }}
            aria-label={item.label}
            className="absolute z-10"
            style={{
              left: anchor.midX,
              top,
              transform: isMounted ? 'translate(-50%, -50%) scale(1)' : 'translate(-50%, -50%) scale(0.72)',
              opacity: isMounted ? 1 : 0,
              // При закрытии лесенка разворачивается: дальние иконки
              // уходят первыми, ближние последними.
              transition: isMounted
                ? `transform 0.4s cubic-bezier(0.16, 1, 0.3, 1) ${index * 45}ms, opacity 0.3s ease ${index * 45}ms`
                : `transform 0.24s cubic-bezier(0.4, 0, 1, 1) ${(laid.length - 1 - index) * 30}ms, opacity 0.2s ease ${(laid.length - 1 - index) * 30}ms`,
            }}
          >
            <span className={`flex items-center gap-2 ${item.iconOnRight ? 'flex-row' : 'flex-row-reverse'}`}>
              {/* Пометок «в разработке» здесь нет намеренно: пункт и так
                  ведёт на страницу, которая всё объясняет, а в компактном
                  меню плюса подпись из двух строк ломала ряд. */}
              <span className="smk-snake-label max-w-[min(12.5rem,calc(50vw-3.2rem))] smk-text-body font-extrabold leading-snug">
                {item.label}
              </span>
              <span className="smk-snake-join" aria-hidden />
              <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl shadow-lg ${item.tone}`}>
                <Icon className="h-5 w-5" />
              </span>
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
          // Крестик гаснет вместе с остальным меню, а не пропадает
          // раньше него.
          transform: isMounted
            ? 'translate(-50%, -50%) rotate(0deg) scale(1)'
            : 'translate(-50%, -50%) rotate(-90deg) scale(0.6)',
          opacity: isMounted ? 1 : 0,
          transition: 'transform 0.28s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.22s ease',
        }}
      >
        <X className="h-7 w-7 stroke-[2.5]" />
      </button>
    </div>
  );
}
