import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-admin';
import { getUserFromRequest } from '@/lib/auth';
import { rateLimit, withRateLimitHeaders } from '@/lib/rate-limit';
import { log } from '@/lib/logger';

/**
 * POST /api/taxi/rides/<id>/action — переходы статусов поездки.
 *
 *  accept    таксист:  searching → assigned (первый нажавший везёт);
 *  to_pickup таксист:  assigned → to_pickup (еду к точке);
 *  in_ride   таксист:  to_pickup → in_ride (пассажир в машине);
 *  complete  таксист:  in_ride → completed;
 *  cancel    пассажир: → cancelled; таксист (assigned/to_pickup):
 *            заказ возвращается в поиск.
 *
 * Права проверяются по ролям: чужой таксист не примет чужой активный
 * заказ, пассажир не пометит поездку завершённой.
 */

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const limit = await rateLimit(request, { scope: 'taxi:action', limit: 30, windowMs: 60_000 });
  if (!limit.allowed) {
    return withRateLimitHeaders(NextResponse.json({ error: 'Слишком много запросов' }, { status: 429 }), { ...limit, limit: 30 });
  }
  const auth = await getUserFromRequest(request);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const action = typeof body?.action === 'string' ? body.action : '';

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: 'Service role not configured' }, { status: 503 });

  const { data: ride } = await admin.from('taxi_rides')
    .select('*').eq('id', id).maybeSingle();
  if (!ride) return NextResponse.json({ error: 'Поездка не найдена' }, { status: 404 });

  const isRider = String(ride.rider_id) === auth.user.id;
  const isDriver = ride.driver_id ? String(ride.driver_id) === auth.user.id : false;

  const patch: Record<string, unknown> = {};

  switch (action) {
    case 'accept': {
      if (ride.status !== 'searching') {
        return NextResponse.json({ error: 'Заказ уже разобран' }, { status: 409 });
      }
      if (isRider) return NextResponse.json({ error: 'Нельзя принять собственный заказ' }, { status: 400 });
      const { data: driver } = await admin.from('taxi_drivers')
        .select('*').eq('user_id', auth.user.id).maybeSingle();
      if (!driver || driver.is_online !== true) {
        return NextResponse.json({ error: 'Вы не на линии' }, { status: 400 });
      }
      if (!Array.isArray(driver.tariffs) || !driver.tariffs.includes(ride.tariff_id)) {
        return NextResponse.json({ error: 'Заказ другого тарифа' }, { status: 400 });
      }
      patch.status = 'assigned';
      patch.driver_id = auth.user.id;
      patch.assigned_at = new Date().toISOString();
      break;
    }
    case 'to_pickup': {
      if (!isDriver || ride.status !== 'assigned') {
        return NextResponse.json({ error: 'Недоступное действие' }, { status: 400 });
      }
      patch.status = 'to_pickup';
      break;
    }
    case 'in_ride': {
      if (!isDriver || ride.status !== 'to_pickup') {
        return NextResponse.json({ error: 'Недоступное действие' }, { status: 400 });
      }
      patch.status = 'in_ride';
      break;
    }
    case 'complete': {
      if (!isDriver || ride.status !== 'in_ride') {
        return NextResponse.json({ error: 'Недоступное действие' }, { status: 400 });
      }
      patch.status = 'completed';
      patch.completed_at = new Date().toISOString();
      break;
    }
    case 'cancel': {
      if (isRider && ['searching', 'assigned', 'to_pickup'].includes(ride.status)) {
        patch.status = 'cancelled';
        patch.cancelled_by = 'rider';
      } else if (isDriver && ['assigned', 'to_pickup'].includes(ride.status)) {
        // Таксист сошёл: заказ возвращается в поиск к коллегам.
        patch.status = 'searching';
        patch.driver_id = null;
        patch.assigned_at = null;
      } else {
        return NextResponse.json({ error: 'Недоступное действие' }, { status: 400 });
      }
      break;
    }
    default:
      return NextResponse.json({ error: 'Неизвестное действие' }, { status: 400 });
  }

  const { data: updated, error } = await admin.from('taxi_rides')
    .update(patch).eq('id', id).select('*').single();
  if (error) {
    log.warn('taxi:action', 'update failed', { message: error.message });
    return NextResponse.json({ error: 'Не удалось обновить поездку' }, { status: 500 });
  }

  // Лента событий + уведомление второй стороне (п.13 замечаний
  // 23.08): уведомления уходят в раздел «Такси» (type taxi_info).
  const actor = isDriver ? 'driver' : 'rider';
  await admin.from('taxi_events').insert({ ride_id: id, event_type: action, actor });

  const MESSAGES: Record<string, { title: string; message: string; to: 'rider' | 'driver' | null }> = {
    accept: { title: 'Таксист принял заказ', message: 'Машина и водитель назначены — следите за статусом в Такси.', to: 'rider' },
    to_pickup: { title: 'Таксист выехал к вам', message: 'Водитель в пути к точке подачи.', to: 'rider' },
    in_ride: { title: 'Поездка началась', message: 'Пассажир в машине.', to: 'rider' },
    complete: { title: 'Поездка завершена', message: 'Оцените поездку в разделе Такси.', to: 'rider' },
    cancel: isRider
      ? { title: 'Заказ отменён пассажиром', message: 'Пассажир отменил заказ.', to: 'driver' }
      : { title: 'Таксист отменил заказ', message: 'Заказ снова в поиске таксиста.', to: 'rider' },
  };
  const note = MESSAGES[action];
  if (note && note.to) {
    const recipient = note.to === 'rider' ? ride.rider_id : ride.driver_id;
    if (recipient) {
      await admin.from('notifications').insert({
        recipient_id: recipient,
        type: 'taxi_info',
        title: note.title,
        message: note.message,
        sender: 'Такси',
      });
    }
  }

  return withRateLimitHeaders(NextResponse.json({ ride: updated }), { ...limit, limit: 30 });
}
