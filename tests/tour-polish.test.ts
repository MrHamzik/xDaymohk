import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Отчёт пользователя из пяти пунктов по гиду:
 *
 *   1. фон размыт, но не затемнён;
 *   3. гид появляется и исчезает слишком резко;
 *   4. на шаге оформления нельзя сменить тему — клики «сквозь» модалку;
 *   5. меню «+» открывается само.
 *
 * Окружение тестов — node без DOM, поэтому проверяем устройство
 * исходников: вернуть любую из этих поломок теперь нельзя молча.
 */

const root = process.cwd();
const firstTour = readFileSync(join(root, 'components/FirstTour.tsx'), 'utf8');
const spotlight = readFileSync(join(root, 'components/TourSpotlight.tsx'), 'utf8');
const effects = readFileSync(join(root, 'app/styles/effects.css'), 'utf8');

describe('п.1 — фон затемняется, а не только размывается', () => {
  it('слой затемнения не обрезает тень выреза', () => {
    // Затемнение рисует тень 9999px вокруг «дырки». Родитель с inset-0
    // обрезал её у края экрана: когда подсвеченная кнопка стоит
    // вплотную к границе, с этой стороны затемнение пропадало.
    expect(effects).toContain('.smk-tour-spotlight');
    const rule = effects.slice(effects.indexOf('.smk-tour-spotlight'));
    expect(rule.slice(0, 200)).toContain('overflow: visible');
  });

  it('шаг без подсветки затемняет экран целиком', () => {
    expect(spotlight).toContain('bg-zinc-950/70');
  });

  it('размытие и затемнение — разные слои и оба на месте', () => {
    expect(effects).toContain('.smk-tour-blur');
    expect(effects).toContain('backdrop-filter: blur');
    expect(effects).toMatch(/\.smk-tour-hole\s*\{[\s\S]*?box-shadow:[\s\S]*?9999px/);
  });
});

describe('п.3 — гид появляется и уходит плавно', () => {
  it('вырез переезжает с переходом, а не прыгает', () => {
    // Берём именно ПЕРВЫЙ блок правила `.smk-tour-hole { ... }`, а не
    // произвольный срез от первого вхождения строки: выше по файлу
    // имя класса встречается ещё и в тексте комментария.
    const rule = effects.match(/\.smk-tour-hole\s*\{([\s\S]*?)\}/);
    expect(rule, 'правило .smk-tour-hole не найдено').not.toBeNull();
    expect(rule?.[1]).toContain('transition');
  });

  it('слои и карточка шага появляются анимацией', () => {
    expect(effects).toContain('@keyframes smk-tour-fade-in');
    expect(effects).toContain('@keyframes smk-tour-step-in');
    expect(spotlight).toContain('smk-tour-fade');
    expect(firstTour).toContain('smk-tour-step-in');
  });

  it('карточка перезапускает анимацию на каждом шаге', () => {
    // Без key React переиспользует узлы, класс с animation считается
    // «уже проигранным», и текст шага подменяется рывком.
    expect(firstTour).toMatch(/key=\{index\}[\s\S]{0,80}smk-tour-step-in/);
  });

  it('цель следующего шага ждём несколько кадров, а не гасим подсветку', () => {
    // Кнопка нового шага может быть ещё не отрисована. Раньше в этот
    // момент вырез сбрасывался в null — экран резко темнел целиком.
    expect(spotlight).toContain('requestAnimationFrame');
    expect(spotlight).toMatch(/retryUntil|RETRY_MS/);
  });

  it('уважается системная настройка «меньше движения»', () => {
    expect(effects).toContain('prefers-reduced-motion');
  });
});

describe('п.4 — тему на шаге оформления можно выбрать', () => {
  it('шаг оформления не использует выпадающий список-портал', () => {
    // ThemePickerButton рисует список порталом в body. Портал во время
    // гида — источник постоянных поломок: его надо отдельно помечать
    // для блокировки, отдельно позиционировать и отдельно закрывать.
    // Проверяем импорт и использование, а не упоминание: в коде остался
    // комментарий, объясняющий, почему портала здесь больше нет.
    expect(firstTour).not.toMatch(/import\s+ThemePickerButton/);
    expect(firstTour).not.toContain('<ThemePickerButton');
  });

  it('светлая и тёмная — обычные кнопки прямо в карточке', () => {
    expect(firstTour).toContain('themeLightShort');
    expect(firstTour).toContain('themeDarkShort');
    expect(firstTour).toMatch(/onClick=\{\(\) => update\(\{ themeId: option\.id \}\)\}/);
  });

  it('выбранная тема видна с клавиатуры и скринридера', () => {
    expect(firstTour).toContain('aria-pressed');
  });
});

describe('п.5 — меню «+» не открывается само', () => {
  it('гид не шлёт команду plus-open', () => {
    // Шаг просит НАЖАТЬ на «+». Раньше «Дальше» открывала меню сама,
    // и человеку было нечего нажимать.
    expect(firstTour).not.toContain("sendTourCommand('plus-open')");
  });

  it('во всём коде нет ни одного отправителя plus-open', () => {
    for (const file of [
      'components/CreateActionModal.tsx',
      'components/MobileMenuDrawer.tsx',
      'components/BottomNav.tsx',
      'components/SidebarNav.tsx',
    ]) {
      let source = '';
      try {
        source = readFileSync(join(root, file), 'utf8');
      } catch {
        continue; // файла может не быть — это не повод падать
      }
      expect(source, `${file} шлёт plus-open`).not.toContain("sendTourCommand('plus-open')");
    }
  });
});
