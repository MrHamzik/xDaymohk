import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS, TOUR_STEPS_COUNT, TOUR_STEP_FINAL, TOUR_STEP_MAX, TOUR_STEP_PROFILE,
  normalizeSettings, prefFor, settingsToDb,
} from '@/lib/settings/defaults';

/**
 * Единый гид из 12 шагов (решение владельца от 21.08.2026):
 * анкета — шаг 11, финал «Вот и всё» с кнопкой «Завершить» — шаг 12;
 * tourDone ставится ТОЛЬКО кнопкой «Завершить».
 *
 * Часть проверок — по исходникам (окружение тестов node, без DOM):
 * так же устроены tour-polish и personal-profile-single-source.
 */

const root = process.cwd();
const firstTour = readFileSync(join(root, 'components/FirstTour.tsx'), 'utf8');
const onboarding = readFileSync(join(root, 'components/OnboardingModal.tsx'), 'utf8');
const sw = readFileSync(join(root, 'public/sw.js'), 'utf8');
const migration65 = readFileSync(join(root, 'supabase/update/65-tour-progress-db.sql'), 'utf8');
const migration66 = readFileSync(join(root, 'supabase/update/66-tour-single-flow.sql'), 'utf8');
const migration67 = readFileSync(join(root, 'supabase/update/67-tour-home-step.sql'), 'utf8');

describe('границы этапов единого гида', () => {
  it('14 шагов: анкета — 12-й индекс, финал — 13-й', () => {
    expect(TOUR_STEPS_COUNT).toBe(14);
    expect(TOUR_STEP_PROFILE).toBe(12);
    expect(TOUR_STEP_FINAL).toBe(13);
    expect(TOUR_STEP_MAX).toBe(13);
  });

  it('нормализация зажимает этап в 0..13', () => {
    expect(normalizeSettings({ ...DEFAULT_SETTINGS, tourStep: 5 }).tourStep).toBe(5);
    expect(normalizeSettings({ ...DEFAULT_SETTINGS, tourStep: 99 }).tourStep).toBe(13);
    expect(normalizeSettings({ ...DEFAULT_SETTINGS, tourStep: -3 }).tourStep).toBe(0);
    expect(normalizeSettings({ ...DEFAULT_SETTINGS, tourStep: 'мусор' }).tourStep).toBe(0);
  });

  it('этап пишется в БД', () => {
    expect(settingsToDb({ ...DEFAULT_SETTINGS, tourStep: 7 }).tour_step).toBe(7);
  });
});

describe('FirstTour — единый гид', () => {
  it('анкета — шаг гида (TourProfileStep), не отдельная модалка', () => {
    expect(firstTour).toContain('TourProfileStep');
    expect(firstTour).toContain('profileStep: true');
  });

  it('переходы сохраняют этап, tourDone в FirstTour не ставится', () => {
    expect(firstTour).toContain('update({ tourStep: index })');
    expect(firstTour).not.toContain('update({ tourDone: true })');
  });

  it('финал фиксирует последний шаг, Завершить завершает онбординг', () => {
    expect(firstTour).toContain('update({ tourStep: TOUR_STEP_FINAL })');
    expect(firstTour).toContain('tourFinalTitle');
  });

  it('ПК: клик по боковому меню выполняет задание «меню»', () => {
    expect(firstTour).toContain('tourWaitMenuPc');
    expect(firstTour).toContain('[data-tour="rail-menu"]');
  });

  it('каталог/меню: нечего листать — задание засчитывается', () => {
    expect(firstTour).toMatch(/scrollHeight <= scroller\.clientHeight \+ 40/);
    expect(firstTour).toMatch(/const scrollable = document\.body\.scrollHeight - window\.innerHeight;/);
  });
});

describe('OnboardingModal — без модалок-сирот', () => {
  it('шагов welcome/guide/consent/tour — никаких look/profile', () => {
    expect(onboarding).not.toContain(`setStep('look')`);
    expect(onboarding).not.toContain(`setStep('profile')`);
    expect(onboarding).not.toContain("step === 'look'");
    expect(onboarding).not.toContain("step === 'profile'");
  });

  it('tourDone ставится только в finishOnboarding — после «Завершить»', () => {
    expect(onboarding).toContain('updateSettings({ tourDone: true, tourStep: 0 })');
  });
});

