'use client';

import { useState } from 'react';
import { Check, ChevronDown, Palette, Plus, Trash2 } from 'lucide-react';
import { useSettings } from '@/components/SettingsProvider';
import { PRESET_THEMES, normalizeColors } from '@/lib/settings/defaults';
import { deriveCardInset, deriveCardLine, deriveDivider, derivePalette, derivePanel } from '@/lib/settings/derive';
import {
  MAX_CUSTOM_THEMES, THEME_COLOR_GROUPS,
  type CustomTheme, type ThemeColorGroup, type ThemeColors,
} from '@/lib/settings/types';
import { useI18n } from '@/lib/i18n';
import { HintMark, SectionTitle } from '@/components/settings/SettingsPrimitives';

/**
 * Подписи слотов палитры, разложенные по трём группам.
 *
 * Пользователь не обязан знать про --smk-*: подпись описывает, ЧТО
 * поменяется на экране, а не как называется переменная.
 */
const GROUP_TITLES: Record<ThemeColorGroup, { ru: string; ce: string; hint: string }> = {
  global: {
    ru: 'Глобальные',
    ce: 'Дерригенна',
    hint: 'Фон страницы, карточки, обводки и текст — то, что задаёт общее впечатление.',
  },
  details: {
    ru: 'Детали',
    ce: 'Къастамаш',
    hint: 'Акценты: кнопки, иконки, звезда рейтинга и опасные действия.',
  },
  specific: {
    ru: 'Специфические',
    ce: 'Къаьсттина',
    hint: 'Смысловые цвета: статусы работы, роли, шапка каталога и объекты на карте.',
  },
};

/**
 * Главный цвет — отдельный блок над группами.
 *
 * Это не 26-й слот палитры, а способ задать её целиком: из него
 * выводятся поверхности, текст, акцент и градиенты. Смысловые цвета
 * (статусы, роли, «удалить») только подгоняются по светлоте — красный
 * «удалить» остаётся красным в любой теме.
 */
const MAIN_COLOR = {
  ru: 'Главный цвет',
  ce: 'Коьрта бос',
  hint: 'Из него считается вся палитра: фон, карточки, линии, текст и акцент. Тонкие правки — в группах ниже.',
  noteRu: 'Меняет всю тему сразу. Отдельные цвета можно поправить ниже — они не сбросятся, пока снова не выбран главный цвет.',
  noteCe: 'Дерриг тема цкъа хийцало. Кегийра беснаш лахахь нисдан мега — коьрта бос юха ца харжахь, уьш ца дожадо.',
};

