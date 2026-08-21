import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Гид: интерфейс заблокирован по умолчанию (п.17/п.18).
 *
 * Прямое требование было такое: «не плети сложные системы — просто
 * отключи любое взаимодействие на этапе гида и на каждом шаге открывай
 * необходимые возможности». Здесь это требование закреплено тестом,
 * чтобы следующая правка гида его не растеряла.
 *
 * Окружение тестов — node без DOM, поэтому проверяем не поведение
 * обработчиков, а устройство исходников: какие шаги что разрешают и
 * не вернулись ли старые слои-ловушки, из-за которых всё и ломалось.
 */

const root = process.cwd();
const firstTour = readFileSync(join(root, 'components/FirstTour.tsx'), 'utf8');
const spotlight = readFileSync(join(root, 'components/TourSpotlight.tsx'), 'utf8');
const lock = readFileSync(join(root, 'lib/tour-lock.ts'), 'utf8');

describe('блокировка интерфейса на время гида', () => {
  it('гид подключает useTourLock и держит его включённым всегда', () => {
    expect(firstTour).toContain("import { useTourLock } from '@/lib/tour-lock'");
    // active: true без условий — запрет не должен зависеть от шага.
    expect(firstTour).toMatch(/useTourLock\(\{\s*active:\s*true/);
  });

  it('запрет висит на document в фазе перехвата, а не на слое с z-index', () => {
    // Именно capture делает запрет независимым от порталов и z-index:
    // прежние слои-ловушки перекрывались любым окном сверху.
    expect(lock).toMatch(/document\.addEventListener\([^)]*true\)/);
    expect(lock).toContain('stopImmediatePropagation');
    // preventDefault на wheel/touchmove работает только при passive: false.
    expect(lock).toContain('passive: false');
  });

  it('прокрутка и клики разрешаются только явным списком', () => {
    expect(lock).toContain('scroll = false');
    expect(lock).toContain('data-tour-ui');
  });

  it('Escape не блокируется — аварийный выход остаётся у человека', () => {
    expect(lock).toContain("event.key === 'Escape'");
  });
});

describe('шаги с заданием открывают ровно то, что просят', () => {
  /** Кусок исходника одного шага — от заголовка до следующего. */
  function stepBlock(awaits: string): string {
    const marker = `awaits: '${awaits}' as const`;
    const at = firstTour.indexOf(marker);
    expect(at, `шаг ${awaits} не найден`).toBeGreaterThan(-1);
    return firstTour.slice(at, at + 700);
  }

  it('шаг «Каталог»: прокрутка и открытие анкет, остальное закрыто', () => {
    const block = stepBlock('catalog-scroll');
    expect(block).toContain('scroll: true');
    expect(block).toContain('data-tour-card');
    expect(block).toContain('role="dialog"');
  });

  it('шаг «Меню»: только прокрутка, никаких иконок и шторок', () => {
    const block = stepBlock('menu-scroll');
    expect(block).toContain('scroll: true');
    // Разрешена лишь кнопка, открывающая меню: ни разделов, ни закрытия.
    expect(block).toContain('[data-tour="menu"]');
    expect(block).not.toContain('data-tour-card');
  });

  it('шаг «Плюс»: окно плюса живое, прокрутки нет', () => {
    const block = stepBlock('plus');
    expect(block).toContain('scroll: false');
    expect(block).toContain('data-tour-plus');
  });
});

describe('старые обходные решения не вернулись', () => {
  it('подсветка больше не рисует слои-ловушки и не трогает прокрутку', () => {
    // Ловушки перекрывались окнами сверху, а на шаге с каталогом
    // снимались целиком — тогда нажималось всё подряд.
    expect(spotlight).not.toContain('pointer-events-auto absolute inset-x-0');
    expect(spotlight).not.toContain("root.style.overflow = 'hidden'");
    // Подсветка — только картинка, поведение задаёт useTourLock.
    expect(spotlight).not.toContain('interactive');
  });

  it('шаг каталога не засчитывается без настоящей прокрутки', () => {
    // Пустой каталог короче экрана, и условие «мы внизу» срабатывало
    // при scrollY = 0: модалка возвращалась сразу после нажатия.
    expect(firstTour).toContain('MIN_SCROLL');
    expect(firstTour).toMatch(/atBottom && scrolled >= MIN_SCROLL/);
  });

  it('гид переживает перезагрузку страницы', () => {
    expect(firstTour).toContain('daymohk-tour-step');
    expect(firstTour).toContain('sessionStorage');
  });
});
