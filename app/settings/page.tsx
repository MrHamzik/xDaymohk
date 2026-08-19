'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, RotateCcw, Settings as SettingsIcon, Volume2 } from 'lucide-react';
import Navbar from '@/components/Navbar';
import SidebarNav from '@/components/SidebarNav';
import BottomNav from '@/components/BottomNav';
import MobileMenuDrawer from '@/components/MobileMenuDrawer';
import CreateActionModal from '@/components/CreateActionModal';
import MapSegmentedControl from '@/components/MapSegmentedControl';
import ThemeEditor from '@/components/settings/ThemeEditor';
import EffectsEditor from '@/components/settings/EffectsEditor';
import PayoutSettings from '@/components/settings/PayoutSettings';
import {
  CollapsibleSection, SectionTitle, SettingRow, Toggle, WarningBox,
} from '@/components/settings/SettingsPrimitives';
import { useAuth } from '@/components/AuthProvider';
import { useProfiles } from '@/components/ProfilesProvider';
import { useSettings } from '@/components/SettingsProvider';
import { prefFor } from '@/lib/settings/defaults';
import {
  LOCKED_NOTIFICATION_GROUPS, NOTIFICATION_GROUPS,
  type FontFamilyId, type NotificationGroup, type NotificationPref,
} from '@/lib/settings/types';
import { useI18n } from '@/lib/i18n';
import {
  DEFAULT_GROUP_SOUND, playSound, SOUND_IDS, SOUND_LABELS, type SoundId,
} from '@/lib/notification-sounds';

/**
 * Страница настроек.
 *
 * Разделена на три уровня: задания → уведомления → расширенное.
 * Расширенный блок скрыт за тумблером: темы и шрифты легко довести до
 * нечитаемого состояния, поэтому они не должны попадаться случайно.
 */
/** Разделы страницы настроек. 'all' — прежний вид целиком. */
type SettingsSection = 'all' | 'tasks' | 'notifications' | 'payout' | 'advanced';

