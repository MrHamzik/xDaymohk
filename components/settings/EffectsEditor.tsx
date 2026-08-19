'use client';

import { Sparkles } from 'lucide-react';
import { useSettings } from '@/components/SettingsProvider';
import { useI18n } from '@/lib/i18n';
import { DEFAULT_EFFECTS, EFFECT_KEYS, type EffectSettings } from '@/lib/settings/types';

/**
 * Настройка визуальных эффектов.
 *
 * Ползунки, а не тумблеры: между «выключено» и «максимум» есть
 * промежуточные значения, и на слабом телефоне полезнее ослабить тени,
 * чем убрать их совсем. Значение 0 полностью выключает эффект.
 *
 * Изменения применяются мгновенно — человек видит результат на самой
 * странице настроек, не переходя в каталог.
 */
export default function EffectsEditor() {
  const { language } = useI18n();
  const { settings, update } = useSettings();
  const ce = language === 'ce';

  const LABELS: Record<keyof EffectSettings, { ru: string; ce: string; hintRu: string; hintCe: string }> = {
    shadow: {
      ru: 'Тени', ce: 'ЖIаьлеш',
      hintRu: 'Объём под карточками и всплывающими окнами.',
      hintCe: 'Карточкаш кIел а, схьаоьху корташ кIел а.',
    },
    glow: {
      ru: 'Свечение', ce: 'Серло',
      hintRu: 'Мягкий ореол у точки статуса и акцентных кнопок.',
      hintCe: 'Хьал гойту тIадам а, коьрта кнопкаш а къегина.',
    },
    gradient: {
      ru: 'Градиенты', ce: 'Градиенташ',
      hintRu: 'Переход цвета на полотне карточек и в шапке каталога.',
      hintCe: 'Карточкаш тIехь а, могIаман корта тIехь а бесан хийцам.',
    },
    pattern: {
      ru: 'Узоры', ce: 'Куьцаш',
      hintRu: 'Лучи на карточках и ромбы в разделителях.',
      hintCe: 'Карточкаш тIехь зIаьнарш а, декъархошкахь ромбаш а.',
    },
    blur: {
      ru: 'Размытие', ce: 'Къардар',
      hintRu: 'Матовое стекло у шапки, нижнего меню и модальных окон. Самый тяжёлый эффект для слабых телефонов.',
      hintCe: 'Корта, лахара меню, схьаоьху корташ. КIезиг ницкъ болчу телефонашна хала ду.',
    },
    motion: {
      ru: 'Анимации', ce: 'Хийцамаш',
      hintRu: 'Появление карточек, блики, пульсация статуса.',
      hintCe: 'Карточкаш гучуйовлар, серлонаш, хьалан тохар.',
    },
  };

  const setEffect = (key: keyof EffectSettings, value: number) => {
    update({ effects: { ...settings.effects, [key]: value } });
  };

  const isDefault = EFFECT_KEYS.every(
    (key) => settings.effects[key] === DEFAULT_EFFECTS[key],
  );

  return (
    <section>
      {/* Заголовок и подсказку рисует обёртка CollapsibleSection —
          внутренний SectionTitle давал второй такой же с линией.
          Кнопка сброса осталась здесь: она относится к эффектам, а не
          к разделу настроек. */}
      {!isDefault && (
        <div className="mb-2 flex justify-end">
          <button
            type="button"
            onClick={() => update({ effects: { ...DEFAULT_EFFECTS } })}
            className="rounded-lg px-2.5 py-1 smk-text-label font-bold text-emerald-700 transition hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/40"
          >
            {ce ? 'Юха дIахIотто' : 'Сбросить'}
          </button>
        </div>
      )}

      <div className="space-y-1.5">
        {EFFECT_KEYS.map((key) => {
          const value = settings.effects[key];
          return (
            <div key={key} className="smk-field px-3 py-2.5">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 truncate text-xs font-bold text-slate-800 dark:text-zinc-200">
                    <Sparkles className="h-3 w-3 shrink-0 text-emerald-600 dark:text-emerald-400" />
                    {ce ? LABELS[key].ce : LABELS[key].ru}
                  </p>
                  <p className="mt-0.5 smk-text-label leading-relaxed text-slate-500 dark:text-zinc-500">
                    {ce ? LABELS[key].hintCe : LABELS[key].hintRu}
                  </p>
                </div>
                <span className="w-10 shrink-0 text-right text-xs font-bold tabular-nums text-slate-700 dark:text-zinc-300">
                  {value === 0 ? (ce ? 'дIа' : 'выкл') : `${value}%`}
                </span>
              </div>

              <input
                type="range"
                min={0}
                max={100}
                step={10}
                value={value}
                onChange={(e) => setEffect(key, Number(e.target.value))}
                aria-label={ce ? LABELS[key].ce : LABELS[key].ru}
                className="mt-2 w-full accent-emerald-600"
              />
            </div>
          );
        })}
      </div>

      <p className="smk-meta mt-2 smk-text-label leading-relaxed">
        {ce
          ? 'Хьайн телефонан нисдаршкахь «хийцамаш кIезиг бе» хаьржина делахь, анимацеш шаьш дIаоьху.'
          : 'Если в системе включено «уменьшить движение», анимации отключаются автоматически.'}
      </p>
    </section>
  );
}
