import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase-admin';
import { log } from '@/lib/logger';
import { rateLimit, withRateLimitHeaders } from '@/lib/rate-limit';
import {
  digitsOnly, EMPTY_PAYOUT, isValidCard, isValidWallet, normalizePhone,
} from '@/lib/payments';

/**
 * Реквизиты для получения оплаты.
 *
 *   GET  /api/payout            — мои реквизиты
 *   GET  /api/payout?taskId=…   — реквизиты исполнителя задания (заказчику)
 *   POST /api/payout            — сохранить свои реквизиты
 *
 * Ключевое правило приватности: чужие реквизиты отдаются ТОЛЬКО
 * заказчику задания и ТОЛЬКО когда отклик исполнителя одобрен. Номер
 * телефона и карта — приманка для схем «верните ошибочный перевод»,
 * поэтому в общий доступ они не попадают никогда.
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

async function caller(request: Request): Promise<{ id: string } | null> {
  const header = request.headers.get('authorization');
  const token = header?.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token || !SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await anon.auth.getUser(token);
  if (error || !data.user) return null;
  return { id: data.user.id };
}

/* eslint-disable @typescript-eslint/no-explicit-any */
const mapRow = (r: any) => ({
  // Колонки может не быть (миграция 34 не применена): тогда считаем
  // согласие данным, если реквизиты заполнены — так вела себя система
  // до появления тумблера.
  isEnabled: r?.is_enabled ?? Boolean(
    r?.sbp_phone || r?.card_number || r?.yoomoney_wallet,
  ),
  sbpPhone: r?.sbp_phone ?? '',
  sbpBank: r?.sbp_bank ?? '',
  cardNumber: r?.card_number ?? '',
  cardBank: r?.card_bank ?? '',
  yoomoneyWallet: r?.yoomoney_wallet ?? '',
});
/* eslint-enable @typescript-eslint/no-explicit-any */

export async function GET(request: Request) {
  const me = await caller(request);
  if (!me) return NextResponse.json({ error: 'Войдите, чтобы продолжить' }, { status: 401 });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ payout: EMPTY_PAYOUT });

  const taskId = new URL(request.url).searchParams.get('taskId');

  // ── Свои реквизиты ──────────────────────────────────────────────
  if (!taskId) {
    try {
      const { data } = await admin.from('payout_methods')
        .select('*').eq('user_id', me.id).maybeSingle();
      return NextResponse.json({ payout: data ? mapRow(data) : EMPTY_PAYOUT });
    } catch {
      return NextResponse.json({ payout: EMPTY_PAYOUT });
    }
  }

  // ── Реквизиты исполнителя: только заказчику одобренного задания ──
  try {
    const { data: task } = await admin.from('tasks')
      .select('id, author_id, payment_method').eq('id', taskId).maybeSingle();
    if (!task) return NextResponse.json({ error: 'Задание не найдено' }, { status: 404 });
    if (task.author_id !== me.id) {
      return NextResponse.json({ error: 'Недостаточно прав' }, { status: 403 });
    }

    // Исполнитель — участник с подтверждённым участием. До одобрения
    // отклика реквизиты не показываем: заказчик ещё не выбрал человека.
    const { data: participants } = await admin.from('task_participants')
      .select('user_id, status').eq('task_id', taskId)
      .in('status', ['joined', 'attended', 'done']);

    const executor = (participants ?? [])[0];
    if (!executor) {
      return NextResponse.json({ payout: EMPTY_PAYOUT, executorId: null });
    }

    // Заказчик и исполнитель — один человек (так бывает при проверке
    // на своём же аккаунте). Реквизиты не отдаём: ЮMoney на такой
    // перевод отвечает «Нельзя перевести самому себе», и понять из
    // этого, что не так, невозможно.
    if (String(executor.user_id) === String(me.id)) {
      return NextResponse.json({
        payout: EMPTY_PAYOUT,
        executorId: executor.user_id,
        selfPayment: true,
        paymentMethod: task.payment_method ?? 'cash',
      });
    }

    const { data } = await admin.from('payout_methods')
      .select('*').eq('user_id', executor.user_id).maybeSingle();

    // Тумблер выключен — реквизитов нет, даже если поля заполнены.
    // Решение принимает сервер: клиент мог бы просто не показать блок,
    // но данные всё равно ушли бы в ответе и были видны в DevTools.
    //
    // Проверку берём ту же, что в mapRow: там `is_enabled ?? заполнено`,
    // и жёсткое `=== true` здесь давало расхождение — на базе без
    // миграции 34 реквизиты не показывались вовсе.
    const mapped = data ? mapRow(data) : null;

    return NextResponse.json({
      payout: mapped?.isEnabled ? mapped : EMPTY_PAYOUT,
      executorId: executor.user_id,
      paymentMethod: task.payment_method ?? 'cash',
    });
  } catch (e) {
    log.warn('payout:GET', 'task payout failed', { message: String(e) });
    return NextResponse.json({ payout: EMPTY_PAYOUT });
  }
}

