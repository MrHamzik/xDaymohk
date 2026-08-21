/**
 * Замок «до гида», который ставится ДО первого кадра (п.2).
 *
 * Проблема, о которой пользователь сообщил трижды. Блокировка жила в
 * React-компоненте (OnboardingModal → useTourLock). Компонент
 * монтируется только после гидратации, а до неё проходит заметное
 * время: грузится и разбирается JS, поднимаются семь провайдеров,
 * читаются настройки. Всё это время страница уже нарисована и на неё
 * можно нажимать и её можно прокручивать.
 *
 * Никакой React-код этот промежуток закрыть не может — он сам внутри
 * него. Поэтому запрет ставит синхронный скрипт в <head>: браузер
 * выполняет его до отрисовки body, и первый же кадр приходит уже
 * заблокированным.
 *
 * Решение принимается по localStorage, потому что сеть спрашивать
 * некогда:
 *
 *   · гость (нет сохранённого аккаунта)      → не запираем, гид не нужен;
 *   · гид уже пройден в этом браузере        → не запираем;
 *   · иначе                                  → запираем и ждём React.
 *
 * React потом снимает или подтверждает замок, когда узнает правду с
 * сервера (OnboardingModal), — см. releaseTourPreflight.
 */

/** Класс на <html>, по которому CSS глушит ввод. */
export const PREFLIGHT_CLASS = 'smk-preflight-lock';

/**
 * Текст скрипта для <head>.
 *
 * Пишется строкой: он обязан выполниться до React и не может
 * импортировать модули. Всё внутри обёрнуто в try — упавший скрипт в
 * <head> заблокировал бы отрисовку страницы целиком.
 */
export const TOUR_PREFLIGHT_SCRIPT = `
(function () {
  try {
    var account = null;
    try { account = window.localStorage.getItem('daymohk-account'); } catch (e) { return; }
    // Гость: гида нет и не будет — сайт работает сразу.
    if (!account) return;

    var id = '';
    try { id = (JSON.parse(account) || {}).id || ''; } catch (e) { return; }
    if (!id) return;

    // Гид уже проходили в этом браузере.
    try {
      if (window.localStorage.getItem('daymohk-tour-' + id) === '1') return;
    } catch (e) {}

    // Настройки этого аккаунта могли сохранить флаг раньше.
    try {
      var raw = window.localStorage.getItem('daymohk-settings-' + id);
      if (raw && JSON.parse(raw).tourDone === true) return;
    } catch (e) {}

    document.documentElement.classList.add('${PREFLIGHT_CLASS}');

    // Предохранитель на случай, если React вообще не поднимется
    // (ошибка сборки, отвалившаяся сеть). Мёртвый сайт хуже
    // пропущенного гида, поэтому через 10 секунд замок спадает сам.
    window.setTimeout(function () {
      document.documentElement.classList.remove('${PREFLIGHT_CLASS}');
    }, 10000);
  } catch (e) {
    // Любая неожиданность — оставляем сайт рабочим.
    try { document.documentElement.classList.remove('${PREFLIGHT_CLASS}'); } catch (e2) {}
  }
})();
`;

/** Снять предварительный замок: дальше решение принимает React. */
export function releaseTourPreflight(): void {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.remove(PREFLIGHT_CLASS);
}
