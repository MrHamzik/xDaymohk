import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Формы профиля берут подписи из словаря, а не из хардкода (п.2/п.8).
 *
 * История вопроса. Пользователь дважды сообщил, что правка текстов
 * «Телефон для звонков» / WhatsApp / Telegram «вообще ничего не
 * поменяла». Причина: анкета профиля в проекте существует в ЧЕТЫРЁХ
 * экземплярах, и в прошлый раз ключи поменяли только в i18n и на
 * странице /profile. Формы, которые человек реально открывает —
 * регистрация (OnboardingModal) и правка анкеты (EditProfileModal) —
 * держали подписи текстом прямо в разметке:
 *
 *   <label>Телефон / Телефон</label>     ← в анкете регистрации
 *   <label>WhatsApp</label>              ← в правке профиля
 *   <label>Telegram</label>
 *
 * Словарь менялся, экран — нет.
 *
 * Тест закрывает именно этот разрыв: подписи должны приходить из
 * словаря во всех формах сразу. Настоящее решение проблемы —
 * перестать дублировать анкету (это отдельная задача, п.1 старого
 * списка), а до тех пор дубликаты обязаны хотя бы говорить одинаково.
 */

const root = process.cwd();

/** Формы, где человек вводит контакты. */
const FORMS = [
  'components/OnboardingModal.tsx',
  'components/EditProfileModal.tsx',
  'app/profile/page.tsx',
] as const;

const KEYS = ['phoneGeneral', 'phoneWhatsappLabel', 'phoneTelegramLabel'] as const;

describe('i18n: ключи подписей есть в обоих языках', () => {
  const dict = readFileSync(join(root, 'lib/i18n.tsx'), 'utf8');

  it.each(KEYS)('%s объявлен и в русском, и в чеченском', (key) => {
    const declarations = dict.match(new RegExp(`^\\s*${key}:`, 'gm')) ?? [];
    expect(declarations.length).toBe(2);
  });
});

describe('формы профиля не содержат подписей текстом', () => {
  /**
   * Ищем ровно те литералы, что стояли в разметке. Проверяем только
   * содержимое <label>, а не весь файл: слова WhatsApp и Telegram
   * законно встречаются в комментариях, ссылках wa.me и в t.* ключах.
   */
  it.each(FORMS)('%s: в <label> нет захардкоженных названий', (file) => {
    const text = readFileSync(join(root, file), 'utf8');
    const labels = text.match(/<label[^>]*>([\s\S]*?)<\/label>/g) ?? [];

    const offenders = labels.filter((label) => {
      const inner = label.replace(/<[^>]+>/g, '').trim();
      if (!inner) return false;
      // Подпись из словаря выглядит как {t.something} — это норма.
      if (/^\{[^}]*\}$/.test(inner)) return false;
      return /^(WhatsApp|Telegram|Телефон)/i.test(inner);
    });

    expect(offenders).toEqual([]);
  });

  it.each(FORMS)('%s: подписи берутся из словаря', (file) => {
    const text = readFileSync(join(root, file), 'utf8');
    // В каждой форме есть хотя бы поле общего телефона.
    expect(text).toContain('t.phoneGeneral');
  });
});

describe('русский текст подписей — тот, который просил пользователь', () => {
  const dict = readFileSync(join(root, 'lib/i18n.tsx'), 'utf8');

  it('«Телефон для звонков», а не «Телефон / Телефон»', () => {
    expect(dict).toContain("phoneGeneral: 'Телефон для звонков'");
    expect(dict).not.toContain('Телефон / Телефон');
  });

  it('WhatsApp и Telegram описаны словами, а не одним названием', () => {
    expect(dict).toContain("phoneWhatsappLabel: 'Номер телефона в WhatsApp'");
    expect(dict).toContain("phoneTelegramLabel: 'Имя пользователя в Telegram'");
  });
});
