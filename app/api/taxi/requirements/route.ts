import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-admin';
import { rateLimit, withRateLimitHeaders } from '@/lib/rate-limit';
import { log } from '@/lib/logger';

/**
 * GET /api/taxi/requirements?model=Lada%20Granta — требования к машине
 * по тарифам (таблица Яндекса, сведённая к 4 тарифам; п.9). Анкета
 * таксиста по ним блокирует недоступные тарифы.
 */
export async function GET(request: Request) {
  const limit = await rateLimit(request, { scope: 'taxi:req:get', limit: 60, windowMs: 60_000 });
  if (!limit.allowed) {
    return withRateLimitHeaders(NextResponse.json({ error: 'Слишком много запросов' }, { status: 429 }), { ...limit, limit: 60 });
  }
  const model = (new URL(request.url).searchParams.get('model') ?? '').trim();
  if (!model) return NextResponse.json({ requirement: null });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ requirement: null });

  const { data, error } = await admin.from('car_requirements')
    .select('model, year_economy, year_comfort, year_business, is_minivan')
    .eq('model', model)
    .maybeSingle();
  if (error) {
    log.warn('taxi:requirements:GET', 'query failed', { message: error.message });
    return NextResponse.json({ requirement: null });
  }
  return withRateLimitHeaders(NextResponse.json({
    requirement: data ? {
      model: data.model,
      yearEconomy: data.year_economy != null ? Number(data.year_economy) : null,
      yearComfort: data.year_comfort != null ? Number(data.year_comfort) : null,
      yearBusiness: data.year_business != null ? Number(data.year_business) : null,
      isMinivan: data.is_minivan === true,
    } : null,
  }), { ...limit, limit: 60 });
}
