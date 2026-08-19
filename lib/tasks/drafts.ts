import type { PaymentMethod } from '@/lib/payments';
import type { TaskKind, TaskPriority } from '@/lib/types';

export interface TaskDraft {
  kind: TaskKind;
  title: string;
  description: string;
  category: string;
  reward: string;
  purchaseBudget: string;
  priority: TaskPriority;
  slots: string;
  address: string;
  paymentMethod: PaymentMethod;
  minRating: string;
  minAccountDays: string;
  minTasksDone: string;
  allowNewcomers: boolean;
}

export interface TaskTemplate extends TaskDraft {
  id: string;
  name: string;
}

const draftKey = (paid: boolean) => `daymohk-task-draft-${paid ? 'paid' : 'free'}`;
const tplKey = (paid: boolean) => `daymohk-task-tpl-${paid ? 'paid' : 'free'}`;
const MAX_TEMPLATES = 8;

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : fallback;
  } catch {
    return fallback;
  }
}

export function loadTaskDraft(paid: boolean): TaskDraft | null {
  return readJson<TaskDraft | null>(draftKey(paid), null);
}

export function saveTaskDraft(paid: boolean, draft: TaskDraft): void {
  try {
    window.localStorage.setItem(draftKey(paid), JSON.stringify(draft));
  } catch {
    //
  }
}

export function clearTaskDraft(paid: boolean): void {
  try {
    window.localStorage.removeItem(draftKey(paid));
  } catch {
    //
  }
}

export function loadTemplates(paid: boolean): TaskTemplate[] {
  const list = readJson<TaskTemplate[]>(tplKey(paid), []);
  return Array.isArray(list) ? list.slice(0, MAX_TEMPLATES) : [];
}

export function saveTemplate(paid: boolean, draft: TaskDraft, name: string): TaskTemplate[] {
  const list = loadTemplates(paid).filter((item) => item.name !== name);
  const next: TaskTemplate[] = [
    { ...draft, id: `tpl-${Date.now()}`, name: name.slice(0, 40) },
    ...list,
  ].slice(0, MAX_TEMPLATES);
  try {
    window.localStorage.setItem(tplKey(paid), JSON.stringify(next));
  } catch {
    //
  }
  return next;
}

export function removeTemplate(paid: boolean, id: string): TaskTemplate[] {
  const next = loadTemplates(paid).filter((item) => item.id !== id);
  try {
    window.localStorage.setItem(tplKey(paid), JSON.stringify(next));
  } catch {
    //
  }
  return next;
}

export function draftIsEmpty(draft: TaskDraft): boolean {
  return !draft.title.trim() && !draft.description.trim() && !draft.address.trim();
}
