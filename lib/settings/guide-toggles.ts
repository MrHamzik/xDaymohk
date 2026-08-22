/**
 * Автореестр тумблеров, которые показываются в одноразовой подсказке
 * о сохранении прогресса и в шаге гида про настройки (п.4 замечаний
 * 23.08). Новый тумблер = новая строка здесь — оба места пополняются
 * автоматически, без правки модалок.
 */
export interface GuideToggle {
  /** Ключ поля UserSettings. */
  id: 'readingAutosave';
  labelKey: 'settingsReadingAutosave';
  hintKey: 'settingsReadingAutosaveHint';
  /** Ключ подсказки «?» (необязательно). */
  noteKey?: 'readTipSearchNote';
}

export const GUIDE_TOGGLES: GuideToggle[] = [
  {
    id: 'readingAutosave',
    labelKey: 'settingsReadingAutosave',
    hintKey: 'settingsReadingAutosaveHint',
    noteKey: 'readTipSearchNote',
  },
];
