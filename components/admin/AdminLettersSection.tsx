'use client';

import { useEffect, useState } from 'react';
import { Archive, ChevronDown, Pencil, Save as SaveIcon, Search, Send, Trash2, X } from 'lucide-react';
import AdminLetterEditorCard from '@/components/AdminLetterEditorCard';
import { useI18n } from '@/lib/i18n';
import { useProfiles } from '@/components/ProfilesProvider';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

/**
 * Раздел «Письма»: шаблоны, рассылка, очередь и архив.
 * Вынесен из app/admin/page.tsx.
 */

export default function AdminLettersSection() {
  const { language } = useI18n();
  const L = (ru: string, ce: string) => (language === 'ce' ? ce : ru);
  const { users } = useProfiles();
  const people = users;

  // ==== Раздел «Письма» ====
  interface LetterDraft {
    id?: string;
    key?: string | null;
    letter_type: 'welcome' | 'custom';
    title_ru: string;
    title_ce: string;
    message_ru: string;
    message_ce: string;
    sender: string;
    preset: string;
    color: string;
    icon: string;
    recipients: 'all' | 'selected';
  }
  const [letters, setLetters] = useState<LetterDraft[]>([]);
  const [welcomeForm, setWelcomeForm] = useState<LetterDraft>({
    letter_type: 'welcome', title_ru: '', title_ce: '', message_ru: '', message_ce: '', sender: 'Даймохк', preset: 'green', color: '', icon: '🎉', recipients: 'all',
  });
  // Модальное окно приветственного сообщения (открывается при заходе).
  // Дефолты — те же, что fallback в OnboardingModal (чтобы превью всегда
  // совпадало с реальным окном, даже пока БД не заполнена).
  const [welcomeModal, setWelcomeModal] = useState<LetterDraft>({
    letter_type: 'welcome', title_ru: 'Добро пожаловать в родной Даймохк', title_ce: 'Марша догIийла хьомечу Даймохка', message_ru: 'Вы можете авторизоваться и заполнить профиль, открыть краткое руководство по приложению или продолжить в режиме гостя.', message_ce: 'Хьо авторизаци йан а, профиль кечйан а мега, приложенин доца руководство йилла а, я гостера дIадерзо.', sender: 'Даймохк', preset: 'green', color: '', icon: '🎉', recipients: 'all',
  });
  const [composeForm, setComposeForm] = useState<LetterDraft>({
    letter_type: 'custom', title_ru: '', title_ce: '', message_ru: '', message_ce: '', sender: 'Даймохк', preset: 'green', color: '', icon: '📩', recipients: 'all',
  });
  // Автосохранение черновика «Написать письмо» в localStorage (чтобы не терять
  // при сворачивании/перезагрузке).
  useEffect(() => {
    try {
      const raw = localStorage.getItem('daymohk-compose-draft');
      if (raw) setComposeForm((f) => ({ ...f, ...JSON.parse(raw) }));
    } catch {}
  }, []);
  useEffect(() => {
    try { localStorage.setItem('daymohk-compose-draft', JSON.stringify(composeForm)); } catch {}
  }, [composeForm]);
  const [selectedRecipients, setSelectedRecipients] = useState<Set<string>>(new Set());
  const [recipientSearch, setRecipientSearch] = useState('');
  const [letterMsg, setLetterMsg] = useState('');
  const [letterSending, setLetterSending] = useState(false);

  const loadLetters = async () => {
    try {
      let accessToken = '';
      if (isSupabaseConfigured && supabase) {
        const session = await supabase.auth.getSession();
        accessToken = session.data.session?.access_token || '';
      }
      const res = await fetch('/api/admin/letters', { headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {} });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.letters)) {
          setLetters(data.letters);
          const w = data.letters.find((l: LetterDraft) => l.key === 'welcome');
          if (w) setWelcomeForm({ ...welcomeForm, ...w, letter_type: 'welcome' });
          // Тексты модального окна приветствия — тоже из БД, иначе превью
          // в админке всегда показывало бы дефолтные значения.
          const m = data.letters.find((l: LetterDraft) => l.key === 'welcome_modal');
          if (m) setWelcomeModal({ ...welcomeModal, ...m, letter_type: 'welcome' });
        }
        if (Array.isArray(data.queue)) setScheduleQueue(data.queue);
        if (Array.isArray(data.sent)) setSentLogs(data.sent);
      }
    } catch {}
  };

  useEffect(() => {
    // Раздел монтируется только когда вкладка открыта.
    void (async () => {
      await deliverReady(true);
      await loadLetters();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveWelcome = async () => {
    setLetterMsg('');
    try {
      let accessToken = '';
      if (isSupabaseConfigured && supabase) {
        const session = await supabase.auth.getSession();
        accessToken = session.data.session?.access_token || '';
      }
      const res = await fetch('/api/admin/letters', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
        body: JSON.stringify({ ...welcomeForm, id: 'letter-welcome', key: 'welcome' }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setLetterMsg(`Ошибка: ${d.error || res.status}`);
        return;
      }
      setLetterMsg('Welcome-шаблон сохранён.');
      void loadLetters();
    } catch (e) {
      setLetterMsg(`Ошибка: ${e instanceof Error ? e.message : 'сеть'}`);
    }
    setTimeout(() => setLetterMsg(''), 3000);
  };

  const saveWelcomeModal = async () => {
    setLetterMsg('');
    try {
      let accessToken = '';
      if (isSupabaseConfigured && supabase) {
        const session = await supabase.auth.getSession();
        accessToken = session.data.session?.access_token || '';
      }
      const res = await fetch('/api/admin/letters', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
        body: JSON.stringify({ ...welcomeModal, id: 'letter-welcome-modal', key: 'welcome_modal' }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setLetterMsg(`Ошибка: ${d.error || res.status}`);
        return;
      }
      setLetterMsg('Модальное окно сохранено.');
      void loadLetters();
    } catch (e) {
      setLetterMsg(`Ошибка: ${e instanceof Error ? e.message : 'сеть'}`);
    }
    setTimeout(() => setLetterMsg(''), 3000);
  };

  const translateWelcomeModal = async () => {
    setLetterMsg('Перевожу…');
    const t1 = await googleTranslate(welcomeModal.title_ru);
    const t2 = await googleTranslate(welcomeModal.message_ru);
    setWelcomeModal((f) => ({ ...f, title_ce: t1 || f.title_ce, message_ce: t2 || f.message_ce }));
    if (t1 || t2) setLetterLang((l) => ({ ...l, modal: 'ce' }));
    setLetterMsg(t1 || t2 ? 'Переведено.' : 'Не удалось перевести.');
    setTimeout(() => setLetterMsg(''), 3000);
  };

  const sendCompose = async () => {
    if (!composeForm.title_ru.trim() || !composeForm.message_ru.trim()) {
      setLetterMsg('Заполните заголовок и текст письма (ru).');
      setTimeout(() => setLetterMsg(''), 3000);
      return;
    }
    setLetterSending(true);
    setLetterMsg('');
    try {
      let accessToken = '';
      if (isSupabaseConfigured && supabase) {
        const session = await supabase.auth.getSession();
        accessToken = session.data.session?.access_token || '';
      }
      const recipients = composeForm.recipients === 'all' ? 'all' : Array.from(selectedRecipients);
      if (scheduleEnabled) {
        // По расписанию
        const res = await fetch('/api/admin/letters/schedule', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
          body: JSON.stringify({
            letter: composeForm,
            scheduleAt: scheduleAt ? new Date(scheduleAt).toISOString() : new Date().toISOString(),
            repeat: scheduleRepeat,
            days: scheduleDays,
            count: scheduleCount,
          }),
        });
        const d = await res.json().catch(() => ({}));
        if (!res.ok) {
          setLetterMsg(`Ошибка: ${d.error || res.status}`);
        } else {
          setLetterMsg(`Запланировано на ${new Date(d.runAt).toLocaleString()}.`);
        }
      } else {
        // Сразу
        const res = await fetch('/api/admin/letters/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
          body: JSON.stringify({ letter: composeForm, recipients }),
        });
        const d = await res.json().catch(() => ({}));
        if (!res.ok) {
          setLetterMsg(`Ошибка: ${d.error || res.status}`);
        } else {
          setLetterMsg(`Письмо отправлено: ${d.count} получателям.`);
          // Черновик больше не нужен — очищаем.
          try { localStorage.removeItem('daymohk-compose-draft'); } catch {}
          setComposeForm((f) => ({ ...f, title_ru: '', title_ce: '', message_ru: '', message_ce: '' }));
        }
      }
      void loadSchedule();
    } catch (e) {
      setLetterMsg(`Ошибка: ${e instanceof Error ? e.message : 'сеть'}`);
    } finally {
      setLetterSending(false);
      setTimeout(() => setLetterMsg(''), 4000);
    }
  };

  // ==== Планировщик писем ====
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduleAt, setScheduleAt] = useState('');
  const [scheduleRepeat, setScheduleRepeat] = useState<'once' | 'daily' | 'n_days'>('once');
  const [scheduleDays, setScheduleDays] = useState(1);
  const [scheduleCount, setScheduleCount] = useState(0);
  const [scheduleQueue, setScheduleQueue] = useState<{ id: string; letter_id: string; run_at: string; title_ru?: string }[]>([]);
  // «Отправленные» — история из letter_log (архив, вкладка «Отправленные»).
  const [sentLogs, setSentLogs] = useState<{ id: string; letter_id: string; title_ru: string; title_ce: string; sender: string; count: number; sent_at: string }[]>([]);
  // Модалка «Архив»: вкладки Очередь / Отправленные.
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archiveTab, setArchiveTab] = useState<'queue' | 'sent'>('queue');
  const [archiveMsg, setArchiveMsg] = useState('');
  // Карандаш в очереди: редактирование письма (время + тема + текст + получатели).
  const [editSched, setEditSched] = useState<{
    scheduleId: string;
    letterId: string;
    runAt: string;
    title_ru: string;
    title_ce: string;
    message_ru: string;
    message_ce: string;
    sender: string;
    recipients: 'all' | 'selected';
  } | null>(null);
  const [editSchedBusy, setEditSchedBusy] = useState(false);
  const [editSchedSelected, setEditSchedSelected] = useState<Set<string>>(new Set());

  /** ISO → локальный формат для <input type="datetime-local">. */
  const toLocalInput = (iso: string) => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  // ==== Утилиты писем: перевод (Google), переключатель языка превью ====
  // Какой язык показывает превью-редактор ('ru' | 'ce') для каждого письма.
  const [letterLang, setLetterLang] = useState<Record<'welcome' | 'modal' | 'compose', 'ru' | 'ce'>>({ welcome: 'ru', modal: 'ru', compose: 'ru' });
  // Сворачиваемые блоки раздела «Письма» (по умолчанию свёрнуты — компактно).
  const [lettersOpen, setLettersOpen] = useState<Record<string, boolean>>({ welcome: false, modal: false, compose: false, queue: true });

  const googleTranslate = async (text: string) => {
    if (!text.trim()) return '';
    try {
      const res = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, from: 'ru', to: 'ce' }),
      });
      const d = await res.json().catch(() => ({}));
      return d?.translated || '';
    } catch {
      return '';
    }
  };

  const translateWelcome = async () => {
    setLetterMsg('Перевожу…');
    const t1 = await googleTranslate(welcomeForm.title_ru);
    const t2 = await googleTranslate(welcomeForm.message_ru);
    setWelcomeForm((f) => ({ ...f, title_ce: t1 || f.title_ce, message_ce: t2 || f.message_ce }));
    if (t1 || t2) setLetterLang((l) => ({ ...l, welcome: 'ce' }));
    setLetterMsg(t1 || t2 ? 'Переведено.' : 'Не удалось перевести.');
    setTimeout(() => setLetterMsg(''), 3000);
  };

  const translateCompose = async () => {
    setLetterMsg('Перевожу…');
    const t1 = await googleTranslate(composeForm.title_ru);
    const t2 = await googleTranslate(composeForm.message_ru);
    setComposeForm((f) => ({ ...f, title_ce: t1 || f.title_ce, message_ce: t2 || f.message_ce }));
    if (t1 || t2) setLetterLang((l) => ({ ...l, compose: 'ce' }));
    setLetterMsg(t1 || t2 ? 'Переведено.' : 'Не удалось перевести.');
    setTimeout(() => setLetterMsg(''), 3000);
  };

  const loadSchedule = async () => {
    // Очередь приходит в GET /api/admin/letters (поле queue).
    try {
      let accessToken = '';
      if (isSupabaseConfigured && supabase) {
        const session = await supabase.auth.getSession();
        accessToken = session.data.session?.access_token || '';
      }
      const res = await fetch('/api/admin/letters', { headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {} });
      if (res.ok) {
        const d = await res.json();
        if (Array.isArray(d.queue)) setScheduleQueue(d.queue);
        if (Array.isArray(d.sent)) setSentLogs(d.sent);
      }
    } catch {}
  };

  // Доставка готовых писем (без ручной кнопки): вызывается при открытии
  // раздела «Письма» и при открытии «Архива». Письмо отправляется само, когда
  // наступает время; pg_cron (SQL 11) делает то же каждые 5 минут.
  // Если SQL-функция недоступна — доставку выполняет приложение (fallback
  // в /api/admin/letters/process), и админ видит подсказку применить SQL 15.
  const deliverReady = async (showError = true) => {
    try {
      let accessToken = '';
      if (isSupabaseConfigured && supabase) {
        const session = await supabase.auth.getSession();
        accessToken = session.data.session?.access_token || '';
      }
      const res = await fetch('/api/admin/letters/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (showError) {
          const msg = `Ошибка доставки: ${d.error || res.status}`;
          setArchiveMsg(msg);
          setLetterMsg(msg);
        }
        return false;
      }
      if (d.method === 'node' && d.rpcError) {
        // SQL-функция недоступна — доставка прошла средствами приложения.
        const hint = `Доставлено приложением (SQL-функция недоступна: ${d.rpcError}). Примените supabase/update/15-letters-deliver-delete.sql`;
        setArchiveMsg(hint);
        setLetterMsg(hint);
        setTimeout(() => setLetterMsg(''), 8000);
      } else if (showError && Number(d.processed) > 0) {
        setLetterMsg(`Доставлено писем: ${d.processed}.`);
        setTimeout(() => setLetterMsg(''), 3000);
      }
      return true;
    } catch {
      return false;
    }
  };

  /** Открыть «Архив»: сначала тихо доставляем готовые, затем показываем. */
  const openArchive = async () => {
    setArchiveMsg('');
    setArchiveTab('queue');
    setArchiveOpen(true);
    await deliverReady(true);
    await loadLetters();
  };

  const closeArchive = () => {
    setArchiveOpen(false);
    setEditSched(null);
    setArchiveMsg('');
  };

  /** Удалить письмо из очереди (красная корзина, вкладка «Очередь»). */
  const deleteSchedule = async (scheduleId: string) => {
    setArchiveMsg('');
    try {
      let accessToken = '';
      if (isSupabaseConfigured && supabase) {
        const session = await supabase.auth.getSession();
        accessToken = session.data.session?.access_token || '';
      }
      const res = await fetch(`/api/admin/letters/schedule/${encodeURIComponent(scheduleId)}`, {
        method: 'DELETE',
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setArchiveMsg(`Ошибка: ${d.error || res.status}`);
        return;
      }
      setArchiveMsg(L('Письмо удалено из очереди.', 'Кехат кепийн могIара дIадаьккхина.'));
      setTimeout(() => setArchiveMsg(''), 3000);
      await loadLetters();
    } catch (e) {
      setArchiveMsg(`Ошибка: ${e instanceof Error ? e.message : 'сеть'}`);
    }
  };

  /** Удалить запись из «Отправленных» (история). */
  const deleteLog = async (logId: string) => {
    setArchiveMsg('');
    try {
      let accessToken = '';
      if (isSupabaseConfigured && supabase) {
        const session = await supabase.auth.getSession();
        accessToken = session.data.session?.access_token || '';
      }
      const res = await fetch(`/api/admin/letters/log/${encodeURIComponent(logId)}`, {
        method: 'DELETE',
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setArchiveMsg(`Ошибка: ${d.error || res.status}`);
        return;
      }
      setArchiveMsg(L('Запись удалена из истории.', 'ДIадаздина истори тIера дIадаьккхина.'));
      setTimeout(() => setArchiveMsg(''), 3000);
      await loadLetters();
    } catch (e) {
      setArchiveMsg(`Ошибка: ${e instanceof Error ? e.message : 'сеть'}`);
    }
  };

  /** Карандаш: начать редактирование письма из очереди (время + тема + текст + получатели). */
  const startEditSchedule = (sched: { id: string; letter_id: string; run_at: string }) => {
    const tpl = letters.find((l) => l.id === sched.letter_id);
    setEditSched({
      scheduleId: sched.id,
      letterId: sched.letter_id,
      runAt: sched.run_at,
      title_ru: tpl?.title_ru ?? '',
      title_ce: tpl?.title_ce ?? '',
      message_ru: tpl?.message_ru ?? '',
      message_ce: tpl?.message_ce ?? '',
      sender: tpl?.sender ?? 'Даймохк',
      recipients: tpl?.recipients === 'selected' ? 'selected' : 'all',
    });
    setEditSchedSelected(new Set());
    setArchiveMsg('');
  };

  /** Сохранить изменения письма в очереди (PATCH). */
  const saveEditSchedule = async () => {
    if (!editSched) return;
    if (!editSched.title_ru.trim() || !editSched.message_ru.trim()) {
      setArchiveMsg(L('Заполните тему и текст (ru).', 'Тема а, текст а (ru) дIаязде.'));
      return;
    }
    const parsed = new Date(editSched.runAt);
    if (Number.isNaN(parsed.getTime())) {
      setArchiveMsg(L('Неверное время отправки.', 'ДIадахьитаран хан нийса дац.'));
      return;
    }
    setEditSchedBusy(true);
    setArchiveMsg('');
    try {
      let accessToken = '';
      if (isSupabaseConfigured && supabase) {
        const session = await supabase.auth.getSession();
        accessToken = session.data.session?.access_token || '';
      }
      const res = await fetch(`/api/admin/letters/schedule/${encodeURIComponent(editSched.scheduleId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
        body: JSON.stringify({
          runAt: editSched.runAt,
          letter: {
            id: editSched.letterId,
            title_ru: editSched.title_ru,
            title_ce: editSched.title_ce,
            message_ru: editSched.message_ru,
            message_ce: editSched.message_ce,
            sender: editSched.sender,
            recipients: editSched.recipients,
          },
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setArchiveMsg(`Ошибка: ${d.error || res.status}`);
        return;
      }
      setArchiveMsg(L('Сохранено.', 'ДIаяздина.'));
      setEditSched(null);
      setTimeout(() => setArchiveMsg(''), 3000);
      await loadLetters();
    } catch (e) {
      setArchiveMsg(`Ошибка: ${e instanceof Error ? e.message : 'сеть'}`);
    } finally {
      setEditSchedBusy(false);
    }
  };

  /** Включение «Отправить по расписанию»: время по умолчанию = сейчас. */
  const toggleSchedule = (checked: boolean) => {
    setScheduleEnabled(checked);
    if (checked && !scheduleAt) {
      const now = new Date();
      const pad = (n: number) => String(n).padStart(2, '0');
      setScheduleAt(`${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`);
    }
  };

  return (
    <>
          <section className="space-y-5">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">{L('Письма', 'Кехаташ')}</h3>
              <p className="text-sm text-slate-500 dark:text-zinc-500">{L('Превью показывает письмо ровно так, как его видит пользователь в уведомлениях. Текст внутри письма редактируется прямо в превью; переключатель RU/CE — язык письма.', 'Превью гойту кехат бакъонца, лелошхочо уведомленашкахь санна. Кехатан чоьхьара йоза превью чохь дIаяздо; RU/CE тIелацар — кехатан мотт.')}</p>
            </div>

            {letterMsg && <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300">{letterMsg}</div>}

            {/* Уведомление после регистрации + Приветственное сообщение — два превью-редактора в ряд */}
            <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
              <AdminLetterEditorCard
                title={L('Уведомление после регистрации', 'Регистрацин тIехьа хаам')}
                hint={L('Отправляется новым пользователям при регистрации. Нажмите на текст внутри письма — он редактируется прямо в превью.', 'ДIабалабеллачу лелошхочунна дIадахьита. Кехатан чоьхьара йозана тIехьа тIе тоха — превью чохь дIаяздо.')}
                draft={welcomeForm}
                onChange={(patch) => setWelcomeForm((f) => ({ ...f, ...patch }))}
                lang={letterLang.welcome}
                onLangChange={(l) => setLetterLang((s) => ({ ...s, welcome: l }))}
                onTranslate={() => void translateWelcome()}
                onSave={() => void saveWelcome()}
                saveLabel={L('Сохранить шаблон', 'Шаблон дIаязде')}
                collapsed={!lettersOpen.welcome}
                onToggle={() => setLettersOpen((o) => ({ ...o, welcome: !o.welcome }))}
              />
              <AdminLetterEditorCard
                title={L('Приветственное сообщение', 'Марша догIийла хаам')}
                hint={L('Окно, которое открывается при заходе в приложение. Превью — точная копия реального окна. Текст редактируется прямо в превью.', 'ХIокху корто санна дIаеллалучу окно, приложене чувоьдуш. Превью — бакъчу окнан бакъха копи. Йоза превью чохь дIаяздо.')}
                variant="welcome"
                draft={welcomeModal}
                onChange={(patch) => setWelcomeModal((f) => ({ ...f, ...patch }))}
                lang={letterLang.modal}
                onLangChange={(l) => setLetterLang((s) => ({ ...s, modal: l }))}
                onTranslate={() => void translateWelcomeModal()}
                onSave={() => void saveWelcomeModal()}
                saveLabel={L('Сохранить', 'ДIаязде')}
                collapsed={!lettersOpen.modal}
                onToggle={() => setLettersOpen((o) => ({ ...o, modal: !o.modal }))}
              />
            </div>

            {/* Написать письмо — превью-редактор рассылки + получатели и расписание в конце */}
            <AdminLetterEditorCard
              title={L('Написать письмо', 'Кехат язъе')}
              hint={L('Отправляется сразу всем или выбранным пользователям (в уведомления). Текст редактируется прямо в превью; получатели и расписание — в конце.', 'ДIадахьийтина массарна йа харжамна лелошхошна (уведомленашка). Йоза превью чохь дIаяздо; дIаэцарех а, расписанех а — чаккхенгахь.')}
              draft={composeForm}
              onChange={(patch) => setComposeForm((f) => ({ ...f, ...patch }))}
              lang={letterLang.compose}
              onLangChange={(l) => setLetterLang((s) => ({ ...s, compose: l }))}
              onTranslate={() => void translateCompose()}
              collapsed={!lettersOpen.compose}
              onToggle={() => setLettersOpen((o) => ({ ...o, compose: !o.compose }))}
              footer={
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" onClick={() => void sendCompose()} disabled={letterSending} className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-60">
                    <Send className="h-3.5 w-3.5" />
                    {letterSending ? L('Отправляем…', 'ДIадахка…') : (scheduleEnabled ? L('Запланировать', 'План хIотто') : L('Отправить', 'ДIадахка'))}
                  </button>
                  <button type="button" onClick={() => void openArchive()} className="inline-flex items-center gap-1.5 smk-field px-4 py-2.5 text-xs font-bold text-slate-700 shadow-sm hover:bg-slate-50  dark:text-zinc-300">
                    <Archive className="h-3.5 w-3.5" />
                    {L('Архив', 'Архив')} ({scheduleQueue.length + sentLogs.length})
                  </button>
                </div>
              }
              afterFooter={
                <div className="space-y-3">
                  <button
                    type="button"
                    onClick={() => setLettersOpen((o) => ({ ...o, queue: !o.queue }))}
                    aria-expanded={lettersOpen.queue}
                    className="flex w-full items-center justify-between gap-2 text-left"
                  >
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">{L('Получатели и расписание', 'ДIаэцархой а, расписани а')}</h4>
                    <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${lettersOpen.queue ? '' : '-rotate-90'}`} />
                  </button>

                  {lettersOpen.queue && (
                  <>
                  {/* Получатели */}
                  <label className="mb-1 block smk-text-label font-bold text-slate-500 dark:text-zinc-400">{L('Получатели', 'ДIаэцархой')}</label>
                  <div className="flex flex-wrap gap-1.5">
                    <button type="button" onClick={() => setComposeForm({ ...composeForm, recipients: 'all' })} className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${composeForm.recipients === 'all' ? 'bg-emerald-600 text-white' : 'border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300'}`}>{L('Все пользователи', 'Массо лелошхой')}</button>
                    <button type="button" onClick={() => setComposeForm({ ...composeForm, recipients: 'selected' })} className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${composeForm.recipients === 'selected' ? 'bg-emerald-600 text-white' : 'border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300'}`}>{L('Выбрать', 'Харжа')} ({selectedRecipients.size})</button>
                  </div>
                  {composeForm.recipients === 'selected' && (
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-2 dark:border-zinc-700 dark:bg-zinc-900">
                      <div className="relative mb-1.5">
                        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                        <input
                          value={recipientSearch}
                          onChange={(e) => setRecipientSearch(e.target.value)}
                          placeholder={L('Поиск по имени…', 'ЦIерца лахар…')}
                          className="w-full rounded-lg border border-slate-200 bg-white py-1.5 pl-8 pr-2 text-xs outline-none focus:ring-2 focus:ring-emerald-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                        />
                      </div>
                      <div className="grid max-h-40 grid-cols-1 gap-1 overflow-y-auto no-scrollbar sm:grid-cols-2">
                        {people
                          .filter((u) => u.fullName.toLowerCase().includes(recipientSearch.trim().toLowerCase()))
                          .map((u) => (
                            <label key={u.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1 text-xs text-slate-700 hover:bg-slate-100 dark:text-zinc-300 dark:hover:bg-zinc-800">
                              <input type="checkbox" checked={selectedRecipients.has(u.id)} onChange={(e) => setSelectedRecipients((cur) => { const n = new Set(cur); if (e.target.checked) n.add(u.id); else n.delete(u.id); return n; })} className="h-3.5 w-3.5 rounded text-emerald-600" />
                              <span className="truncate">{u.fullName}</span>
                            </label>
                          ))}
                        {people.filter((u) => u.fullName.toLowerCase().includes(recipientSearch.trim().toLowerCase())).length === 0 && (
                          <p className="col-span-full py-2 text-center smk-text-label text-slate-400">{L('Никого не найдено', 'Цхьан а ца карийна')}</p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Планирование */}
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-zinc-700 dark:bg-zinc-900">
                    <label className="flex cursor-pointer items-center gap-2 smk-text-label font-bold text-slate-600 dark:text-zinc-300">
                      <input type="checkbox" checked={scheduleEnabled} onChange={(e) => toggleSchedule(e.target.checked)} className="h-4 w-4 rounded text-emerald-600 focus:ring-emerald-500" />
                      {L('Отправить по расписанию', 'Расписаница дIадахка')}
                    </label>
                    {scheduleEnabled && (
                      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <div>
                          <label className="mb-1 block smk-text-label font-bold text-slate-400">{L('Время отправки', 'ДIадахьитаран хан')}</label>
                          <input type="datetime-local" value={scheduleAt} onChange={(e) => setScheduleAt(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs dark:border-zinc-700 dark:bg-zinc-800 dark:text-white" />
                        </div>
                        <div>
                          <label className="mb-1 block smk-text-label font-bold text-slate-400">{L('Частота', 'Цуьнан-хIокху')}</label>
                          <select value={scheduleRepeat} onChange={(e) => setScheduleRepeat(e.target.value as 'once' | 'daily' | 'n_days')} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs dark:border-zinc-700 dark:bg-zinc-800 dark:text-white">
                            <option value="once">{L('Один раз', 'Цкъа')}</option>
                            <option value="daily">{L('Каждый день', 'ХIора дийнахь')}</option>
                            <option value="n_days">{L('Каждые N дней', 'ХIора N де')}</option>
                          </select>
                        </div>
                        {scheduleRepeat === 'n_days' && (
                          <div>
                            <label className="mb-1 block smk-text-label font-bold text-slate-400">{L('Каждые N дней', 'ХIора N де')}</label>
                            <input type="number" min={1} max={365} value={scheduleDays} onChange={(e) => setScheduleDays(Number(e.target.value) || 1)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs dark:border-zinc-700 dark:bg-zinc-800 dark:text-white" />
                          </div>
                        )}
                        {scheduleRepeat !== 'once' && (
                          <div>
                            <label className="mb-1 block smk-text-label font-bold text-slate-400">{L('Сколько раз (0 = всегда)', 'Массо а хан (0 = массалла а)')}</label>
                            <input type="number" min={0} value={scheduleCount} onChange={(e) => setScheduleCount(Number(e.target.value) || 0)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs dark:border-zinc-700 dark:bg-zinc-800 dark:text-white" />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  </>
                  )}
                </div>
              }
            />

          </section>
      {archiveOpen && (
        <div className="fixed inset-0 z-[95] flex items-center justify-center bg-zinc-950/70 p-4 backdrop-blur-md" role="dialog" aria-modal="true" aria-labelledby="archive-title">
          <div className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden smk-sheet shadow-2xl">
            <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-zinc-800">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400">
                  <Archive className="h-5 w-5" />
                </div>
                <div>
                  <h3 id="archive-title" className="text-base font-bold text-slate-900 dark:text-white">{L('Архив писем', 'Кехатийн архив')}</h3>
                  <p className="text-xs text-slate-500 dark:text-zinc-500">{L('Очередь и отправленные письма', 'Кеп а, дIадаьхна кехаташ а')}</p>
                </div>
              </div>
              <button type="button" onClick={closeArchive} aria-label={L('Закрыть', 'ДIакъовла')} className="smk-hit flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-600 transition hover:bg-slate-200 dark:bg-zinc-800 dark:text-zinc-400">
                <X className="h-4 w-4" />
              </button>
            </div>

            {!editSched ? (
              <>
                {/* Вкладки: Очередь / Отправленные */}
                <div className="flex shrink-0 gap-1 border-b border-slate-100 px-5 pt-3 dark:border-zinc-800">
                  <button
                    type="button"
                    onClick={() => setArchiveTab('queue')}
                    className={`rounded-t-lg px-3 py-2 text-xs font-bold transition ${archiveTab === 'queue' ? 'border-b-2 border-emerald-600 text-emerald-700 dark:text-emerald-400' : 'text-slate-500 hover:text-slate-700 dark:text-zinc-400'}`}
                  >
                    {L('Очередь', 'Кеп')} ({scheduleQueue.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setArchiveTab('sent')}
                    className={`rounded-t-lg px-3 py-2 text-xs font-bold transition ${archiveTab === 'sent' ? 'border-b-2 border-emerald-600 text-emerald-700 dark:text-emerald-400' : 'text-slate-500 hover:text-slate-700 dark:text-zinc-400'}`}
                  >
                    {L('Отправленные', 'ДIадаьхнарш')} ({sentLogs.length})
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto px-5 py-4 no-scrollbar">
                  {archiveMsg && <div className="mb-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300">{archiveMsg}</div>}

                  {archiveTab === 'queue' ? (
                    scheduleQueue.length === 0 ? (
                      <p className="py-8 text-center text-xs text-slate-500 dark:text-zinc-500">{L('В очереди пусто. Письмо попадает в очередь при планировании.', 'Кепехь хIумма а дац. Кехат кепе воьду плане хIоттош.')}</p>
                    ) : (
                      <div className="space-y-2">
                        {scheduleQueue.map((q) => {
                          const ready = new Date(q.run_at) <= new Date();
                          return (
                            <div key={q.id} className="flex items-center gap-2 smk-inset p-3">
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-xs font-bold text-slate-900 dark:text-white">{q.title_ru || L('Письмо', 'Кехат')}</p>
                                <p className={`mt-0.5 smk-text-label font-semibold ${ready ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500 dark:text-zinc-500'}`}>
                                  {new Date(q.run_at).toLocaleString()}
                                  {ready && <span className="ml-1 rounded bg-emerald-100 px-1 py-0.5 smk-text-label font-bold text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">{L('к отправке', 'дIадахьита')}</span>}
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={() => startEditSchedule(q)}
                                aria-label={L('Редактировать', 'Хийца')}
                                title={L('Редактировать', 'Хийца')}
                                className="smk-hit flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-emerald-700 dark:hover:bg-zinc-800"
                              >
                                <Pencil className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => void deleteSchedule(q.id)}
                                aria-label={L('Удалить', 'ДIадайа')}
                                title={L('Удалить', 'ДIадайа')}
                                className="smk-hit flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-red-50 text-red-600 transition hover:bg-red-100 dark:bg-red-950/40 dark:text-red-400"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )
                  ) : sentLogs.length === 0 ? (
                    <p className="py-8 text-center text-xs text-slate-500 dark:text-zinc-500">{L('Отправленных писем пока нет.', 'ДIадаьхна кехаташ хIинца бац.')}</p>
                  ) : (
                    <div className="space-y-2">
                      {sentLogs.map((log) => (
                        <div key={log.id} className="flex items-center gap-2 rounded-2xl border border-slate-100 bg-slate-50 p-3 dark:border-zinc-800 dark:bg-zinc-900/60">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-bold text-slate-900 dark:text-white">{log.title_ru || L('Письмо', 'Кехат')}</p>
                            <p className="mt-0.5 smk-text-label text-slate-500 dark:text-zinc-500">
                              {new Date(log.sent_at).toLocaleString()} · {L('получателей', 'дIаэцархой')}: {log.count} · {log.sender}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => void deleteLog(log.id)}
                            aria-label={L('Удалить', 'ДIадайа')}
                            title={L('Удалить из истории', 'Исторех дIадайа')}
                            className="smk-hit flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-red-50 text-red-600 transition hover:bg-red-100 dark:bg-red-950/40 dark:text-red-400"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            ) : (
              /* Карандаш: редактирование письма из очереди */
              <div className="flex-1 space-y-3 overflow-y-auto p-5 no-scrollbar">
                {archiveMsg && <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300">{archiveMsg}</div>}
                <div>
                  <label className="mb-1 block smk-text-label font-bold text-slate-500 dark:text-zinc-400">{L('Время отправки', 'ДIадахьитаран хан')}</label>
                  <input type="datetime-local" value={toLocalInput(editSched.runAt)} onChange={(e) => setEditSched({ ...editSched, runAt: e.target.value })} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs dark:border-zinc-700 dark:bg-zinc-800 dark:text-white" />
                </div>
                <div>
                  <label className="mb-1 block smk-text-label font-bold text-slate-500 dark:text-zinc-400">{L('Тема (RU)', 'Тема (RU)')}</label>
                  <input value={editSched.title_ru} onChange={(e) => setEditSched({ ...editSched, title_ru: e.target.value })} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs dark:border-zinc-700 dark:bg-zinc-800 dark:text-white" />
                </div>
                <div>
                  <label className="mb-1 block smk-text-label font-bold text-slate-500 dark:text-zinc-400">{L('Текст (RU)', 'Текст (RU)')}</label>
                  <textarea rows={3} value={editSched.message_ru} onChange={(e) => setEditSched({ ...editSched, message_ru: e.target.value })} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs dark:border-zinc-700 dark:bg-zinc-800 dark:text-white" />
                </div>
                <div>
                  <label className="mb-1 block smk-text-label font-bold text-slate-500 dark:text-zinc-400">{L('Тема (CE)', 'Тема (CE)')}</label>
                  <input value={editSched.title_ce} onChange={(e) => setEditSched({ ...editSched, title_ce: e.target.value })} className="w-full rounded-xl border border-emerald-200 bg-emerald-50/40 px-3 py-2 text-xs dark:border-emerald-900/50 dark:bg-emerald-950/20 dark:text-white" />
                </div>
                <div>
                  <label className="mb-1 block smk-text-label font-bold text-slate-500 dark:text-zinc-400">{L('Текст (CE)', 'Текст (CE)')}</label>
                  <textarea rows={2} value={editSched.message_ce} onChange={(e) => setEditSched({ ...editSched, message_ce: e.target.value })} className="w-full rounded-xl border border-emerald-200 bg-emerald-50/40 px-3 py-2 text-xs dark:border-emerald-900/50 dark:bg-emerald-950/20 dark:text-white" />
                </div>
                <div>
                  <label className="mb-1 block smk-text-label font-bold text-slate-500 dark:text-zinc-400">{L('Отправитель', 'ДIадахочо')}</label>
                  <input value={editSched.sender} onChange={(e) => setEditSched({ ...editSched, sender: e.target.value })} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs dark:border-zinc-700 dark:bg-zinc-800 dark:text-white" />
                </div>
                <div>
                  <label className="mb-1 block smk-text-label font-bold text-slate-500 dark:text-zinc-400">{L('Получатели', 'ДIаэцархой')}</label>
                  <div className="flex flex-wrap gap-1.5">
                    <button type="button" onClick={() => setEditSched({ ...editSched, recipients: 'all' })} className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${editSched.recipients === 'all' ? 'bg-emerald-600 text-white' : 'border border-slate-200 bg-slate-50 text-slate-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300'}`}>{L('Все пользователи', 'Массо лелошхой')}</button>
                    <button type="button" onClick={() => setEditSched({ ...editSched, recipients: 'selected' })} className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${editSched.recipients === 'selected' ? 'bg-emerald-600 text-white' : 'border border-slate-200 bg-slate-50 text-slate-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300'}`}>{L('Выбрать', 'Харжа')} ({editSchedSelected.size})</button>
                  </div>
                  {editSched.recipients === 'selected' && (
                    <div className="mt-2 grid max-h-32 grid-cols-1 gap-1 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-2 dark:border-zinc-700 dark:bg-zinc-900 no-scrollbar sm:grid-cols-2">
                      {people.map((u) => (
                        <label key={u.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1 text-xs text-slate-700 hover:bg-slate-100 dark:text-zinc-300 dark:hover:bg-zinc-800">
                          <input type="checkbox" checked={editSchedSelected.has(u.id)} onChange={(e) => setEditSchedSelected((cur) => { const n = new Set(cur); if (e.target.checked) n.add(u.id); else n.delete(u.id); return n; })} className="h-3.5 w-3.5 rounded text-emerald-600" />
                          <span className="truncate">{u.fullName}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {editSched && (
              <div className="flex shrink-0 items-center justify-end gap-2 border-t border-slate-100 px-5 py-4 dark:border-zinc-800">
                <button type="button" onClick={() => setEditSched(null)} className="smk-field px-3.5 py-2 text-xs font-bold text-slate-600 transition hover:bg-slate-100  dark:text-zinc-300">
                  {L('Отмена', 'Юхадаккха')}
                </button>
                <button type="button" onClick={() => void saveEditSchedule()} disabled={editSchedBusy} className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white transition hover:bg-emerald-700 disabled:opacity-50">
                  <SaveIcon className="h-3.5 w-3.5" />
                  {editSchedBusy ? L('Сохраняем…', 'ДIаяздо…') : L('Сохранить', 'ДIаязде')}
                </button>
              </div>
            )}
          </div>
        </div>
      )}


    </>
  );
}
