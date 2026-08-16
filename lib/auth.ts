import { NextResponse } from 'next/server';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { isAdminEmail } from '@/lib/admin';

export interface AuthUser {
  id: string;
  email: string;
}

/**
 * Достаёт пользователя из Bearer-токена запроса.
 * Возвращает { user } или { error, status }.
 */
export async function getUserFromRequest(request: Request): Promise<{ user: AuthUser } | { error: string; status: number }> {
  if (!isSupabaseConfigured || !supabase) {
    return { error: 'Supabase not configured', status: 500 };
  }
  const auth = request.headers.get('authorization');
  const token = auth?.replace('Bearer ', '').trim();
  if (!token) return { error: 'Сессия не найдена', status: 401 };
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user?.email) return { error: 'Сессия недействительна', status: 401 };
  return { user: { id: data.user.id, email: data.user.email } };
}

/**
 * Аутентификация админа (единая для всех admin-роутов).
 */
export async function authenticateAdmin(request: Request): Promise<{ email: string; userId: string } | { error: string; status: number }> {
  const result = await getUserFromRequest(request);
  if ('error' in result) return result;
  if (!isAdminEmail(result.user.email)) {
    return { error: 'Forbidden: admin only', status: 403 };
  }
  return { email: result.user.email, userId: result.user.id };
}

/** Единый ответ об ошибке (для удобства). */
export function authError(result: { error: string; status: number }): NextResponse {
  return NextResponse.json({ error: result.error }, { status: result.status });
}
