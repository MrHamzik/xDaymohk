'use client';

import { useState, type ReactNode } from 'react';
import { BookOpen, Bell, ChevronDown, Globe2, Languages, LogIn, Save as SaveIcon } from 'lucide-react';
import LetterPreview, { AutoTextarea } from '@/components/LetterPreview';
import { useI18n } from '@/lib/i18n';

/** Поля письма, которые редактируются в превью. */
export interface LetterFields {
  title_ru: string;
  title_ce: string;
  message_ru: string;
  message_ce: string;
  sender: string;
}

export type LetterLang = 'ru' | 'ce';

interface AdminLetterEditorCardProps {
  title: string;
  hint: string;
  draft: LetterFields;
  onChange: (patch: Partial<LetterFields>) => void;
  lang: LetterLang;
  onLangChange: (lang: LetterLang) => void;
  /** Автоперевод русских полей в чеченские (как в «Заблокировать»/жалобах). */
  onTranslate: () => void;
  saveLabel?: string;
  onSave?: () => void;
  /** Дополнительные действия внизу (например, кнопки отправки для рассылки). */
  footer?: ReactNode;
  /** Контент ПОСЛЕ footer — в конце карточки (получатели и расписание). */
  afterFooter?: ReactNode;
  /** 'letter' — превью письма из уведомлений; 'welcome' — превью модального
   *  окна приветствия (в точности как при первом запуске). */
  variant?: 'letter' | 'welcome';
  /** Сворачиваемый блок (заголовок с шевроном; тело скрыто при collapsed). */
  collapsed?: boolean;
  onToggle?: () => void;
}

/** Стиль «редактируемой» области: прозрачный текст, подсветка при наведении. */
const EDIT_AFFORDANCE =
  'outline-none transition hover:bg-amber-100/50 focus:bg-amber-100/60 focus:ring-2 focus:ring-emerald-400/60 dark:hover:bg-zinc-700/60 dark:focus:bg-zinc-700/70';

/**
 * Превью модального окна приветствия (п.10).
 *
 * Копия шага welcome из OnboardingModal, и копия должна быть точной:
 * админ правит текст, глядя на превью, и вправе считать, что у
 * человека окно выглядит так же.
 *
 * Раньше здесь жила ПРЕЖНЯЯ версия окна — цветные разводы, квадрат с
 * градиентом и хлопушкой, разделитель со Sparkles. Само окно с тех пор
 * переделали на фирменный герб (.smk-emblem) и орнаментальную линейку
 * (.smk-orn), а превью осталось старым, и админка показывала то, чего
 * пользователь никогда не увидит.
 *
 * Разметка ниже повторяет OnboardingModal шаг в шаг: подложка
 * .smk-sheet .smk-sign, отступы px-6 pb-6 pt-12, герб, заголовок,
 * .smk-orn, текст, три кнопки и переключатель языка. Отличие ровно
 * одно и намеренное: заголовок и текст — редактируемые поля, а кнопки
 * статичные (это действия, в БД они не хранятся).
 */
