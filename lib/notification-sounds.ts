/**
 * Звуки уведомлений — синтез через Web Audio API, без файлов.
 *
 * Почему без mp3. Файлы пришлось бы искать под свободной лицензией,
 * хранить в репозитории и тянуть по сети при каждом заходе. Синтез
 * ничего не весит, работает оффлайн и звучит одинаково на всех
 * устройствах. Если позже захочется «живые» звуки, интерфейс менять не
 * придётся: playSound() останется той же точкой входа.
 *
 * Звуки короткие (до ~0.4 с) и негромкие: уведомление не должно пугать
 * человека в мечети или на встрече. Громкость по умолчанию 0.3 от
 * максимума и настраивается пользователем.
 */

/** Идентификатор звука, хранится в настройках. */
export type SoundId =
  | 'none'
  | 'chime'
  | 'ding'
  | 'double'
  | 'soft'
  | 'alert'
  | 'drop';

export const SOUND_IDS: SoundId[] = [
  'none', 'chime', 'ding', 'double', 'soft', 'alert', 'drop',
];

/** Один тон: частота (Гц), задержка от начала, длительность, громкость. */
interface Tone {
  freq: number;
  at: number;
  dur: number;
  gain?: number;
  type?: OscillatorType;
}

/**
 * Партитуры звуков.
 *
 * Подобраны так, чтобы различаться на слух ЗА ОДНО нажатие, а не при
 * сравнении: разный интервал (терция, квинта), разное число тонов и
 * разная форма волны. Одинаковые по настроению сигналы человек бы не
 * различил и настройка стала бы бессмысленной.
 */
const SCORES: Record<Exclude<SoundId, 'none'>, Tone[]> = {
  // Мягкий колокольчик: две ноты вверх, чистый синус.
  chime: [
    { freq: 880, at: 0, dur: 0.18 },
    { freq: 1318.5, at: 0.09, dur: 0.26 },
  ],
  // Одиночный короткий сигнал — нейтральный, для частых событий.
  ding: [
    { freq: 1046.5, at: 0, dur: 0.16 },
  ],
  // Двойной клик: заметнее одиночного, но не тревожный.
  double: [
    { freq: 987.8, at: 0, dur: 0.1 },
    { freq: 987.8, at: 0.13, dur: 0.12 },
  ],
  // Тихий низкий тон: для фоновых событий, почти незаметен.
  soft: [
    { freq: 523.3, at: 0, dur: 0.22, gain: 0.6, type: 'triangle' },
  ],
  // Тревожный: две ноты ВНИЗ, так слух читает «внимание».
  alert: [
    { freq: 880, at: 0, dur: 0.14, type: 'square', gain: 0.5 },
    { freq: 587.3, at: 0.14, dur: 0.22, type: 'square', gain: 0.5 },
  ],
  // «Капля»: быстрый спад, хорошо подходит для завершённых действий.
  drop: [
    { freq: 1318.5, at: 0, dur: 0.08 },
    { freq: 659.3, at: 0.06, dur: 0.24, type: 'triangle' },
  ],
};

/** Общая громкость: тихо по умолчанию, звук не должен пугать. */
const BASE_GAIN = 0.3;

let ctx: AudioContext | null = null;

/**
 * Контекст создаём лениво и переиспользуем.
 *
 * Браузеры запрещают автозапуск звука до первого действия человека,
 * поэтому контекст может оказаться в состоянии 'suspended' — пробуем
 * возобновить, но молча: неудача не должна ронять интерфейс.
 */
function audioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    const Ctor = window.AudioContext
      ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    if (!ctx) ctx = new Ctor();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/**
 * Проиграть звук по идентификатору.
 *
 * `volume` — 0…1, множитель к базовой громкости. Ошибки гасим: звук
 * приятное дополнение, а не то, ради чего человек открыл приложение.
 */
export function playSound(id: SoundId, volume = 1): void {
  if (id === 'none') return;
  const score = SCORES[id];
  if (!score) return;

  const context = audioContext();
  if (!context) return;

  try {
    const now = context.currentTime;
    for (const tone of score) {
      const osc = context.createOscillator();
      const gain = context.createGain();
      osc.type = tone.type ?? 'sine';
      osc.frequency.value = tone.freq;

      const peak = BASE_GAIN * (tone.gain ?? 1) * Math.min(Math.max(volume, 0), 1);
      const start = now + tone.at;
      const end = start + tone.dur;

      // Плавные атака и затухание: резкий старт даёт щелчок динамика.
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), start + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, end);

      osc.connect(gain);
      gain.connect(context.destination);
      osc.start(start);
      osc.stop(end + 0.02);
    }
  } catch {
    // Звук не критичен — молчим.
  }
}

/** Подписи для настроек. Ключ — SoundId. */
export const SOUND_LABELS: Record<SoundId, { ru: string; ce: string }> = {
  none: { ru: 'Без звука', ce: 'Аз доцуш' },
  chime: { ru: 'Колокольчик', ce: 'ЗозаргIа' },
  ding: { ru: 'Сигнал', ce: 'Сигнал' },
  double: { ru: 'Двойной', ce: 'ШалгIа' },
  soft: { ru: 'Мягкий', ce: 'Кегийра' },
  alert: { ru: 'Тревожный', ce: 'Тидаман' },
  drop: { ru: 'Капля', ce: 'ТIадам' },
};

/**
 * Звук по умолчанию для каждой группы уведомлений.
 *
 * Разные группы — разные звуки, чтобы по одному сигналу понимать, о чём
 * речь, не доставая телефон: задания зовут колокольчиком, жалобы —
 * тревожным, системное — мягким.
 */
export const DEFAULT_GROUP_SOUND: Record<string, SoundId> = {
  system: 'soft',
  profile: 'ding',
  activity: 'drop',
  tasks: 'chime',
  complaint: 'alert',
  taxi: 'double',
};