export default function SettingsPage() {
  const { t, language } = useI18n();
  const { account } = useAuth();
  const { isCurrentUserAdmin } = useProfiles();
  const { settings, update, reset } = useSettings();

  /**
   * Разделы настроек — тот же сегмент-переключатель, что и вкладки
   * фильтров в лентах заданий.
   *
   * Страница выросла: задания, уведомления, реквизиты, темы, эффекты,
   * типографика — всё подряд одним свитком. Чтобы поправить одну
   * настройку, приходилось прокручивать мимо остальных. «Все»
   * оставляет прежний вид целиком, остальные вкладки скрывают лишнее.
   */
  const [section, setSection] = useState<SettingsSection>('all');
  // Какой из больших блоков расширенного режима раскрыт. Один за раз:
  // иначе страница снова превращается в бесконечный свиток.
  const [openBlock, setOpenBlock] = useState<'themes' | 'effects' | 'fonts' | null>(null);
  const toggleBlock = (name: 'themes' | 'effects' | 'fonts') =>
    setOpenBlock((current) => (current === name ? null : name));
  const shows = (name: Exclude<SettingsSection, 'all'>) =>
    section === 'all' || section === name;
  const router = useRouter();

  const [isMenuDrawerOpen, setIsMenuDrawerOpen] = useState(false);
  const [isCreateSheetOpen, setIsCreateSheetOpen] = useState(false);

  const groupLabels: Record<NotificationGroup, { title: string; description: string }> = {
    profile: { title: t.settingsGroupProfile, description: t.settingsGroupProfileDesc },
    activity: { title: t.settingsGroupActivity, description: t.settingsGroupActivityDesc },
    tasks: { title: t.settingsGroupTasks, description: t.settingsGroupTasksDesc },
    complaint: { title: t.settingsGroupComplaint, description: t.settingsGroupComplaintDesc },
    taxi: { title: t.settingsGroupTaxi, description: t.settingsGroupTaxiDesc },
    system: { title: t.settingsGroupSystem, description: t.settingsGroupSystemDesc },
  };

  // Сгруппированы по начертанию: выбирать «шрифт с засечками» проще,
  // чем вспоминать, чем Literata отличается от Jost. Все с кириллицей.
  const fontGroups: Array<{ label: string; options: Array<{ id: FontFamilyId; label: string }> }> = [
    {
      label: t.settingsFontSans,
      options: [
        { id: 'manrope', label: 'Manrope' },
        { id: 'inter', label: 'Inter' },
        { id: 'rubik', label: 'Rubik' },
        { id: 'montserrat', label: 'Montserrat' },
        { id: 'jost', label: 'Jost' },
        { id: 'onest', label: 'Onest' },
      ],
    },
    {
      label: t.settingsFontSerif,
      options: [
        { id: 'pt-serif', label: 'PT Serif' },
        { id: 'literata', label: 'Literata' },
        { id: 'georgia', label: 'Georgia' },
      ],
    },
    {
      label: t.settingsFontMono,
      options: [
        { id: 'roboto-mono', label: 'Roboto Mono' },
        { id: 'system', label: t.settingsFontSystem },
      ],
    },
  ];

  const setPref = (group: NotificationGroup, patch: Partial<NotificationPref>) => {
    const current = prefFor(settings, group);
    update({
      notificationPrefs: {
        ...settings.notificationPrefs,
        [group]: { ...current, ...patch },
      },
    });
  };

  const handleReset = () => {
    if (!window.confirm(t.settingsResetConfirm)) return;
    reset();
  };

  return (
    <div className="flex min-h-[100dvh] min-w-0 flex-col overflow-x-hidden bg-slate-50 bg-radial-gradient transition-colors dark:bg-zinc-950">
      <Navbar />

      <div className="mx-auto flex w-full max-w-6xl items-start justify-start gap-6 px-3.5 pb-20 pt-18 sm:pb-8 lg:pt-24">
        <aside className="sticky top-24 z-40 hidden h-[calc(100vh-8rem)] w-[290px] shrink-0 flex-col lg:flex">
          <div className="no-scrollbar flex h-full min-h-0 flex-1 flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-zinc-700 dark:bg-zinc-950">
            <SidebarNav isAdmin={isCurrentUserAdmin} />
          </div>
        </aside>

        <main className="min-w-0 max-w-3xl flex-1">
          <div className="mb-4 flex items-center gap-3">
            <Link
              href="/catalog"
              aria-label={t.tasksBack}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div className="min-w-0 flex-1">
              <h1 className="flex items-center gap-2 text-lg font-extrabold text-slate-900 dark:text-white">
                <SettingsIcon className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                {t.settingsTitle}
              </h1>
              <p className="truncate text-sm text-slate-500 dark:text-zinc-500">
                {t.settingsSubtitle}
              </p>
            </div>
          </div>
          <hr className="smk-orn mb-4" />

          {!account && (
            <p className="smk-note smk-note-info mb-4 px-3.5 py-2.5">
              {t.settingsSignInRequired}
            </p>
          )}

          {/* Разделы: скрывают лишнее, не меняя порядок блоков. */}
          <MapSegmentedControl
            ariaLabel={t.settingsSectionsAria}
            active={[section]}
            onSelect={setSection}
            // Порядок повторяет порядок блоков на странице, «Все» —
            // первым: это состояние по умолчанию, и логично, что оно
            // стоит в начале ряда, а не в конце.
            options={[
              { value: 'all' as const, label: t.settingsSectionAll },
              { value: 'tasks' as const, label: t.settingsSectionTasks },
              { value: 'notifications' as const, label: t.settingsSectionNotifications },
              { value: 'payout' as const, label: t.settingsSectionPayout },
              { value: 'advanced' as const, label: t.settingsSectionAdvanced },
            ]}
            // Подписи длинные: при равном делении ширины они не
            // помещались и обрезались. Прокручиваем ряд вместо сжатия.
            scrollable
            className="mb-3"
          />

          <div className="smk-lux space-y-5 p-4">
            {/* ── Задания ───────────────────────────────────────── */}
            {shows('tasks') && (
            <section>
              <SectionTitle title={t.settingsTasksSection} />
              <div className="space-y-1.5">
                <SettingRow title={t.settingsAutoActive} hint={t.settingsAutoActiveHint}>
                  <Toggle
                    checked={settings.autoActiveOnOpen}
                    onChange={(next) => update({ autoActiveOnOpen: next })}
                    label={t.settingsAutoActive}
                  />
                </SettingRow>
                <SettingRow title={t.settingsAutoApprove} hint={t.settingsAutoApproveHint}>
                  <Toggle
                    checked={settings.autoApproveExecutor}
                    onChange={(next) => update({ autoApproveExecutor: next })}
                    label={t.settingsAutoApprove}
                  />
                </SettingRow>
                <SettingRow title={t.settingsHideHints} hint={t.settingsHideHintsHint}>
                  <Toggle
                    checked={settings.hideHints}
                    onChange={(next) => update({ hideHints: next })}
                    label={t.settingsHideHints}
                  />
                </SettingRow>
                <SettingRow title={t.settingsCompact} hint={t.settingsCompactHint}>
                  <Toggle
                    checked={settings.compactLists}
                    onChange={(next) => update({ compactLists: next })}
                    label={t.settingsCompact}
                  />
                </SettingRow>
                <SettingRow title={t.settingsConfirmDanger} hint={t.settingsConfirmDangerHint}>
                  <Toggle
                    checked={settings.confirmDanger}
                    onChange={(next) => update({ confirmDanger: next })}
                    label={t.settingsConfirmDanger}
                  />
                </SettingRow>
                <SettingRow title={t.settingsQuietHours} hint={t.settingsQuietHoursHint}>
                  <Toggle
                    checked={settings.quietHours}
                    onChange={(next) => update({ quietHours: next })}
                    label={t.settingsQuietHours}
                  />
                </SettingRow>
                <SettingRow title={t.settingsVibrate} hint={t.settingsVibrateHint}>
                  <Toggle
                    checked={settings.vibrate}
                    onChange={(next) => update({ vibrate: next })}
                    label={t.settingsVibrate}
                  />
                </SettingRow>
                <SettingRow title={t.hidePrayer} hint={t.hidePrayerHint}>
                  <Toggle
                    checked={settings.hidePrayer}
                    onChange={(next) => update({ hidePrayer: next })}
                    label={t.hidePrayer}
                  />
                </SettingRow>
              </div>
            </section>
            )}

            {/* ── Уведомления ───────────────────────────────────── */}
            {shows('notifications') && (
            <section>
              <SectionTitle
                title={t.settingsNotificationsSection}
                hint={t.settingsNotificationsHint}
              />

              {/* Шапка колонок: без неё два тумблера в ряд неразличимы.
                  Ширина и зазор совпадают со строками ниже — иначе
                  подписи «Показывать» и «Звук» наезжали друг на друга. */}
              {/* Подписи колонок прячем на узком экране: там тумблеры
                  уходят под текст и шапка перестаёт над ними стоять —
                  подписи «висели» над пустотой. Роль тумблера на
                  телефоне понятна по aria-label и порядку. */}
              <div className="mb-1 hidden items-center justify-end gap-4 pr-3 smk-text-label font-bold uppercase tracking-wide text-slate-400 dark:text-zinc-500 sm:flex">
                <span className="w-14 text-center">{t.settingsColShow}</span>
                <span className="w-14 text-center">{t.settingsColSound}</span>
              </div>

              <div className="space-y-1.5">
                {NOTIFICATION_GROUPS.map((group) => {
                  const pref = prefFor(settings, group);
                  const isLocked = LOCKED_NOTIFICATION_GROUPS.includes(group);
                  return (
                    <div
                      key={group}
                      className="smk-field px-3 py-2.5"
                    >
                      <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-xs font-bold text-slate-800 dark:text-zinc-200">
                          {groupLabels[group].title}
                        </p>
                        <p className="mt-0.5 smk-text-label leading-relaxed text-slate-500 dark:text-zinc-500">
                          {groupLabels[group].description}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-start gap-4">
                        <span className="flex w-14 flex-col items-center gap-1">
                          <Toggle
                            checked={isLocked ? true : pref.show}
                            disabled={isLocked}
                            onChange={(next) => setPref(group, { show: next })}
                            label={`${groupLabels[group].title}: ${t.settingsColShow}`}
                          />
                        </span>
                        <span className="flex w-14 flex-col items-center gap-1">
                          <Toggle
                            checked={pref.sound}
                            onChange={(next) => setPref(group, { sound: next })}
                            label={`${groupLabels[group].title}: ${t.settingsColSound}`}
                          />
                        </span>
                      </div>
                      </div>

                      {/* Выбор мелодии — только когда звук включён.
                          Разные звуки у групп нужны, чтобы понимать
                          источник, не доставая телефон. Кнопка рядом
                          проигрывает выбранное: без прослушивания имя
                          «Двойной» ничего не говорит. */}
                      {pref.sound && (
                        <div className="mt-2 flex w-full items-center gap-2">
                          <select
                            aria-label={`${groupLabels[group].title}: ${t.settingsSoundPick}`}
                            value={pref.soundId ?? DEFAULT_GROUP_SOUND[group] ?? 'chime'}
                            onChange={(e) => {
                              setPref(group, { soundId: e.target.value });
                              playSound(e.target.value as SoundId);
                            }}
                            className="smk-field min-w-0 flex-1 px-2.5 py-1.5 smk-text-label text-slate-900 outline-none dark:text-white"
                          >
                            {SOUND_IDS.map((id) => (
                              <option key={id} value={id}>
                                {language === 'ce' ? SOUND_LABELS[id].ce : SOUND_LABELS[id].ru}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() => playSound(
                              (pref.soundId ?? DEFAULT_GROUP_SOUND[group] ?? 'chime') as SoundId,
                            )}
                            aria-label={t.settingsSoundPlay}
                            title={t.settingsSoundPlay}
                            className="smk-act flex h-8 w-8 shrink-0 items-center justify-center"
                          >
                            <Volume2 className="h-4 w-4" />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
            )}

            {/* ── Реквизиты для оплаты заданий ──────────────────────
                 После уведомлений: это не ежедневная настройка, а то,
                 что заполняют один раз перед первым платным заданием. */}
            {shows('payout') && <PayoutSettings />}

            {/* ── Расширенные ───────────────────────────────────── */}
            {shows('advanced') && (
            <section>
              <SectionTitle
                title={t.settingsAdvanced}
                hint={t.settingsAdvancedHint}
                action={
                  <Toggle
                    checked={settings.advancedMode}
                    onChange={(next) => update({ advancedMode: next })}
                    label={t.settingsAdvanced}
                  />
                }
              />

              {settings.advancedMode && (
                <div className="space-y-5 pt-1">
                  {/* Три больших блока — сворачиваемые: вместе они дают
                      несколько экранов прокрутки, и до шрифтов
                      приходилось листать всю палитру. */}
                  <CollapsibleSection
                    title={t.settingsThemes}
                    hint={t.settingsThemesHint}
                    isOpen={openBlock === 'themes'}
                    onToggle={() => toggleBlock('themes')}
                  >
                    <ThemeEditor />
                  </CollapsibleSection>

                  {/* Эффекты — под темами: сначала выбирают оформление,
                      потом настраивают его «плотность». */}
                  <CollapsibleSection
                    title={t.settingsEffects}
                    hint={t.settingsEffectsHint}
                    isOpen={openBlock === 'effects'}
                    onToggle={() => toggleBlock('effects')}
                  >
                    <EffectsEditor />
                  </CollapsibleSection>

                  <div className="smk-field space-y-2 px-3 py-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-800 dark:text-zinc-200">{t.settingsRadius}</span>
                      <span className="text-xs font-extrabold text-emerald-700 dark:text-emerald-400">{(settings.radiusScale / 100).toFixed(2)}×</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={200}
                      step={5}
                      value={settings.radiusScale}
                      onChange={(e) => update({ radiusScale: Number(e.target.value) })}
                      aria-label={t.settingsRadius}
                      className="w-full accent-emerald-600"
                    />
                    <p className="smk-text-label text-slate-400 dark:text-zinc-500">{t.settingsRadiusHint}</p>
                  </div>
                  <SettingRow title={t.lightMode} hint={t.lightModeHint}>
                    <Toggle
                      checked={settings.lightMode}
                      onChange={(next) => update({ lightMode: next })}
                      label={t.lightMode}
                    />
                  </SettingRow>
                  <CollapsibleSection
                    title={t.settingsTypography}
                    isOpen={openBlock === 'fonts'}
                    onToggle={() => toggleBlock('fonts')}
                  >

                    <div className="smk-field px-3 py-3">
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-800 dark:text-zinc-200">
                          {t.settingsFontSize}
                        </span>
                        <span className="text-xs font-extrabold text-emerald-700 dark:text-emerald-400">
                          {settings.fontScale} %
                        </span>
                      </div>
                      <input
                        type="range"
                        min={50}
                        max={150}
                        step={5}
                        value={settings.fontScale}
                        onChange={(e) => update({ fontScale: Number(e.target.value) })}
                        aria-label={t.settingsFontSize}
                        className="w-full accent-emerald-600"
                      />
                      <p className="mt-1 smk-text-label leading-relaxed text-slate-400 dark:text-zinc-500">
                        {t.settingsFontSizeHint}
                      </p>
                    </div>

                    <div className="smk-field mt-1.5 px-3 py-2.5">
                      <label
                        htmlFor="settings-font"
                        className="mb-1.5 block text-xs font-bold text-slate-800 dark:text-zinc-200"
                      >
                        {t.settingsFontFamily}
                      </label>
                      <select
                        id="settings-font"
                        value={settings.fontFamily}
                        onChange={(e) => update({ fontFamily: e.target.value as FontFamilyId })}
                        className="w-full rounded-lg bg-white px-2.5 py-2 text-xs font-semibold text-slate-900 outline-none focus:ring-2 focus:ring-emerald-500 dark:bg-zinc-800 dark:text-white"
                      >
                        {fontGroups.map((group) => (
                          <optgroup key={group.label} label={group.label}>
                            {group.options.map((option) => (
                              <option key={option.id} value={option.id}>{option.label}</option>
                            ))}
                          </optgroup>
                        ))}
                      </select>

                    </div>
                  </CollapsibleSection>
                </div>
              )}
            </section>
            )}

            {/* ── Сброс ─────────────────────────────────────────── */}
            <section className="space-y-2">
              <WarningBox text={t.settingsResetWarning} />
              <button
                type="button"
                onClick={handleReset}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-rose-50 px-4 py-2.5 text-xs font-bold text-rose-700 transition hover:bg-rose-100 dark:bg-rose-950/40 dark:text-rose-300 dark:hover:bg-rose-950/70"
              >
                <RotateCcw className="h-4 w-4" />
                {t.settingsReset}
              </button>
            </section>
          </div>
        </main>
      </div>

      <BottomNav
        onOpenMenu={() => setIsMenuDrawerOpen(true)}
        onOpenCreate={() => setIsCreateSheetOpen(true)}
        isAdmin={isCurrentUserAdmin}
      />
      <MobileMenuDrawer
        isOpen={isMenuDrawerOpen}
        onClose={() => setIsMenuDrawerOpen(false)}
        isAdmin={isCurrentUserAdmin}
      />
      <CreateActionModal
        isOpen={isCreateSheetOpen}
        onClose={() => setIsCreateSheetOpen(false)}
        onOpenCreateProfile={() => router.push('/catalog')}
      />
    </div>
  );
}