function WelcomeModalPreview({
  draft,
  lang,
  onChange,
}: {
  draft: LetterFields;
  lang: LetterLang;
  onChange: (patch: Partial<LetterFields>) => void;
}) {
  const ce = lang === 'ce';
  return (
    <div className="smk-sheet smk-sign relative w-full max-w-md overflow-hidden rounded-3xl shadow-2xl">
      <div className="relative px-6 pb-6 pt-12">
        <div className="mb-5 text-center">
          <div className="smk-emblem mb-3" aria-hidden="true" />
          <input
            value={ce ? draft.title_ce : draft.title_ru}
            onChange={(e) => onChange(ce ? { title_ce: e.target.value } : { title_ru: e.target.value })}
            aria-label="Заголовок"
            placeholder={ce ? 'Марша догIийла хьомечу Даймохка' : 'Добро пожаловать в родной Даймохк'}
            className={`-mx-1 w-[calc(100%+0.5rem)] rounded-md px-1 text-center text-xl font-black leading-tight text-slate-900 placeholder:text-slate-400 dark:text-white dark:placeholder:text-zinc-500 ${EDIT_AFFORDANCE}`}
          />
        </div>

        <hr className="smk-orn mb-4" />

        <AutoTextarea
          value={ce ? draft.message_ce : draft.message_ru}
          onChange={(v) => onChange(ce ? { message_ce: v } : { message_ru: v })}
          ariaLabel="Текст"
          className={`-mx-1 w-[calc(100%+0.5rem)] resize-none rounded-md px-1 text-center text-sm leading-relaxed text-slate-600 placeholder:text-slate-400 dark:text-zinc-300 dark:placeholder:text-zinc-500 ${EDIT_AFFORDANCE}`}
        />

        {/* Кнопки — статичные (в реальном окне это действия, в БД не хранятся) */}
        <div className="mt-5 space-y-2">
          <div className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-emerald-300 bg-white px-4 py-2.5 text-xs font-bold text-emerald-700 shadow-sm dark:border-emerald-800 dark:bg-zinc-900 dark:text-emerald-300">
            <BookOpen className="h-3.5 w-3.5" />
            {ce ? 'Руководство' : 'Руководство'}
          </div>
          <div className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm">
            <LogIn className="h-3.5 w-3.5" />
            {ce ? 'Чуйаха Даймохк' : 'Войти в Даймохк'}
          </div>
          <div className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold text-slate-500 dark:text-zinc-400">
            {ce ? 'Гостера дIадерзо' : 'Продолжить как гость'}
          </div>
        </div>

        <div className="mt-4 flex items-center justify-center">
          <div className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
            <Globe2 className="h-3.5 w-3.5" />
            {ce ? 'Русский' : 'Нохчийн'}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Превью-редактор письма для админ-панели: показывает письмо ровно так,
 * как его увидит пользователь (общий компонент LetterPreview / копия
 * модального окна приветствия), а заголовок/текст/отправитель редактируются
 * прямо в превью прозрачными полями. Переключатель RU/CE + «Автоперевод»,
 * блок можно свернуть (шеврон в заголовке).
 */
export default function AdminLetterEditorCard({
  title,
  hint,
  draft,
  onChange,
  lang,
  onLangChange,
  onTranslate,
  saveLabel,
  onSave,
  footer,
  afterFooter,
  variant = 'letter',
  collapsed = false,
  onToggle,
}: AdminLetterEditorCardProps) {
  const { language } = useI18n();
  const appCe = language === 'ce';
  // Стабильное «сейчас» для превью — дата в подвале не меняется при вводе.
  const [previewTime] = useState(() => new Date().toISOString());

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      {/* Заголовок блока (сворачивание при onToggle) */}
      {onToggle ? (
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={!collapsed}
          className="flex w-full items-center justify-between gap-2 text-left"
        >
          <h4 className="min-w-0 text-xs font-bold uppercase tracking-wider text-slate-400">{title}</h4>
          <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${collapsed ? '-rotate-90' : ''}`} />
        </button>
      ) : (
        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">{title}</h4>
      )}

      {!collapsed && (
        <>
          <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
            <p className="smk-text-label text-slate-500 dark:text-zinc-500">{hint}</p>
            <div className="flex items-center gap-1.5">
              {/* Переключатель языка превью: RU / CE */}
              <div className="flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 dark:border-zinc-700 dark:bg-zinc-900">
                {(['ru', 'ce'] as const).map((l) => (
                  <button
                    key={l}
                    type="button"
                    onClick={() => onLangChange(l)}
                    className={`rounded-md px-2 py-1 smk-text-label font-bold uppercase transition ${lang === l ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:text-zinc-400 dark:hover:text-zinc-200'}`}
                  >
                    {l}
                  </button>
                ))}
              </div>
              {/* Автоперевод в чеченский — как в «Заблокировать»/жалобах */}
              <button
                type="button"
                onClick={onTranslate}
                className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2 py-1 smk-text-label font-bold text-white transition hover:bg-emerald-700"
                title={appCe ? 'Автоперевод (нохчийн → оьрсийн)' : 'Автоперевод (русский → чеченский)'}
              >
                <Languages className="h-3 w-3" />
                {appCe ? 'Автоперевод' : 'Автоперевод'}
              </button>
            </div>
          </div>

          <div className="mt-4 flex justify-center">
            {variant === 'welcome' ? (
              <WelcomeModalPreview draft={draft} lang={lang} onChange={onChange} />
            ) : (
              <LetterPreview
                categoryLabel="Система"
                fromLabel={appCe ? 'Царара:' : 'От:'}
                themeLabel={appCe ? 'Хаттар' : 'Тема'}
                textLabel={appCe ? 'Хьажорг' : 'Текст письма'}
                readLabel={appCe ? 'Дешна ду' : 'Прочитано'}
                unreadLabel={appCe ? 'Дешна дац' : 'Не прочитано'}
                sender={draft.sender || 'Даймохк'}
                title={lang === 'ru' ? draft.title_ru : draft.title_ce}
                message={lang === 'ru' ? draft.message_ru : draft.message_ce}
                isRead={false}
                createdAt={previewTime}
                icon={{ Icon: Bell, cls: 'bg-slate-100 text-slate-600 dark:bg-zinc-800 dark:text-zinc-300' }}
                edit={{ sender: true, title: true, message: true }}
                onSenderChange={(value) => onChange({ sender: value })}
                onTitleChange={(value) => onChange(lang === 'ru' ? { title_ru: value } : { title_ce: value })}
                onMessageChange={(value) => onChange(lang === 'ru' ? { message_ru: value } : { message_ce: value })}
              />
            )}
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
            {footer && <div className="flex flex-1 flex-wrap items-center gap-2">{footer}</div>}
            {saveLabel && onSave && (
              <button
                type="button"
                onClick={onSave}
                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-emerald-700"
              >
                <SaveIcon className="h-3.5 w-3.5" />
                {saveLabel}
              </button>
            )}
          </div>

          {/* Контент в конце карточки (получатели и расписание и т.п.) */}
          {afterFooter && <div className="mt-4 border-t border-slate-100 pt-4 dark:border-zinc-800">{afterFooter}</div>}
        </>
      )}
    </div>
  );
}