export async function POST(request: Request) {
  const limit = await rateLimit(request, { scope: 'payout:save', limit: 20, windowMs: 600_000 });
  if (!limit.allowed) {
    return withRateLimitHeaders(
      NextResponse.json({ error: 'Слишком много изменений подряд' }, { status: 429 }),
      { ...limit, limit: 20 },
    );
  }

  const me = await caller(request);
  if (!me) return NextResponse.json({ error: 'Войдите, чтобы продолжить' }, { status: 401 });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: 'Service role not configured' }, { status: 503 });

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Пустой запрос' }, { status: 400 });

  // Нормализуем на сервере: клиент мог прислать что угодно, а хранить
  // нужно в одном формате — иначе заказчик увидит «8 999...» у одного и
  // «+7999...» у другого.
  const sbpPhone = body.sbpPhone ? normalizePhone(String(body.sbpPhone)) : '';
  if (body.sbpPhone && !sbpPhone) {
    return NextResponse.json({ error: 'Проверьте номер телефона для СБП' }, { status: 400 });
  }

  const cardNumber = body.cardNumber ? digitsOnly(String(body.cardNumber)) : '';
  if (cardNumber && !isValidCard(cardNumber)) {
    return NextResponse.json({ error: 'Номер карты должен содержать 16–19 цифр' }, { status: 400 });
  }

  const wallet = body.yoomoneyWallet ? digitsOnly(String(body.yoomoneyWallet)) : '';
  if (wallet && !isValidWallet(wallet)) {
    return NextResponse.json({ error: 'Номер кошелька ЮMoney должен содержать 11–16 цифр' }, { status: 400 });
  }

  const base = {
    user_id: me.id,
    sbp_phone: sbpPhone,
    sbp_bank: String(body.sbpBank ?? '').slice(0, 60),
    card_number: cardNumber,
    card_bank: String(body.cardBank ?? '').slice(0, 60),
    yoomoney_wallet: wallet,
  };

  // is_enabled добавлен миграцией 34. Пробуем записать с ним, а при
  // ошибке «нет такой колонки» повторяем без него: иначе на базе без
  // миграции тумблер откатывался назад и реквизиты вообще не
  // сохранялись — ровно то, на что жаловался пользователь.
  let { error } = await admin.from('payout_methods')
    .upsert({ ...base, is_enabled: body.isEnabled === true }, { onConflict: 'user_id' });

  if (error && /is_enabled/i.test(error.message)) {
    log.warn('payout:POST', 'is_enabled column missing, saving without it');
    ({ error } = await admin.from('payout_methods')
      .upsert(base, { onConflict: 'user_id' }));
  }

  if (error) {
    log.warn('payout:POST', 'upsert failed', { message: error.message });
    return NextResponse.json(
      { error: `Не удалось сохранить реквизиты: ${error.message}` },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true });
}
