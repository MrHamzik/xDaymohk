/**
 * Чистые правила поведения разделов чтения (Этап 2).
 *
 * Всё, что можно проверить без браузера и базы, собрано здесь:
 * решение об открытии главы, режимы автосохранения, процент
 * прокрутки, фрагменты поиска. Компоненты только вызывают эти функции
 * — логика ТЗ живёт в одном месте и покрыта тестами.
 */

/** Сохранённая точка чтения раздела. */
export interface SavedMark {
  chapterId: string;
  /** Процент прочитанного, 0..100. */
  scroll: number;
  titleRu: string;
  titleCe: string;
  chapterNumber: string;
}

/** Откуда пользователь открывает главу. */
export type ChapterOpenSource =
  | 'toc'      // клик по оглавлению
  | 'next'     // кнопка «Следующая глава»
  | 'banner'   // «Продолжить» в баннере раздела (п.5)
  | 'home'     // «Продолжить чтение» на главной (п.4)
  | 'search';  // переход из результатов поиска (п.7)

export type ChapterOpenAction =
  | 'open'            // открыть главу как обычно
  | 'restore-scroll'  // открыть и прокрутить к сохранённой позиции
  | 'modal';          // спросить: это не сохранённая глава (п.6)

/**
 * Как открыть выбранную главу.
 *
 * - поиск (п.7) — всегда режим исследования: без модалки и без
 *   записи прогресса;
 * - сохранённого прогресса ещё нет — любая глава открывается как
 *   обычно и становится сохранённой (п.3: состояние формируется
 *   после первого открытия главы);
 * - сохранённая глава (или переход из баннера/с главной, они всегда
 *   указывают на неё) — открывается с восстановлением позиции;
 * - любая другая глава из оглавления или кнопкой «Следующая» —
 *   модальное окно (п.6: «появляется каждый раз»).
 */
export function chapterOpenAction(
  savedChapterId: string | null,
  targetId: string,
  source: ChapterOpenSource,
): ChapterOpenAction {
  if (source === 'search') return 'open';
  if (!savedChapterId) return 'open';
  if (targetId === savedChapterId) return 'restore-scroll';
  if (source === 'banner' || source === 'home') return 'restore-scroll';
  return 'modal';
}

/** Режим просмотра раздела. */
export type ReadingMode = 'normal' | 'explore';

/**
 * Можно ли сейчас автосохранять прогресс.
 *
 * Автосохранение работает только при обычном чтении (п.9): в режиме
 * исследования (из модалки п.6 или из поиска п.7) сохранённая точка
 * остаётся нетронутой. У гостей нет чекбокса настроек — их закладки
 * пишутся локально всегда при обычном чтении.
 */
export function autosaveAllowed(
  mode: ReadingMode,
  autosaveEnabled: boolean,
  isGuest: boolean,
): boolean {
  if (mode !== 'normal') return false;
  return isGuest || autosaveEnabled;
}

/** Процент прочитанного в допустимых границах. */
export function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

/**
 * Процент прокрутки относительно блока главы: середина экрана как
 * точка отсчёта. Монотонна по скроллу, устойчива к правкам текста
 * (в отличие от привязки к абзацу) — п.3 ТЗ.
 */
export function articleScrollPercent(
  articleTop: number,
  articleHeight: number,
  scrollY: number,
  viewportHeight: number,
): number {
  if (articleHeight <= 0) return 0;
  const center = scrollY + viewportHeight / 2;
  return clampPercent(((center - articleTop) / articleHeight) * 100);
}

/** Обратная операция: куда прокрутить окно, чтобы вернуть процент. */
export function scrollToPercent(
  articleTop: number,
  articleHeight: number,
  percent: number,
  viewportHeight: number,
): number {
  const target = articleTop + (clampPercent(percent) / 100) * articleHeight - viewportHeight / 2;
  return Math.max(0, target);
}

export interface Snippet {
  before: string;
  match: string;
  after: string;
}

/**
 * Фрагмент текста вокруг первого вхождения запроса (без учёта
 * регистра). Возвращает части до/совпадение/после — клиент подсвечивает
 * совпадение тегом <mark>, не трогая innerHTML.
 */
export function buildSnippet(text: string, query: string, radius = 70): Snippet | null {
  if (!text || !query) return null;
  const index = text.toLowerCase().indexOf(query.toLowerCase());
  if (index < 0) return null;

  const start = Math.max(0, index - radius);
  const end = Math.min(text.length, index + query.length + radius);

  return {
    before: `${start > 0 ? '…' : ''}${text.slice(start, index)}`,
    match: text.slice(index, index + query.length),
    after: `${text.slice(index + query.length, end)}${end < text.length ? '…' : ''}`,
  };
}

/**
 * Экранирование служебных символов для шаблона ILIKE: пользовательский
 * запрос не должен превращаться в маску с «любой строкой».
 */
export function escapeLikePattern(query: string): string {
  return query.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

/**
 * Подсказка «на какой главе остановились» для главной и баннера:
 * «Глава 3. Аят 15» по ТЗ — номер (если есть) + заголовок.
 */
export function formatSavedHint(
  mark: Pick<SavedMark, 'titleRu' | 'titleCe' | 'chapterNumber'>,
  language: 'ru' | 'ce',
  chapterWord: string,
): string {
  const title = (language === 'ce' ? mark.titleCe : mark.titleRu)
    || mark.titleRu || mark.titleCe;
  const number = mark.chapterNumber.trim();
  if (!number) return title;
  return `${chapterWord} ${number}. ${title}`;
}