describe('умолчания: автоактивация и звук включены', () => {
  it('автоактивация Темщика включена по умолчанию', () => {
    expect(DEFAULT_SETTINGS.autoActiveOnOpen).toBe(true);
    expect(normalizeSettings({}).autoActiveOnOpen).toBe(true);
    // Выключенным считается только явное false.
    expect(normalizeSettings({ autoActiveOnOpen: false }).autoActiveOnOpen).toBe(false);
  });

  it('звук уведомлений включён по умолчанию во всех группах', () => {
    for (const group of ['system', 'profile', 'activity', 'tasks', 'complaint', 'taxi']) {
      const pref = prefFor(DEFAULT_SETTINGS, group as never);
      expect(pref.show).toBe(true);
      expect(pref.sound).toBe(true);
    }
    // Выключенный вручную звук не трогаем.
    expect(
      prefFor({ ...DEFAULT_SETTINGS, notificationPrefs: { tasks: { show: true, sound: false } } }, 'tasks').sound,
    ).toBe(false);
  });
});

describe('сервис-воркер не кэширует dev-сборки', () => {
  it('версия кэша поднята (старые кэши удалятся при активации)', () => {
    expect(sw).toContain("daymohk-offline-v4");
  });
});

describe('миграции', () => {
  it('65: скрывает личную анкету до tour_done', () => {
    expect(migration65).toContain('us.tour_done = true');
  });

  it('66: автоактивация включается всем', () => {
    expect(migration66).toContain('auto_active_on_open = true');
  });

  it('67: сдвиг нумерации на шаг «Главная», границы 0..12', () => {
    expect(migration67).toContain('when tour_step between 3 and 9 then tour_step + 1');
    expect(migration67).toContain('tour_step >= 0 and tour_step <= 12');
  });
});

describe('шаг «Главная», плавность и подсветка меню (правки ночи)', () => {
  it('шаг «Главная» — как каталог: перейти и пролистать', () => {
    expect(firstTour).toContain("awaits: 'home-scroll'");
    expect(firstTour).toContain('tourWaitHome');
    // Фоновое возвращение на главную удалено — теперь это отдельный шаг.
    expect(firstTour).not.toContain('router.replace');
  });

  it('карточка не мигает старым шагом: waiting без !done', () => {
    expect(firstTour).toContain('const waiting = Boolean(step.awaits) && tasking;');
  });

  it('карточка гида появляется и исчезает плавно', () => {
    const css = readFileSync(join(root, 'app/styles/effects.css'), 'utf8');
    const modal = readFileSync(join(root, 'components/OnboardingModal.tsx'), 'utf8');
    expect(css).toContain('.smk-tour-card--hidden');
    expect(modal).toContain('smk-tour-card--hidden');
  });

  it('подсветка «весь блок меню» на ПК: метка rail-menu на доке, не на aside', () => {
    // У aside внутри лежит position:fixed — его собственная высота
    // НОЛЬ, прожектор отбраковывал цель, и на ПК шаг «Меню» гасил весь
    // экран без подсветки блока меню. Метка обязана стоять на доке.
    const sidebar = readFileSync(join(root, 'components/AppSidebar.tsx'), 'utf8');
    const dock = sidebar.match(/<div[^>]*data-tour="rail-menu"[^>]*>/);
    expect(dock, 'метка rail-menu не на доке').not.toBeNull();
    expect(sidebar).not.toMatch(/<aside[^>]*data-tour="rail-menu"/);
  });
});

