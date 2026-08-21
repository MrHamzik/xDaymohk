import { describe, expect, it } from 'vitest';
import { PREFLIGHT_CLASS, TOUR_PREFLIGHT_SCRIPT } from '@/lib/tour-preflight';

/**
 * Замок «до гида» ставится раньше React (п.2).
 *
 * Пользователь трижды сообщил одно и то же: «когда обновляю страницу,
 * пока гид не загрузится, я могу нажимать любые кнопки и скроллить».
 * Причина была в том, что блокировка жила внутри React-компонента и
 * включалась только после гидратации — а до неё страница уже
 * нарисована и полностью рабочая. Закрыть этот промежуток React не
 * может: он сам внутри него.
 *
 * Поэтому запрет ставит синхронный скрипт в <head>. Здесь он
 * исполняется в песочнице с подставным localStorage — проверяем, что
 * решение принимается правильно во всех состояниях.
 */

interface RunResult {
  locked: boolean;
  fuseMs: number | null;
}

/** Выполнить скрипт замка при заданном содержимом localStorage. */
function run(store: Record<string, string>): RunResult {
  const classes = new Set<string>();
  let fuseMs: number | null = null;

  const win = {
    localStorage: {
      getItem: (key: string) => (key in store ? store[key] : null),
    },
    setTimeout: (_fn: () => void, ms: number) => {
      fuseMs = ms;
      return 1;
    },
  };
  const doc = {
    documentElement: {
      classList: {
        add: (c: string) => classes.add(c),
        remove: (c: string) => classes.delete(c),
      },
    },
  };

  // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
  const fn = new Function('window', 'document', TOUR_PREFLIGHT_SCRIPT);
  fn(win, doc);

  return { locked: classes.has(PREFLIGHT_CLASS), fuseMs };
}

const ACCOUNT = JSON.stringify({ id: 'u1' });

describe('кого запирать до загрузки гида', () => {
  it('гостя НЕ запираем: гида у него нет и не будет', () => {
    // Прямое требование: «гостю гид не нужен, поэтому проверяем,
    // не зареган ли сначала».
    expect(run({}).locked).toBe(false);
  });

  it('вошедшего с непройденным гидом запираем', () => {
    expect(run({ 'daymohk-account': ACCOUNT }).locked).toBe(true);
  });

  it('гид пройден в этом браузере — не запираем', () => {
    const store = { 'daymohk-account': ACCOUNT, 'daymohk-tour-u1': '1' };
    expect(run(store).locked).toBe(false);
  });

  it('tourDone в сохранённых настройках — не запираем', () => {
    const store = {
      'daymohk-account': ACCOUNT,
      'daymohk-settings-u1': JSON.stringify({ tourDone: true }),
    };
    expect(run(store).locked).toBe(false);
  });

  it('tourDone=false в настройках — запираем', () => {
    const store = {
      'daymohk-account': ACCOUNT,
      'daymohk-settings-u1': JSON.stringify({ tourDone: false }),
    };
    expect(run(store).locked).toBe(true);
  });
});

describe('скрипт не может сломать сайт', () => {
  /**
   * Скрипт стоит в <head> и выполняется до отрисовки. Если он бросит
   * исключение или запрёт сайт по ошибке, человек увидит мёртвую
   * страницу — это хуже пропущенного гида.
   */
  it('битый JSON аккаунта не запирает и не роняет', () => {
    expect(() => run({ 'daymohk-account': 'не json' })).not.toThrow();
    expect(run({ 'daymohk-account': 'не json' }).locked).toBe(false);
  });

  it('аккаунт без id не запирает', () => {
    expect(run({ 'daymohk-account': '{}' }).locked).toBe(false);
  });

  it('битые настройки не мешают: решает наличие аккаунта', () => {
    const store = { 'daymohk-account': ACCOUNT, 'daymohk-settings-u1': '{{{' };
    expect(() => run(store)).not.toThrow();
    expect(run(store).locked).toBe(true);
  });

  it('у запертого сайта всегда есть предохранитель', () => {
    // React мог не подняться вовсе — замок обязан спасть сам.
    const { locked, fuseMs } = run({ 'daymohk-account': ACCOUNT });
    expect(locked).toBe(true);
    expect(fuseMs).toBe(10_000);
  });
});

describe('окно гида остаётся рабочим под замком', () => {
  it('CSS пропускает data-tour-ui и data-tour-portal', () => {
    const css = readBaseCss();
    expect(css).toContain(`html.${PREFLIGHT_CLASS}`);
    // Без этих исключений нельзя было бы нажать «Дальше» и закрыть
    // подсказку «!» — ровно пп. 1 и 4.
    expect(css).toContain('[data-tour-ui]');
    expect(css).toContain('[data-tour-portal]');
    expect(css).toMatch(/pointer-events:\s*auto/);
  });

  it('замок гасит и прокрутку, и нажатия', () => {
    const css = readBaseCss();
    expect(css).toMatch(/overflow:\s*hidden/);
    expect(css).toMatch(/pointer-events:\s*none/);
  });
});

function readBaseCss(): string {
  // Читаем именно тот файл, что попадает в сборку.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { readFileSync } = require('node:fs') as typeof import('node:fs');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { join } = require('node:path') as typeof import('node:path');
  const css = readFileSync(join(process.cwd(), 'app/styles/base.css'), 'utf8');
  const start = css.indexOf(`html.${PREFLIGHT_CLASS}`);
  return start === -1 ? '' : css.slice(start);
}
