/**
 * Admin-only email list for the catalog. Single source of truth
 * (see lib/admin.ts). The DEMO profile sentinel is used to filter
 * obsolete seed data out of Supabase responses.
 */
import { isAdminEmail } from '@/lib/admin';

export { isAdminEmail };

export const DEMO_PROFILE_NAMES = [
  'Лёма Сатуев',
  'Хеди Межидова',
  'Ризван Эдильсултанов',
  'Зарема Дадаева',
  'Асланбек Хатуев',
  'Магомед Ибрагимов',
];

export const DEMO_PROFILE_IDS = ['sam-1', 'sam-2', 'sam-3', 'sam-4', 'sam-5', 'sam-6'];

export function isDemoProfile(p: { id: string; fullName: string }): boolean {
  if (DEMO_PROFILE_IDS.includes(p.id)) return true;
  return DEMO_PROFILE_NAMES.some((name) => p.fullName.includes(name) || name.includes(p.fullName));
}