describe('шаг «Ваш профиль»: адрес, контакты, дефолты анкет (ночь)', () => {
  const step = readFileSync(join(root, 'components/TourProfileStep.tsx'), 'utf8');

  it('адрес — подсказки из БД + мини-карта; клик мимо дома — заглушка', () => {
    expect(step).toContain('AddressAutocomplete');
    expect(step).toContain('InteractiveMap');
    expect(step).toContain('tourPickOnMap');
    expect(step).toContain("setAddress('Даймохк')");
    expect(step).toContain('tourAddressMissing');
  });

  it('порядок: адрес → телефон → WhatsApp → Telegram → 3 галочки (без описания)', () => {
    const at = (marker: string) => step.indexOf(marker);
    expect(at('tourAddressLabel')).toBeLessThan(at('t.phoneGeneral'));
    expect(at('t.phoneGeneral')).toBeLessThan(at('t.phoneWhatsappLabel'));
    expect(at('t.phoneWhatsappLabel')).toBeLessThan(at('t.phoneTelegramLabel'));
    expect(at('t.phoneTelegramLabel')).toBeLessThan(at('t.tourHidePhone'));
    // Описание — только в анкете (ТЗ, п.4.1): в шаге его нет.
    expect(step).not.toContain('t.bioLabel');
  });

  it('старые чекбоксы «общий номер» и «в этой анкете» удалены из шага', () => {
    expect(step).not.toContain('useCommonNumber');
    expect(step).not.toContain('hidePhoneLabel');
    expect(step).not.toContain('sameAsPhoneWhatsapp');
  });

  it('обводка полей не обрезается: у контейнера прокрутки есть отступ', () => {
    expect(step).toMatch(/overflow-y-auto p-1\.5/);
  });

  it('галочки сохраняются на аккаунте и применяются к анкете', () => {
    expect(step).toContain('hidePhone,');
    expect(step).toContain('hideWhatsapp,');
    expect(step).toContain('hideTelegram,');
    expect(step).toContain('phone: hidePhone ? undefined');
    expect(step).toContain('whatsapp: hideWhatsapp ? undefined');
    expect(step).toContain('telegram: hideTelegram');
  });

  it('новые анкеты и задания берут дефолты из профиля', () => {
    const edit = readFileSync(join(root, 'components/EditProfileModal.tsx'), 'utf8');
    const task = readFileSync(join(root, 'components/tasks/CreateTaskModal.tsx'), 'utf8');
    expect(edit).toContain('!profile?.id && account');
    expect(task).toContain('account?.hidePhone ? \'\' :');
    expect(task).toContain('account?.hideWhatsapp ? \'\' :');
  });

  it('миграция 68: три колонки дефолтов видимости', () => {
    const m68 = readFileSync(join(root, 'supabase/update/68-profile-contact-defaults.sql'), 'utf8');
    expect(m68).toContain('hide_phone boolean not null default false');
    expect(m68).toContain('hide_whatsapp boolean not null default false');
    expect(m68).toContain('hide_telegram boolean not null default false');
  });
});

describe('ТЗ (финальная редакция): сброс, режим редактирования, никнейм', () => {
  it('сброс настроек не воскрешает гид', () => {
    const provider = readFileSync(join(root, 'components/SettingsProvider.tsx'), 'utf8');
    expect(provider).toMatch(/tourDone: current\.tourDone/);
    expect(provider).toMatch(/tourStep: current\.tourStep/);
  });

  it('«Режим редактирования» доступен всем: платной привязки нет', () => {
    const settingsPage = readFileSync(join(root, 'app/settings/page.tsx'), 'utf8');
    expect(settingsPage).not.toMatch(/lightMode[\s\S]{0,200}hasPro\(settings, 'silver'\)/);
  });

  it('лайт-режим переименован в «Режим редактирования»', () => {
    const dict = readFileSync(join(root, 'lib/i18n.tsx'), 'utf8');
    expect(dict).toContain("lightMode: 'Режим редактирования'");
  });

  it('шаг гида про режим редактирования: тумблер, глазики, «Сохранить»', () => {
    expect(firstTour).toContain("awaits: 'edit-mode'");
    expect(firstTour).toContain('tourEditOn');
    expect(firstTour).toContain('tourEditOff');
    expect(firstTour).toContain('data-tour-eye');
    expect(firstTour).toMatch(/setEditPhase\('off'\); setTasking\(false\)/);
    const nav = readFileSync(join(root, 'components/SidebarNav.tsx'), 'utf8');
    expect(nav).toContain('data-tour-eye');
  });

  it('никнейм: 16 символов, живёт в личной анкете и работает', () => {
    const edit = readFileSync(join(root, 'components/EditProfileModal.tsx'), 'utf8');
    expect(edit).toContain('maxLength={16}');
    expect(edit).toMatch(/nickname: profile\?\.isPersonal \? nickname\.trim\(\)/);
    const name = readFileSync(join(root, 'lib/profile-name.ts'), 'utf8');
    expect(name).toContain('showNickname && nick');
  });

  it('анкета: три галочки «не показывать» вместо полей контактов', () => {
    const edit = readFileSync(join(root, 'components/EditProfileModal.tsx'), 'utf8');
    expect(edit).toContain('t.tourHidePhone');
    expect(edit).toContain('hideWhatsapp,');
    expect(edit).toContain('hideTelegram,');
    // Старых полей нет (ТЗ, п.5.1).
    expect(edit).not.toContain('t.useCommonNumber');
    expect(edit).not.toContain('t.hidePhoneLabel');
  });

  it('миграция 69: контакты в профиле, галочки в анкетах, шаг 5-й, пол «другое»', () => {
    const m = readFileSync(join(root, 'supabase/update/69-profile-contacts-nickname.sql'), 'utf8');
    expect(m).toContain('add column if not exists whatsapp text');
    expect(m).toContain('add column if not exists telegram text');
    expect(m).toContain('add column if not exists hide_whatsapp boolean not null default false');
    expect(m).toContain("gender in ('male', 'female', 'other')");
    expect(m).toContain('when tour_step between 5 and 12 then tour_step + 1');
    expect(m).toContain('tour_step <= 13');
  });
});

