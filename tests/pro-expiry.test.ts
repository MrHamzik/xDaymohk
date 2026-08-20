/**
 * Срок действия подписки и совпадение правил клиента с сервером
 * (пункты 1 и 3 плана по п.20).
 *
 * Проверяется главное: истёкшая подписка не должна давать платных
 * возможностей, а правило «что бесплатно» обязано совпадать в
 * TypeScript и в SQL. Если эти два места разъедутся, интерфейс покажет
 * одно, а база сохранит другое — и пользователь увидит, как настройка
 * самопроизвольно откатывается.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { normalizeSettings } from '@/lib/settings/defaults';
import { activeProTier, hasPro, forceOwnerPlatinum, FREE_THEME_IDS } from '@/lib/settings/pro';

/** Момент времени со сдвигом от «сейчас», в формате базы. */
function shift(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString();
}

describe('действующий уровень подписки', () => {
  it('оплаченная подписка действует', () => {
    const settings = { proTier: 'gold' as const, proUntil: shift(30) };
    expect(activeProTier(settings)).toBe('gold');
    expect(hasPro(settings, 'silver')).toBe(true);
  });

  it('истёкшая подписка не даёт ничего', () => {
    const settings = { proTier: 'gold' as const, proUntil: shift(-1) };
    expect(activeProTier(settings)).toBe('none');
    expect(hasPro(settings, 'bronze')).toBe(false);
  });

  it('без срока подписка бессрочна', () => {
    // Так выглядит ручная выдача администратором и владелец проекта.
    const settings = { proTier: 'platinum' as const, proUntil: null };
    expect(activeProTier(settings)).toBe('platinum');
    expect(hasPro(settings, 'platinum')).toBe(true);
  });

  it('испорченная дата трактуется не в пользу подписки', () => {
    // Мусор в поле не должен открывать платное «по умолчанию».
    const settings = { proTier: 'gold' as const, proUntil: 'позавчера' };
    expect(activeProTier(settings)).toBe('none');
  });

  it('уровня none не бывает даже без срока', () => {
    expect(activeProTier({ proTier: 'none', proUntil: null })).toBe('none');
  });

  it('старые настройки без поля срока продолжают работать', () => {
    // Совместимость: записи, сохранённые до появления pro_until.
    expect(activeProTier({ proTier: 'silver' })).toBe('silver');
  });
});

describe('чтение срока из внешних данных', () => {
  it('нормализация оставляет разбираемую дату', () => {
    const iso = shift(10);
    expect(normalizeSettings({ proTier: 'gold', proUntil: iso }).proUntil).toBe(iso);
  });

  it('нормализация выбрасывает мусор', () => {
    for (const bad of ['', 'скоро', 42, {}, [], true]) {
      expect(normalizeSettings({ proTier: 'gold', proUntil: bad }).proUntil).toBeNull();
    }
  });

  it('по умолчанию срока нет', () => {
    expect(normalizeSettings({}).proUntil).toBeNull();
  });
});

describe('владелец проекта', () => {
  const OWNER = 'mr.hamzik1026@gmail.com';

  it('получает платину без срока', () => {
    const forced = forceOwnerPlatinum({ proTier: 'none' as const, proUntil: null }, OWNER);
    expect(forced.proTier).toBe('platinum');
    expect(forced.proUntil).toBeNull();
  });

  it('истёкший срок в его записи не гасит платину', () => {
    // Иначе старая строка с датой отобрала бы у владельца доступ.
    const forced = forceOwnerPlatinum({ proTier: 'platinum' as const, proUntil: shift(-5) }, OWNER);
    expect(activeProTier(forced)).toBe('platinum');
  });

  it('чужой почте платина не достаётся', () => {
    const other = forceOwnerPlatinum({ proTier: 'none' as const, proUntil: null }, 'someone@example.com');
    expect(other.proTier).toBe('none');
  });
});

describe('правила клиента совпадают с серверными', () => {
  const sql = readFileSync(
    join(process.cwd(), 'supabase/update/62-pro-features-server-guard.sql'),
    'utf8',
  );

  it('список бесплатных тем в SQL тот же, что в коде', () => {
    // FREE_THEME_IDS и is_free_theme обязаны описывать одно и то же.
    for (const id of FREE_THEME_IDS) {
      expect(sql).toContain(`'${id}'`);
    }
  });

  it('свои темы бесплатны и на сервере', () => {
    expect(sql).toContain("theme like 'custom:%'");
  });

  it('проверка возможностей идёт после установки уровня', () => {
    // Имя триггера задаёт порядок: сначала уровень, потом возможности.
    expect(sql).toContain('trg_guard_pro_zfeatures');
    expect(sql).toContain('public.effective_pro_tier(new.pro_tier, new.pro_until)');
  });

  it('service_role и админ не ограничиваются', () => {
    expect(sql).toContain('auth.uid() is null or public.is_admin_email()');
  });
});

describe('срок защищён на сервере', () => {
  const sql = readFileSync(
    join(process.cwd(), 'supabase/update/61-pro-tier-expiry.sql'),
    'utf8',
  );

  it('триггер возвращает пользователю прежний срок', () => {
    // Иначе подписку можно было бы продлить себе из консоли браузера.
    expect(sql).toContain('new.pro_until := previous_until');
  });

  it('клиент не отправляет срок в базу', () => {
    const defaults = readFileSync(join(process.cwd(), 'lib/settings/defaults.ts'), 'utf8');
    const toDb = defaults.slice(defaults.indexOf('export function settingsToDb'));
    expect(toDb).not.toContain('pro_until:');
  });
});
