/**
 * Автостатус исполнителя «Темщик» (п.33).
 *
 * Требование: статус включается сам, когда человек откликнулся на
 * задание или записался на него; выключается вручную или сам собой
 * через 30 минут без действий в разделе.
 *
 * Проверяются две функции с РАЗНЫМ поведением, которые легко перепутать:
 *   activateExecutorOnAction — включает статус, даже если он был выключен;
 *   touchExecutorActivity    — только продлевает уже действующий.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  activateExecutorOnAction,
  touchExecutorActivity,
  isExecutorActive,
  EXECUTOR_ACTIVE_MINUTES,
} from '@/lib/tasks/server';

/**
 * Мини-заглушка Supabase: запоминает, что записали в executor_status.
 * `row` — то, что «уже лежит в базе» до вызова.
 */
function fakeAdmin(row: { is_active: boolean; active_until: string | null } | null) {
  const calls = { upsert: [] as unknown[], update: [] as unknown[] };
  const admin = {
    from() {
      return {
        select() {
          return {
            eq() {
              return { maybeSingle: async () => ({ data: row }) };
            },
          };
        },
        upsert(values: unknown) {
          calls.upsert.push(values);
          return Promise.resolve({ error: null });
        },
        update(values: unknown) {
          calls.update.push(values);
          return { eq: async () => ({ error: null }) };
        },
      };
    },
  };
  // Сигнатура функций требует SupabaseClient; в тесте нужен только
  // разбираемый выше кусок API.
  return { admin: admin as never, calls };
}

const future = () => new Date(Date.now() + 10 * 60_000).toISOString();
const past = () => new Date(Date.now() - 10 * 60_000).toISOString();

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('activateExecutorOnAction — отклик включает статус', () => {
  it('включает статус, когда его вообще не было', async () => {
    const { admin, calls } = fakeAdmin(null);
    await activateExecutorOnAction(admin, 'user-1');

    expect(calls.upsert).toHaveLength(1);
    const saved = calls.upsert[0] as { is_active: boolean; active_until: string };
    expect(saved.is_active).toBe(true);
    expect(saved.active_until).toBeTruthy();
  });

  it('включает статус, который был ВЫКЛЮЧЕН вручную', async () => {
    // Главная разница с touchExecutorActivity: та бы ничего не сделала.
    const { admin, calls } = fakeAdmin({ is_active: false, active_until: null });
    await activateExecutorOnAction(admin, 'user-1');

    const saved = calls.upsert[0] as { is_active: boolean };
    expect(saved.is_active).toBe(true);
  });

  it('заводит окно ровно на 30 минут', async () => {
    const { admin, calls } = fakeAdmin(null);
    const before = Date.now();
    await activateExecutorOnAction(admin, 'user-1');

    const saved = calls.upsert[0] as { active_until: string };
    const minutes = (new Date(saved.active_until).getTime() - before) / 60_000;
    expect(EXECUTOR_ACTIVE_MINUTES).toBe(30);
    expect(minutes).toBeGreaterThan(29);
    expect(minutes).toBeLessThanOrEqual(30.5);
  });

  it('не роняет отклик, если база недоступна', async () => {
    const broken = {
      from() {
        throw new Error('база недоступна');
      },
    } as never;
    // Статус — вспомогательная вещь: из-за него нельзя терять отклик.
    await expect(activateExecutorOnAction(broken, 'user-1')).resolves.toBeUndefined();
  });
});

describe('touchExecutorActivity — продление, но не воскрешение', () => {
  it('продлевает действующий статус', async () => {
    const { admin, calls } = fakeAdmin({ is_active: true, active_until: future() });
    await touchExecutorActivity(admin, 'user-1');
    expect(calls.update).toHaveLength(1);
  });

  it('НЕ воскрешает статус с истёкшим сроком', async () => {
    const { admin, calls } = fakeAdmin({ is_active: true, active_until: past() });
    await touchExecutorActivity(admin, 'user-1');
    expect(calls.update).toHaveLength(0);
  });

  it('НЕ включает выключенный статус', async () => {
    const { admin, calls } = fakeAdmin({ is_active: false, active_until: null });
    await touchExecutorActivity(admin, 'user-1');
    expect(calls.update).toHaveLength(0);
  });
});

describe('isExecutorActive — протухание по времени', () => {
  it('активен, пока окно не истекло', () => {
    expect(isExecutorActive({ is_active: true, active_until: future() })).toBe(true);
  });

  it('неактивен после истечения окна — без фоновых задач', () => {
    expect(isExecutorActive({ is_active: true, active_until: past() })).toBe(false);
  });

  it('неактивен, если выключен вручную', () => {
    expect(isExecutorActive({ is_active: false, active_until: future() })).toBe(false);
  });

  it('неактивен, когда записи нет вовсе', () => {
    expect(isExecutorActive(null)).toBe(false);
  });
});