describe('правки от 22.08 (девять пунктов)', () => {
  const step = readFileSync(join(root, 'components/TourProfileStep.tsx'), 'utf8');
  const edit = readFileSync(join(root, 'components/EditProfileModal.tsx'), 'utf8');
  const catalog = readFileSync(join(root, 'app/catalog/page.tsx'), 'utf8');
  const settingsPage = readFileSync(join(root, 'app/settings/page.tsx'), 'utf8');

  it('1: текст шага без «ранее назывался Light-режим»', () => {
    const dict = readFileSync(join(root, 'lib/i18n.tsx'), 'utf8');
    expect(dict).not.toContain('ранее назывался Light-режим');
  });

  it('2: «Дальше» не перескакивает шаг редактирования', () => {
    expect(firstTour).toMatch(/editPhase === 'on'[\s\S]{0,120}if \(!settings\.lightMode\) return;/);
  });

  it('2 (пуленепробиваемо): правку запускает только тумблер с паузой, авто-переход отключён', () => {
    // Тумблер запускает правку с паузой 400 мс — карточка не исчезает
    // под кликом (источник «перескока» на шаг 7).
    expect(firstTour).toMatch(/window\.setTimeout\(\(\) => setTasking\(true\), 400\)/);
    // Авто-переход по done для этого шага запрещён.
    expect(firstTour).toMatch(/if \(step\.awaits === 'edit-mode'\) return;[\s\S]{0,140}setIndex/);
    // Пропуск возвращён (22.08, п.5) и гасит режим при уходе.
    const editStep = firstTour.slice(firstTour.indexOf('tourEditTitle'), firstTour.indexOf('tourEditTitle') + 1600);
    expect(editStep).toContain('skippable: true');
    expect(firstTour).toMatch(/awaits === 'edit-mode' && settings\.lightMode[\s\S]{0,80}update\(\{ lightMode: false \}\)/);
    // Возврат с включённым режимом сразу продолжает правку.
    expect(firstTour).toMatch(/awaits === 'edit-mode' && settings\.lightMode/);
  });

  it('2: чекбокс никнейма — с отступами ( отдельная строка )', () => {
    const stepFile = readFileSync(join(root, 'components/TourProfileStep.tsx'), 'utf8');
    expect(stepFile).toMatch(/mt-3[\s\S]{0,400}tourShowNickname/);
  });

  it('3: никнейм + «показывать вместо ФИО» есть в шаге профиля', () => {
    expect(step).toContain('tourNicknameLabel');
    expect(step).toContain('tourShowNickname');
    expect(step).toContain('slice(0, 16)');
  });

  it('4: телефон не обязателен — проверки нет', () => {
    expect(step).not.toContain('Укажите номер телефона');
  });

  it('5: пол и дата рождения — в анкете, не в профиле', () => {
    expect(step).not.toContain('t.genderLabel');
    expect(edit).toContain('id="profile-gender"');
    expect(edit).toContain('id="profile-birth"');
    const profilePage = readFileSync(join(root, 'app/profile/page.tsx'), 'utf8');
    expect(profilePage).not.toContain('account-gender');
  });

  it('6: в анкете нет блока «берётся из учётной записи»', () => {
    expect(edit).not.toContain('phoneFromAccount');
  });

  it('8: жалоба с [ЧС] реально добавляет в чёрный список', () => {
    expect(catalog).toContain("endsWith('[ЧС]')");
    expect(catalog).toContain('blockOwner(');
    const map = readFileSync(join(root, 'app/map/page.tsx'), 'utf8');
    expect(map).toContain("endsWith('[ЧС]')");
  });

  it('9: сброс настроек — модальное окно, не window.confirm', () => {
    expect(settingsPage).toContain('ConfirmDialog');
    expect(settingsPage).not.toMatch(/window\.confirm\(/);
  });
});

describe('системные подтверждения заменены модальными окнами', () => {
  it('ни одного window.confirm/alert в приложении', () => {
    const walk = (dir: string): string[] => {
      const out: string[] = [];
      for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) out.push(...walk(full));
        else if (/\.(tsx?)$/.test(name)) out.push(full);
      }
      return out;
    };
    const offenders: string[] = [];
    for (const file of [...walk(join(root, 'app')), ...walk(join(root, 'components'))]) {
      const text = readFileSync(file, 'utf8');
      // Комментарии не считаем: в них законно упоминается старое поведение.
      const code = text.replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, '');
      if (/window\.confirm\(|[^.\w]alert\(/.test(code)) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });
});

describe('финальные правки 22.08 (шесть пунктов)', () => {
  it('1: меню возвращается в начало на каждом шаге', () => {
    expect(firstTour).toMatch(/querySelectorAll\('\[data-tour-menu-scroll\]'\)/);
  });

  it('2: «Дальше» мертва, пока режим редактирования включён', () => {
    const branch = firstTour.slice(firstTour.indexOf("step.awaits === 'edit-mode' && !tasking"));
    expect(branch.slice(0, 700)).toMatch(/if \(settings\.lightMode\) return;\s*\n\s*setIndex/);
  });

  it('3: карта шага 13 — штатный слой домов БД', () => {
    const step = readFileSync(join(root, 'components/TourProfileStep.tsx'), 'utf8');
    expect(step).toContain('showHouses');
    expect(step).not.toContain('markers={');
    expect(step).toMatch(/Math\.abs\(Number\(house\.lat\) - position\.lat\) < 1e-7/);
  });

  it('4: формулировка «Не показывать…» едина и галочки по умолчанию стоят', () => {
    const auth = readFileSync(join(root, 'components/AuthProvider.tsx'), 'utf8');
    const step = readFileSync(join(root, 'components/TourProfileStep.tsx'), 'utf8');
    const profile = readFileSync(join(root, 'app/profile/page.tsx'), 'utf8');
    expect(step).toMatch(/hidePhone, setHidePhone\] = useState\(true\)/);
    expect(auth).toContain('hidePhone: true');
    expect(profile).toContain('t.tourHidePhone');
    const m70 = readFileSync(join(root, 'supabase/update/70-hide-contacts-default-on.sql'), 'utf8');
    expect(m70).toContain('set hide_phone = true, hide_whatsapp = true, hide_telegram = true');
  });

  it('6: fallback сохранения анкеты не теряет ник и галочки', () => {
    const persist = readFileSync(join(root, 'lib/profiles/persist.ts'), 'utf8');
    expect(persist).toContain('hide_whatsapp: profile.hideWhatsapp ?? false');
    expect(persist).toContain('nickname: profile.nickname ?? null');
    expect(persist).toContain('console.warn');
  });
});