/** Подписи только для слотов, показанных в редакторе (cardAlt скрыт). */
const COLOR_LABELS: Partial<Record<keyof ThemeColors, { ru: string; ce: string }>> = {
  bg: { ru: 'Фон страницы', ce: 'АгIонан букъ' },
  card: { ru: 'Карточки и поля', ce: 'Карточкаш а, меттигаш а' },
  panel: { ru: 'Панели и подвал карточек', ce: 'Панелаш а, карточкийн бух а' },
  cardInset: { ru: 'Подложка строк', ce: 'МогIанийн бухъ' },
  cardLine: { ru: 'Обводка (контур)', ce: 'Йоза (контур)' },
  divider: { ru: 'Разделители (линии внутри)', ce: 'Декъархой (чоьхьара сизаш)' },
  text: { ru: 'Основной текст', ce: 'Коьрта йоза' },
  muted: { ru: 'Второстепенный текст', ce: 'ШолгIа йоза' },
  icon: { ru: 'Иконки', ce: 'ГIирсаш' },

  accent: { ru: 'Золотой акцент (звезда, рамки)', ce: 'Деши акцент' },
  accentSoft: { ru: 'Золотой светлый', ce: 'Деши къегина' },
  accentDeep: { ru: 'Золотой тёмный', ce: 'Деши бодане' },
  ui: { ru: 'Главный цвет (кнопки, меню)', ce: 'Коьрта бос (кнопкаш, меню)' },
  danger: { ru: 'Опасное действие', ce: 'Кхерамен гIуллакх' },

  statusAuto: { ru: 'Статус «Автоматический»', ce: '«Автоматан раж»' },
  statusActive: { ru: 'Статус «Работает»', ce: '«Болх беш ву»' },
  statusBreak: { ru: 'Статус «Перерыв»', ce: '«Сацар»' },
  statusFlexible: { ru: 'Статус «Произвольный»', ce: '«Мукъа график»' },
  statusOffline: { ru: 'Статус «Не работает»', ce: '«Болх ца бо»' },
  roleSpecialist: { ru: 'Бейдж «Специалист»', ce: '«Говзанча»' },
  roleAdmin: { ru: 'Бейдж «Админ»', ce: '«Админ»' },
  roleVerified: { ru: 'Бейдж «Проверен»', ce: '«ТIечIагIдина»' },
  heroFrom: { ru: 'Шапка каталога (начало)', ce: 'МогIаман корта (юьхь)' },
  heroTo: { ru: 'Шапка каталога (конец)', ce: 'МогIаман корта (чаккхе)' },
  mapCluster: { ru: 'Кластеры на карте', ce: 'Картин кластераш' },
  mapHouse: { ru: 'Дома на карте', ce: 'Картин цIенош' },
};

/** Смешивание цветов — для производных значений (нижняя точка градиента). */
function mixHex(hex: string, target: string, amount: number): string {
  const from = hex.replace('#', '');
  const to = target.replace('#', '');
  const channel = (index: number) => {
    const a = parseInt(from.slice(index * 2, index * 2 + 2), 16);
    const b = parseInt(to.slice(index * 2, index * 2 + 2), 16);
    return Math.round(a + (b - a) * amount).toString(16).padStart(2, '0');
  };
  return `#${channel(0)}${channel(1)}${channel(2)}`;
}

