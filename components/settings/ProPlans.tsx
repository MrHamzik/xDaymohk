'use client';

import { useI18n } from '@/lib/i18n';
import { useSettings } from '@/components/SettingsProvider';
import { PRO_PRICES, activeProTier, hasPro, type ProTier } from '@/lib/settings/pro';

const TIERS: Array<{
  id: Exclude<ProTier, 'none'>;
  titleKey: 'proBronze' | 'proSilver' | 'proGold' | 'proPlatinum';
  perkKey: 'proBronzePerk' | 'proSilverPerk' | 'proGoldPerk' | 'proPlatinumPerk';
}> = [
  { id: 'bronze', titleKey: 'proBronze', perkKey: 'proBronzePerk' },
  { id: 'silver', titleKey: 'proSilver', perkKey: 'proSilverPerk' },
  { id: 'gold', titleKey: 'proGold', perkKey: 'proGoldPerk' },
  { id: 'platinum', titleKey: 'proPlatinum', perkKey: 'proPlatinumPerk' },
];

/**
 * Ступени Pro. Оплату не проводим: карточки показывают, что открывает
 * каждый уровень. Ступень хранится в настройках (пока выставляет админ
 * или будущая оплата).
 */
export default function ProPlans() {
  const { t } = useI18n();
  const { settings } = useSettings();

  // Действующий уровень, а не записанный: срок мог закончиться. Ровно
  // так же считает база (функция effective_pro_tier), поэтому карточки
  // показывают то же, что реально разрешено.
  const active = activeProTier(settings);
  const until = settings.proUntil ? new Date(settings.proUntil) : null;
  const expired = settings.proTier !== 'none' && active === 'none';
  // Неделя до конца — момент, когда о продлении стоит предупредить
  // заранее, а не ставить перед фактом.
  const soon = !expired && until !== null
    && until.getTime() - Date.now() < 7 * 86_400_000;

  return (
    <section>
      {settings.proTier !== 'none' && (
        <p
          className={`mb-2 smk-text-label font-bold ${
            expired || soon
              ? 'text-amber-700 dark:text-amber-400'
              : 'text-slate-600 dark:text-zinc-300'
          }`}
        >
          {expired
            ? t.proExpired
            : until === null
              ? t.proUntilForever
              : `${t.proUntilLabel} ${until.toLocaleDateString('ru-RU', {
                  day: 'numeric', month: 'long', year: 'numeric',
                })}${soon ? ` · ${t.proExpiresSoon}` : ''}`}
        </p>
      )}
      <p className="mb-2 smk-text-label leading-relaxed text-slate-500 dark:text-zinc-400">
        {t.proPayLater}
      </p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {TIERS.map((tier) => {
          const current = active === tier.id;
          const included = hasPro(settings, tier.id);
          return (
            <div key={tier.id} className="smk-field px-3 py-3">
              <div className="flex items-baseline justify-between gap-2">
                <p className="smk-text-title font-extrabold text-slate-900 dark:text-white">
                  {t[tier.titleKey]}
                </p>
                <p className="smk-text-label font-bold text-[var(--smk-gold)]">
                  {PRO_PRICES[tier.id]} ₽ / {t.proMonth}
                </p>
              </div>
              <p className="mt-1 smk-text-label leading-relaxed text-slate-500 dark:text-zinc-400">
                {t[tier.perkKey]}
              </p>
              <p className="mt-2 smk-text-label font-bold text-emerald-700 dark:text-emerald-400">
                {current ? t.proCurrent : included ? t.proIncluded : t.proLocked}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