describe('правки после выкатки на Vercel (22.08)', () => {
  it('2: боковое меню ПК по умолчанию развёрнуто', () => {
    const sidebar = readFileSync(join(root, 'components/AppSidebar.tsx'), 'utf8');
    expect(sidebar).toContain("useState(true)");
    expect(sidebar).toContain("localStorage.getItem(RAIL_KEY) !== '0'");
  });

  it('3: порог скролла достижим на любом экране (2К и выше)', () => {
    expect(firstTour).toContain('const effectiveMinScroll = Math.min(400, Math.max(60, Math.round(scrollable * 0.5)));');
    expect(firstTour).toContain('effectiveMinScroll)) return;');
  });

  it('1: кэш сервис-воркера поднят (v4) для новой выкатки', () => {
    const sw = readFileSync(join(root, 'public/sw.js'), 'utf8');
    expect(sw).toContain('daymohk-offline-v4');
  });
});

describe('баг от 22.08: «откройте меню» при открытом меню (мобилка)', () => {
  it('выезд меню помечен data-tour-drawer — гид видит реальное состояние', () => {
    const drawer = readFileSync(join(root, 'components/MobileMenuDrawer.tsx'), 'utf8');
    expect(drawer).toContain('data-tour-drawer');
  });

  it('смена шага синхронизирует overlayOpen с DOM, а не сбрасывает вслепую', () => {
    expect(firstTour).toContain("setOverlayOpen(Boolean(document.querySelector('[data-tour-drawer]')))");
  });

  it('подсказка «откройте меню» — только когда меню действительно закрыто', () => {
    expect(firstTour).toContain('(isDesktop || overlayOpen) ? t.tourEditHint : t.tourEditHintMobile');
  });

  it('на шаге редактирования пилюля-инструкция видна и при открытом меню', () => {
    expect(firstTour).toContain("!screenFree || step.awaits === 'edit-mode'");
  });
});