function makeId(): string {
  return `t-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * Выбор и редактирование тем.
 *
 * Готовые темы не редактируются — их можно только взять за основу
 * («Создать свою»). Иначе пользователь сломал бы светлую тему и не
 * смог бы к ней вернуться.
 */
export default function ThemeEditor() {
  const { t, language } = useI18n();
  const { settings, update } = useSettings();
  const [editingId, setEditingId] = useState<string | null>(null);
  // Раскрыта одна группа за раз: 22 поля сразу — стена, в которой
  // ничего не найти.
  const [openGroup, setOpenGroup] = useState<ThemeColorGroup | null>('global');

  const editing = settings.customThemes.find((theme) => theme.id === editingId) ?? null;
  const canAddMore = settings.customThemes.length < MAX_CUSTOM_THEMES;

  const selectTheme = (themeId: string) => update({ themeId });

  const createTheme = () => {
    if (!canAddMore) return;
    // За основу берём текущую тему: правки идут от того, что человек
    // уже видит, а не от случайной палитры.
    const base = settings.themeId.startsWith('custom:')
      ? settings.customThemes.find((x) => `custom:${x.id}` === settings.themeId)
      : undefined;
    const source = base
      ? { isDark: base.isDark, glass: base.glass, colors: base.colors }
      : PRESET_THEMES[settings.themeId] ?? PRESET_THEMES.dark;

    const created: CustomTheme = {
      id: makeId(),
      name: `${t.settingsThemeMine} ${settings.customThemes.length + 1}`,
      isDark: source.isDark,
      // Стеклянный режим тоже наследуем: копия «Стеклянной» без него
      // выглядела бы совсем иначе, чем оригинал.
      glass: source.glass === true,
      colors: { ...source.colors },
    };
    update({
      customThemes: [...settings.customThemes, created],
      themeId: `custom:${created.id}`,
    });
    setEditingId(created.id);
  };

  const patchTheme = (id: string, patch: Partial<CustomTheme>) => {
    update({
      customThemes: settings.customThemes.map((theme) =>
        theme.id === id ? { ...theme, ...patch } : theme),
    });
  };

  const removeTheme = (id: string) => {
    const rest = settings.customThemes.filter((theme) => theme.id !== id);
    update({
      customThemes: rest,
      // Удалили активную — возвращаемся к тёмной, иначе ссылка повиснет.
      themeId: settings.themeId === `custom:${id}` ? 'dark' : settings.themeId,
    });
    if (editingId === id) setEditingId(null);
  };

  return (
    <section>
      <SectionTitle title={t.settingsThemes} hint={t.settingsThemesHint} />

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {Object.entries(PRESET_THEMES).map(([id, theme]) => (
          <ThemeCard
            key={id}
            name={language === 'ce' ? theme.name : theme.name}
            colors={theme.colors}
            isSelected={settings.themeId === id}
            onSelect={() => selectTheme(id)}
          />
        ))}

        {settings.customThemes.map((theme) => (
          <ThemeCard
            key={theme.id}
            name={theme.name}
            colors={theme.colors}
            isSelected={settings.themeId === `custom:${theme.id}`}
            onSelect={() => selectTheme(`custom:${theme.id}`)}
            onEdit={() => setEditingId(editingId === theme.id ? null : theme.id)}
            onDelete={() => removeTheme(theme.id)}
          />
        ))}

        {canAddMore && (
          <button
            type="button"
            onClick={createTheme}
            className="flex min-h-[76px] flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-slate-300 text-[11px] font-bold text-slate-500 transition hover:bg-slate-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800/60"
          >
            <Plus className="h-4 w-4" />
            {t.settingsThemeCreate}
          </button>
        )}
      </div>

      <p className="mt-1.5 text-[10px] text-slate-400 dark:text-zinc-500">
        {t.settingsThemeLimit}: {settings.customThemes.length} / {MAX_CUSTOM_THEMES}
      </p>

      {editing && (
        <div className="smk-field mt-3 space-y-3 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={editing.name}
              onChange={(e) => patchTheme(editing.id, { name: e.target.value.slice(0, 40) })}
              maxLength={40}
              aria-label={t.settingsThemeName}
              className="min-w-0 flex-1 rounded-lg bg-white px-2.5 py-1.5 text-xs font-bold text-slate-900 outline-none focus:ring-2 focus:ring-emerald-500 dark:bg-zinc-800 dark:text-white"
            />
            <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-[11px] font-bold text-slate-600 dark:text-zinc-300">
              <input
                type="checkbox"
                checked={editing.isDark}
                onChange={(e) => {
                  // Основа задаёт НАПРАВЛЕНИЕ всех формул: на тёмной
                  // поверхности идут вверх от почти чёрного, текст
                  // светлый, на светлой — зеркально. Раньше галочка
                  // меняла только флаг, а цвета оставались от прошлой
                  // основы: тема получала светлый текст на светлом фоне
                  // и выглядела сломанной. Пересчитываем палитру от
                  // того же главного цвета.
                  const isDark = e.target.checked;
                  patchTheme(editing.id, {
                    isDark,
                    colors: normalizeColors(
                      { ...derivePalette(editing.colors.ui, isDark), ui: editing.colors.ui },
                      editing.colors,
                    ),
                  });
                }}
                className="h-3.5 w-3.5 rounded accent-emerald-600"
              />
              {t.settingsThemeDark}
            </label>
            <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-[11px] font-bold text-slate-600 dark:text-zinc-300">
              <input
                type="checkbox"
                checked={editing.glass === true}
                onChange={(e) => patchTheme(editing.id, { glass: e.target.checked })}
                className="h-3.5 w-3.5 rounded accent-emerald-600"
              />
              {t.settingsThemeGlass}
            </label>
          </div>

          {/* Главный цвет — вход в тему одним движением. Человек задаёт
              намерение («тема будет фиолетовой»), остальные 25 слотов
              считаются по формулам из lib/settings/derive.ts, а тонкие
              правки остаются доступными в группах ниже. Так устроены
              Material You и Radix Colors: собрать согласованную палитру
              по 25 пикерам вручную почти невозможно. */}
          <div className="smk-sheet-row p-2.5">
            <div className="flex items-center gap-1.5">
              <span className="min-w-0 flex-1 truncate text-[11px] font-bold uppercase tracking-wide text-slate-700 dark:text-zinc-300">
                {language === 'ce' ? MAIN_COLOR.ce : MAIN_COLOR.ru}
              </span>
              <HintMark text={MAIN_COLOR.hint} />
            </div>

            <div className="mt-2 flex items-center gap-2">
              <input
                type="color"
                value={editing.colors.ui}
                onChange={(e) => {
                  const ui = e.target.value;
                  patchTheme(editing.id, {
                    colors: normalizeColors(
                      { ...derivePalette(ui, editing.isDark), ui },
                      editing.colors,
                    ),
                  });
                }}
                aria-label={language === 'ce' ? MAIN_COLOR.ce : MAIN_COLOR.ru}
                className="h-9 w-14 shrink-0 cursor-pointer rounded-lg border-0 bg-transparent p-0"
              />
              {/* Предпросмотр выводимых цветов: видно, что поменяется,
                  до нажатия. Порядок — от полотна к акценту. */}
              <div className="flex min-w-0 flex-1 gap-1">
                {(['bg', 'card', 'divider', 'text', 'muted', 'accent'] as Array<keyof ThemeColors>).map((key) => (
                  <span
                    key={key}
                    title={language === 'ce' ? COLOR_LABELS[key]?.ce : COLOR_LABELS[key]?.ru}
                    className="h-6 min-w-0 flex-1 rounded-md ring-1 ring-black/10 dark:ring-white/10"
                    style={{ background: editing.colors[key] }}
                  />
                ))}
              </div>
            </div>

            <p className="mt-1.5 text-[10px] leading-relaxed text-slate-500 dark:text-zinc-500">
              {language === 'ce' ? MAIN_COLOR.noteCe : MAIN_COLOR.noteRu}
            </p>
          </div>

          {/* Три группы: правки по смыслу, а не сплошной список из 22
              полей, в котором невозможно найти нужное. */}
          {(Object.keys(THEME_COLOR_GROUPS) as ThemeColorGroup[]).map((group) => {
            const isOpen = openGroup === group;
            return (
              <div key={group} className="smk-sheet-row p-2">
                {/* HintMark — самостоятельная кнопка, поэтому она НЕ может
                    лежать внутри кнопки-заголовка: вложенный <button>
                    невалиден в HTML и ломает гидратацию. Раскладываем
                    в ряд: кликабельный заголовок + отдельный значок. */}
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setOpenGroup(isOpen ? null : group)}
                    aria-expanded={isOpen}
                    className="flex min-w-0 flex-1 items-center justify-between gap-2 text-left"
                  >
                    <span className="truncate text-[11px] font-bold uppercase tracking-wide text-slate-700 dark:text-zinc-300">
                      {language === 'ce' ? GROUP_TITLES[group].ce : GROUP_TITLES[group].ru}
                    </span>
                    <ChevronDown
                      className={`h-3.5 w-3.5 shrink-0 text-slate-400 transition ${isOpen ? 'rotate-180' : ''}`}
                    />
                  </button>
                  <HintMark text={GROUP_TITLES[group].hint} />
                </div>

                {isOpen && (
                  <div className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                    {THEME_COLOR_GROUPS[group].map((key) => (
                      <label
                        key={key}
                        className="flex items-center justify-between gap-2 rounded-lg bg-white px-2.5 py-1.5 dark:bg-zinc-800"
                      >
                        <span className="truncate text-[11px] font-semibold text-slate-600 dark:text-zinc-300">
                          {language === 'ce' ? COLOR_LABELS[key]?.ce : COLOR_LABELS[key]?.ru}
                        </span>
                        <input
                          type="color"
                          value={editing.colors[key]}
                          onChange={(e) => {
                            const next = { ...editing.colors, [key]: e.target.value };
                            // cardAlt — нижняя точка градиента карточки.
                            // Его нет в редакторе, поэтому держим его
                            // сцепленным с card, иначе при смене карточки
                            // снизу оставался бы цвет от прошлой темы.
                            if (key === 'card') {
                              next.cardAlt = mixHex(
                                e.target.value,
                                editing.isDark ? '#000000' : '#ffffff',
                                0.16,
                              );
                              // Обводка и разделители выводятся из карточки
                              // по фиксированным правилам (см. lib/settings/
                              // derive.ts). Пересчитываем их здесь же, иначе
                              // после смены карточки линии остались бы от
                              // прошлого цвета. Оба слота открыты в
                              // редакторе: значение можно поправить руками
                              // следующим кликом.
                              next.cardLine = deriveCardLine(e.target.value);
                              next.divider = deriveDivider(e.target.value, editing.isDark);
                              next.panel = derivePanel(e.target.value, editing.isDark);
                              next.cardInset = deriveCardInset(e.target.value, editing.isDark);
                            }
                            patchTheme(editing.id, {
                              colors: normalizeColors(next, editing.colors),
                            });
                          }}
                          aria-label={language === 'ce' ? COLOR_LABELS[key]?.ce : COLOR_LABELS[key]?.ru}
                          className="h-6 w-10 shrink-0 cursor-pointer rounded border-0 bg-transparent p-0"
                        />
                      </label>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          <button
            type="button"
            onClick={() => setEditingId(null)}
            className="w-full rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-emerald-700"
          >
            {t.settingsThemeDone}
          </button>
        </div>
      )}
    </section>
  );
}

/** Плитка темы: превью из четырёх цветов, выбор, правка, удаление. */
function ThemeCard({
  name,
  colors,
  isSelected,
  onSelect,
  onEdit,
  onDelete,
}: {
  name: string;
  colors: ThemeColors;
  isSelected: boolean;
  onSelect: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  return (
    <div
      className={`relative overflow-hidden rounded-xl p-2 transition ${
        isSelected
          ? 'ring-2 ring-emerald-500'
          : 'ring-1 ring-slate-200 hover:ring-slate-300 dark:ring-zinc-700 dark:hover:ring-zinc-600'
      }`}
      style={{ background: colors.bg }}
    >
      <button type="button" onClick={onSelect} className="block w-full text-left">
        <span className="mb-1.5 flex gap-1">
          {[colors.card, colors.accent, colors.accentDeep, colors.muted].map((color, index) => (
            <span
              key={index}
              className="h-4 flex-1 rounded"
              style={{ background: color }}
              aria-hidden
            />
          ))}
        </span>
        <span
          className="block truncate text-[11px] font-bold"
          style={{ color: colors.text }}
        >
          {name}
        </span>
      </button>

      <div className="mt-1 flex items-center gap-1">
        {isSelected && (
          <Check className="h-3.5 w-3.5 shrink-0" style={{ color: colors.accent }} />
        )}
        {onEdit && (
          <button
            type="button"
            onClick={onEdit}
            aria-label="Изменить тему"
            className="rounded p-0.5 transition hover:opacity-70"
            style={{ color: colors.muted }}
          >
            <Palette className="h-3.5 w-3.5" />
          </button>
        )}
        {onDelete && (
          <button
            type="button"
            onClick={onDelete}
            aria-label="Удалить тему"
            className="ml-auto rounded p-0.5 text-rose-500 transition hover:opacity-70"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
