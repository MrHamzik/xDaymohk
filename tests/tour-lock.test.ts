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
    // До начала СЛЕДУЮЩЕГО шага с заданием (раньше окно было 700
    // символов — шаги обросли комментариями и текстами, и проверка
    // стала обрезать чужую разметку).
    const next = firstTour.indexOf("awaits: '", at + marker.length);
    return firstTour.slice(at, next === -1 ? undefined : next);
  }

  it('шаг «Каталог»: прокрутка и открытие анкет, остальное закрыто', () => {
    const block = stepBlock('catalog-scroll');
    expect(block).toContain('scroll: true');
    expect(block).toContain('data-tour-card');
    expect(block).toContain('role="dialog"');
  });

  it('шаг «Каталог» НЕ пускает на карту (п.2)', () => {
    // Жалоба: «из каталога открывается карта, хотя во время гида всё,
    // кроме каталога и анкет, должно быть заблокировано». Карта стояла
    // и в подсветке (marks), и в списке разрешённого (allow) — человек
    // уходил на карту, а гид продолжал ждать прокрутки каталога.
    const block = stepBlock('catalog-scroll');
    expect(block).not.toContain('[data-tour="map"]');
    const marks = block.match(/marks:\s*\[[^\]]*\]/);
    expect(marks, 'marks шага не найдены').not.toBeNull();
    expect(marks?.[0]).not.toContain('map');
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
    // Порог при этом ДОСТИЖИМ на любом экране (правка 2К от 22.08):
    // не больше половины того, что вообще можно проскролить.
    expect(firstTour).toContain('effectiveMinScroll');
    expect(firstTour).toMatch(/atBottom && scrolled >= effectiveMinScroll/);
  });

  it('гид переживает перезагрузку страницы', () => {
    // Прогресс шага переехал из sessionStorage в настройки (БД):
    // закрыв браузер на середине, человек продолжит с того же шага и с
    // другого устройства (миграция 65). Проверяем новый механизм.
    expect(firstTour).toContain('Number(settings.tourStep)');
    expect(firstTour).toContain('update({ tourStep: index })');
  });
});

/**
 * Регрессии, о которых пользователь сообщил ПОВТОРНО (пп. 1, 4).
 *
 * Обе появились из-за самой блокировки: она глушит события в фазе
 * перехвата на document, а всплывающие окна рисуются порталом прямо в
 * body. По дереву DOM они карточке гида не родня, поэтому проверка
 * closest('[data-tour-ui]') их не находила и нажатия съедались:
 * подсказка «!» открывалась и не закрывалась, тема не переключалась.
 */
describe('порталы поверх гида остаются рабочими', () => {
  const primitives = readFileSync(join(root, 'components/settings/SettingsPrimitives.tsx'), 'utf8');
  const themePicker = readFileSync(join(root, 'components/settings/ThemePickerButton.tsx'), 'utf8');
  const controlsBar = readFileSync(join(root, 'components/SettingsControlsBar.tsx'), 'utf8');

  it('блокировка пропускает всё, помеченное data-tour-portal', () => {
    expect(lock).toContain("el.closest('[data-tour-portal]')");
  });

  it('п.1: подсказка «!» и её подложка помечены, иначе её не закрыть', () => {
    // Метка нужна ОБОИМ узлам: подложка ловит клик мимо, всплывашка —
    // клик по самому тексту.
    const marks = primitives.match(/data-tour-portal/g) ?? [];
    expect(marks.length).toBeGreaterThanOrEqual(2);
  });

  it('п.1: подсказка перекрывает карточку гида, а не наоборот', () => {
    // Карточка гида стоит на z-95. Подложка вровень с ней перехватывала
    // бы клик первой, и подсказка снова стала бы незакрываемой.
    expect(primitives).toContain('z-[97]');
    expect(primitives).toContain('z-[98]');
    expect(primitives).not.toContain('z-[95]');
  });

  it('подложка подсказки не ловит фокус в aria-hidden', () => {
    // Кнопка-подложка с aria-hidden получала фокус по клику, и Chrome
    // предупреждал «focused element must not be inside aria-hidden».
    // Подложка — неинтерактивный div, для клавиатуры есть Escape.
    expect(primitives).not.toMatch(/<button[^>]*aria-hidden[\s\S]*?<\/button>/);
    expect(primitives).toContain("event.key === 'Escape'");
  });

  it('п.4: меню выбора темы помечено — иначе тема не меняется', () => {
    expect(themePicker).toContain('data-tour-portal');
  });

  it('п.4: во время гида нельзя уйти в «Создать свою»', () => {
    // Работать должны только светлая и тёмная: ссылка в редактор увела
    // бы человека со страницы посреди обучения.
    expect(themePicker).toContain('useTourActive');
  });

  it('меню рабочего статуса тоже помечено', () => {
    expect(controlsBar).toContain('data-tour-portal');
  });
});

/**
 * п.3: до выяснения, нужен ли гид, интерфейс заперт — но не навсегда.
 */
describe('замок до проверки «гид пройден»', () => {
  const onboarding = readFileSync(join(root, 'components/OnboardingModal.tsx'), 'utf8');

  it('замок включается, пока ответ неизвестен', () => {
    expect(onboarding).toContain('useTourLock');
    expect(onboarding).toContain('undecided');
  });

  it('гость не запирается: его узнают по account === null', () => {
    expect(onboarding).toMatch(/isLoading\s*\|\|/);
    expect(onboarding).toContain('Boolean(account)');
  });

  it('есть аварийный предохранитель — сайт не может остаться мёртвым', () => {
    // Цена ошибки несимметрична: пропущенный гид человек переживёт,
    // намертво запертый сайт — нет.
    expect(onboarding).toContain('lockTimedOut');
    // Второй рубеж снятия — само окно гида: пока tourDone false в БД,
    // гид открывается на сохранённом шаге (единый гид, миграция 66),
    // а не молчит под замком. Старую локальную метку tourSeenLocally
    // убрали: истина — база.
    expect(onboarding).not.toContain('tourSeenLocally');
    expect(onboarding).toContain("setStep('tour')");
  });
});
