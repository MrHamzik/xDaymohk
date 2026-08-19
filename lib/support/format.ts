/**
 * Формат обращений в поддержку: как собирается текст жалобы по спору и
 * как он разбирается обратно для показа.
 *
 * Зачем модуль. Жалоба по спорному заданию отправляется одной строкой в
 * `support_questions.question` — схему поддержки под один сценарий
 * менять не стали. Но сырая строка вида
 *
 *   [Спор по заданию #task-123] Название: … Награда: 50 ₽ Роль: … текст
 *
 * в админ-панели читалась как «простыня»: всё в одну строчку, глазом не
 * зацепиться. Здесь она разбирается на поля, чтобы интерфейс показал
 * их таблицей, а не сплошным текстом.
 *
 * Формат намеренно простой и построчный: «Ключ: значение», затем пустая
 * строка и свободный текст. Парсер терпим к чужим строкам — всё, что не
 * распозналось, уходит в `text`, поэтому обычные вопросы из «Помощи»
 * проходят через него без потерь.
 */

/**
 * Орнаментальный разделитель между вопросом и ответом администратора.
 *
 * Тот же ромб, что в графических разделителях интерфейса (.smk-orn).
 * Текст письма рендерится с `whitespace-pre-wrap`, поэтому разделитель
 * виден как отдельная строка и не склеивается с абзацами.
 */
export const SUPPORT_ANSWER_DIVIDER = '─────────  ◆  ─────────';

/** Разобранное обращение по спорному заданию. */
export interface ParsedDispute {
  /** Идентификатор задания без решётки. */
  taskId: string;
  /** Название задания на момент жалобы. */
  title?: string;
  /** Награда строкой, как её видел заявитель. */
  reward?: string;
  /** «заказчик» или «исполнитель». */
  role?: string;
  /** Причина отказа, если заказчик её указывал. */
  rejectReason?: string;
  /** Свободный текст, который написал человек. */
  text: string;
}

/** Заголовок жалобы: `[Спор по заданию #<id>]`. */
const DISPUTE_HEAD = /^\[Спор по заданию #([^\]]+)\]\s*/;

const FIELDS: Array<[keyof ParsedDispute, RegExp]> = [
  ['title', /^Название:\s*(.*)$/],
  ['reward', /^Награда:\s*(.*)$/],
  ['role', /^Роль заявителя:\s*(.*)$/],
  ['rejectReason', /^Причина отказа:\s*(.*)$/],
];

/**
 * Разобрать обращение. Возвращает null, если это обычный вопрос, а не
 * жалоба по заданию — тогда интерфейс показывает его как есть.
 */
export function parseDisputeQuestion(raw: string): ParsedDispute | null {
  const source = String(raw ?? '');
  const head = source.match(DISPUTE_HEAD);
  if (!head) return null;

  const result: ParsedDispute = { taskId: head[1].trim(), text: '' };
  const rest: string[] = [];

  for (const line of source.slice(head[0].length).split('\n')) {
    const matched = FIELDS.find(([, re]) => re.test(line.trim()));
    if (matched) {
      const value = line.trim().match(matched[1])?.[1]?.trim();
      if (value) (result[matched[0]] as string) = value;
      continue;
    }
    rest.push(line);
  }

  result.text = rest.join('\n').trim();
  return result;
}

/**
 * Разделить сохранённый текст на вопрос и ответ администратора.
 *
 * Нужно там, где вопрос и ответ лежат в одной строке (текст письма).
 * Если разделителя нет — значит ответа ещё не было.
 */
export function splitAnswer(raw: string): { question: string; answer: string } {
  const source = String(raw ?? '');
  const index = source.indexOf(SUPPORT_ANSWER_DIVIDER);
  if (index === -1) return { question: source.trim(), answer: '' };
  return {
    question: source.slice(0, index).trim(),
    answer: source.slice(index + SUPPORT_ANSWER_DIVIDER.length).trim(),
  };
}

/** Короткий идентификатор обращения для списка: `#a1b2c3`. */
export function shortRequestId(id: string): string {
  const clean = String(id ?? '').replace(/[^a-z0-9]/gi, '');
  return `#${clean.slice(-6).toLowerCase()}`;
}
