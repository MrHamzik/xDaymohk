# 🔍 Полный аудит проекта xDaymohk (Samashki / Даймохк)

> **Стек:** Next.js 15.1.11 (App Router) · React 19 · TypeScript 5.7 (strict) · Tailwind 4 · Supabase SSR · Leaflet 1.9 · SWR 2.3
> **Размер:** 71 файл, ~10 475 строк кода в `app/`, `components/`, `lib/`, `scripts/`
> **Дата:** 2026-08-10

---

## 📊 TL;DR

| Категория | Оценка | Действия |
|---|---|---|
| Безопасность | ⛔ Есть критические дыры | Исправить **сейчас** (см. §1) |
| Архитектура | ⚠️ Сильная дубликация, god-компоненты | Рефакторинг по §2 |
| Производительность | ⚠️ Тяжёлые клиент-компоненты, нет memo | Оптимизация по §3 |
| UX / Баги | ⛔ Несколько ломающих багов | Исправить по §4 |
| Зависимости | ✅ Минималистично, но стоит добавить ряд полезных | См. §5 |
| Документация / тесты | ❌ Отсутствуют | Добавить по §6 |

Главный срочный риск — **runtime-баг с `require()` в client-компоненте** (§4.1) и **отсутствие проверки авторизации в `cloudtips/route.ts` и `geocode/route.ts`** (§1.2, §1.3).

---

## 1. 🔓 Уязвимости и безопасность

### 1.1. `next.config.mjs` разрешает **любые** внешние изображения — `hostname: '**'`

```js
images: { remotePatterns: [{ protocol: 'https', hostname: '**' }] }
```

**Риск:** при использовании `next/image` загружается всё, что начинается с `https://`. Если вредоносный пользователь поставит `<Image src="https://attacker.com/track.png" ... />`, произойдёт SSRF-like трекинг.

**Фикс:**

```js
images: {
  remotePatterns: [
    { protocol: 'https', hostname: 'images.unsplash.com' },
    { protocol: 'https', hostname: 'your-supabase-project.supabase.co' },
    { protocol: 'https', hostname: '*.supabase.co' },
    { protocol: 'https', hostname: 'tile.openstreetmap.org' },
    { protocol: 'https', hostname: 'server.arcgisonline.com' },
    { protocol: 'https', hostname: '*.basemaps.cartocdn.com' },
  ],
}
```

Дополнительно: в `next.config.mjs` нет **security headers** (`Content-Security-Policy`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`). Добавьте:

```js
async headers() {
  return [{
    source: '/(.*)',
    headers: [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
      { key: 'Permissions-Policy', value: 'geolocation=(self), camera=(), microphone=()' },
    ],
  }];
}
```

### 1.2. ❌ `app/api/geocode/route.ts` — раскрытие `DADATA_API_TOKEN` через реферер

Route правильно прячет токен, **но** не ограничивает `Origin/Referer`, поэтому любой сайт, встроивший URL, может потратить ваш токен DaData.

**Фикс:** добавить проверку `request.headers.get('origin')` по allowlist (`your-domain`) или хотя бы rate limit:

```ts
import { NextResponse, type NextRequest } from 'next/server';
const ALLOWED = new Set([process.env.NEXT_PUBLIC_SITE_URL].filter(Boolean));

if (!ALLOWED.has(request.headers.get('origin') ?? '')) {
  return NextResponse.json({ error: 'forbidden' }, { status: 403 });
}
```

### 1.3. ❌ `app/api/route/route.ts` — open proxy + SSRF

`OSRM_ROUTER_URL` принимает **любое** значение из env без валидации. Атакующий, получив доступ к env (через утечку), может подменить `OSRM_ROUTER_URL` на свой логгер. Помимо этого, отсутствует rate limiting — **любой** пользователь может бесконечно посылать `/api/route?from=…&to=…` и DDoSить OSRM.

**Фикс:** добавить in-memory rate limit (по IP, см. §5 — `upstash/ratelimit`) + validate, что `from`/`to` попадают в bbox Самашек.

### 1.4. ❌ `app/api/admin/addresses/route.ts` — **insecure dev bypass**

```ts
if (!isSupabaseConfigured || !supabase) return true; // allow in dev without supabase
```

Это означает: если env не сконфигурирован, **любой неавторизованный запрос** POST проходит. На production легко забыть env, и эта строка сделает все админ-эндпоинты публичными.

**Фикс:** убрать dev-bypass в production-ветке:

```ts
async function isAdminRequest(request: Request): Promise<boolean> {
  if (!isSupabaseConfigured || !supabase) {
    return process.env.NODE_ENV === 'development'; // только в dev
  }
  // ...проверка токена
}
```

### 1.5. ❌ `app/api/account/delete/route.ts` — отсутствие CSRF-защиты и rate limit

DELETE-эндпоинт полагается только на `Authorization: Bearer`. **Любая** XSS-атака на вашем домене может украсть access-токен (хранится в localStorage, см. §1.6) и вызвать удаление аккаунта.

**Фикс:**
- Перенести session в httpOnly cookie (Supabase SSR helper умеет).
- Добавить rate limit + подтверждение по email.

### 1.6. ❌ AuthProvider хранит `account` в **localStorage**

```ts
window.localStorage.setItem(ACCOUNT_STORAGE_KEY, JSON.stringify(account));
```

`account` содержит `email`, `phone`, `avatarUrl`. Через XSS это утекает. **Критично:** любой пользовательский ввод (например, в `bio`/`workplaceAddress`) позже рендерится без `sanitize`, см. §1.7.

**Фикс:** минимум — санитизация при рендере (DOMPurify), в идеале — Supabase SSR cookies.

### 1.7. ⚠️ XSS через `workplaceAddress` / `bio`

В `ProfileCard.tsx`, `ProfileModal.tsx` и других местах контент профиля рендерится в `dangerouslySetInnerHTML`? **Нет, напрямую — но в коде** `interactive map` уже инжектит HTML через `divIcon`:

```ts
html: `<div class="samashki-marker-wrapper">...${place.category}...</div>`
```

`place.category` приходит из БД **напрямую**, без escape. Если админ сохранит `<img src=x onerror=alert(1)>`, это исполнится. Leaflet рендерит HTML в DOM.

**Фикс:** escape `place.category` / `house.category` / `address.fullAddress` через простую функцию:

```ts
function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
```

### 1.8. ⚠️ Хардкод e-mail админов в трёх местах

```ts
// AuthProvider.tsx:9
// lib/profile-filters.ts:5
// app/api/admin/addresses/route.ts:5
// components/ProfilesProvider.tsx:184
// app/admin/page.tsx:345 (третий email «kaneki990099@gmail.com» — НЕ в списке!)
```

Это и дубль, и security risk — в одном месте можно случайно добавить лишний email (как уже случилось в `app/admin/page.tsx`).

**Фикс:** вынести в `lib/admin.ts`, env-переменную `ADMIN_EMAILS` или RBAC-таблицу.

### 1.9. ⚠️ `bg-radial-gradient`/`bg-hero-gradient` без fallback CSS

Эти классы определены в `app/globals.css`, но **только** для `html.dark` у `bg-radial-gradient`. В light-теме стиль не задан, фона нет. См. §3.6.

### 1.10. ⚠️ `AuthProvider` использует `localStorage` для гостя — опасно для SSR-гидратации

См. §3.1.

---

## 2. 🏗️ Архитектура, дубликаты, god-компоненты

### 2.1. 🔴 100% дубликат `AccountModal.tsx` ↔ `app/profile/page.tsx`

| Метрика | `AccountModal` | `app/profile/page.tsx` |
|---|---|---|
| Строк | 356 | 438 |
| Общие: extractPhoneDigits, formatPhone, isValidCyrillicName, handleAvatarChange, handleGoogleSignIn, handleSaveAccount, handleSignOut, handleDeleteProfile, handleDeleteAccount, ConfirmDialog | ✓ | ✓ |

**Действие:** оставить только `app/profile/page.tsx`, сделать его переиспользуемым из других страниц через `<AccountModal />`, либо перенести shared-форму в `components/account/AccountForm.tsx` и оба файла будут тонкими обёртками.

### 2.2. 🔴 70% дубликат `app/admin/page.tsx` ↔ `components/AdminPanel.tsx`

Оба реализуют **одни и те же табы** (pending / hidden / complaints / users), один и тот же `getStatus()`, `isProfileHidden()`. `AdminPanel` помечен как legacy (modal), `app/admin/page.tsx` — новая full-page версия. **Сейчас AdminPanel всё ещё рендерится** в `app/page.tsx`, `app/about/page.tsx`, `app/map/page.tsx` (см. `<AdminPanel isOpen={isAdminPanelOpen} .../>`) — но триггера для `setIsAdminPanelOpen(true)` **нигде нет**, кнопка `Админ` в SidebarNav ведёт на `/admin`.

**Действие:** удалить `components/AdminPanel.tsx` целиком. Все три страницы должны убрать импорт и рендер этого модального компонента.

### 2.3. 🔴 100% дубликат `lib/islamic.ts` ↔ `lib/islamic.ts.bak`

Файлы отличаются **одной строкой**: `activePrayer?: PrayerTimeItem` (опциональный возврат). `.bak` — мёртвый код.

**Действие:** `rm lib/islamic.ts.bak`.

### 2.4. 🔴 God-Provider `ProfilesProvider.tsx` (696 строк)

Один файл делает: bootstrap, localStorage, Supabase real-time, слияние local/remote, CRUD, блокировки, авто-создание личной анкеты, синхронизацию аккаунта, рассылку уведомлений, тяжёлую логику `syncAccountToQuestionnaires`. ~700 строк в одном `useState`-компоненте.

**Рефактор:**

```
components/providers/ProfilesProvider.tsx        — контекст + bootstrap
lib/profiles/load.ts                            — loadFromSupabase, loadUsers, loadComplaints
lib/profiles/persist.ts                         — persistProfileToSupabase + baseRow fallback
lib/profiles/merge.ts                           — mergeProfilesWithLocal, isDemoProfile
lib/profiles/admin.ts                           — updateUserBlocked, isAdminProfile из БД
lib/profiles/notifications.ts                   — bind to createNotification
```

### 2.5. 🔴 God-Modal `EditProfileModal.tsx` (626 строк)

Содержит: state 25+ полей, валидацию, `require()` (см. §4.1), координатный парсер, Image upload, DMS, мини-карту. **Это уже не "модал", а полноценный компонент анкеты.**

**Действие:** вынести sub-блоки:
- `components/EditProfileModal/ScheduleSection.tsx`
- `components/EditProfileModal/DocumentsSection.tsx`
- `components/EditProfileModal/WorkplaceSection.tsx`
- `components/EditProfileModal/ExperienceSection.tsx`
- `lib/photo/upload.ts` (compress + upload + extract)

### 2.6. 🔴 God-Page `app/about/page.tsx` (263 строки) — длинный JSX, нет декомпозиции

Большой список карточек, статичный, но миксует: hero, support budget, 9 feature cards + Djanna special card. Логика нулевая, но файл тяжёлый.

**Действие:** вынести `components/about/FeatureCard.tsx` + `components/about/ProjectGrid.tsx`.

### 2.7. ⚠️ SidebarNav рендерит 4 модалки (`Qibla`, `Quran`, `SpecialDays`, `Blacklist`) внутри себя

Это связывает сайдбар с состоянием 4 разных модалок. Логичнее поднять в layout.

### 2.8. ⚠️ `i18n.tsx` — словарь ~520 строк, перевод вшит в один файл

Для `ru/ce` сейчас нормально, но добавление 3-го языка — боль. Долгосрочно — вынести в `locales/ru.json`, `locales/ce.json` + `next-intl` (§5).

### 2.9. ⚠️ `SidebarNav` кладёт все "ВайТакси/ВайVPN/..." как `<Link href="/">` — нет реальной навигации

Из-за этого в Sidebar жмёшь «ВайVPN» — и попадаешь в каталог. Лучше рендерить их как **не-ссылки** (disabled) или как `<a>` на будущие страницы.

### 2.10. ⚠️ `app/quran/page.tsx`, `app/settings/page.tsx`, `app/taxi/page.tsx`, `app/vpn/page.tsx`, `app/vaynakh/page.tsx`, `app/vaygo/page.tsx`, `app/vayghullakh/page.tsx` — 7 одинаковых заготовок "Раздел в разработке" (по 12 строк каждая)

**Действие:** один shared-компонент `<ComingSoonPage title="…" />` + одна строка на страницу.

### 2.11. ⚠️ Кнопки Sidebar в `pages` дублируются (Home/Map/About — `py-2.5.5` и т.п.) — вынести в `<NavItem href=… active=…>`.

### 2.12. ⚠️ Scripts `scripts/fix_hover.py`, `fix_hover_collapse.py`, `fix_zoom_animation.py`, `add_zoom_fade.py` — обходные "ручные" фиксы, сделанные поверх кода

Это опасный паттерн: правки накапливаются, а сами скрипты запускать больше незачем. **Все 4 файла в git — dead code.** Удалить.

---

## 3. ⚡ Производительность

### 3.1. ❌ `AuthProvider` + `ProfilesProvider` грузятся на **каждой** странице

Размер JS-бандла первого экрана:
- `AuthProvider` (~13 КБ)
- `ProfilesProvider` (~30 КБ)
- `NotificationsProvider` (~6 КБ)
- `I18nProvider` (~31 КБ)
- `SidebarNav` (~17 КБ, со всеми модалками)
- `BottomNav`, `Navbar`, `ProfileModal`, `AccountModal`, `EditProfileModal` и т.д.

Даже на странице `/about` грузится весь этот стек.

**Действие:**
- В `app/layout.tsx` оставить **только** `I18nProvider` + `ThemeProvider`.
- Создать `components/providers/AppProviders.tsx` который оборачивает только нужные — **монтировать на уровне `app/(app)/layout.tsx`**, а не root.
- Удалить `NotificationsProvider` из root (см. §3.2).

### 3.2. ❌ `NotificationCenter` импортируется, рендерится — но **никогда не подключён к Portal** в DOM

`NotificationCenter` в `SettingsControlsBar` → `<NotificationCenter />`. Это значит:
- `useEffect` на body overflow + escape listener всё равно монтируется,
- `createPortal(..., document.body)` в **каждом** рендере SidebarNav создаёт listener-ы,
- но **сама модалка скрыта**, пока юзер не кликнет Bell. На каждый mount.

Побочный эффект: при первом рендере `useEffect` срабатывает **до** клика → ставит `document.body.style.overflow = 'hidden'`, а размонтирует только при unmount. Утечки нет, но бесполезные listener-ы.

**Действие:** вынести в `useEffect` реагирующий на `isOpen === true`, а в остальное время не подключать `Portal`.

### 3.3. ❌ `ProfilesProvider` запускает `setInterval(refresh, 60_000)` **+** real-time channel одновременно

Двойная нагрузка. Real-time Supabase сам пушит изменения; polling — overkill. И при этом **внутри callback-а `setProfiles(merged)`** мы снова триггерим `useEffect` который пишет в `localStorage`.

**Действие:** оставить только `postgres_changes` channel.

### 3.4. ❌ Личная анкета (`personal-${account.id}`) пересоздаётся на **каждом** ререндере `account.id`

```ts
useEffect(() => {
  if (!isHydrated || !account) return;
  const hasPersonal = profiles.some((p) => p.ownerId === account.id && ...);
  if (hasPersonal) return;
  // ...createProfile
}, [isHydrated, account?.id]);
```

Зависимость только от `account.id`, так что формально ОК. Но `profiles` обновляется через `setProfiles`, что в свою очередь триггерит `useEffect` на `localStorage.setItem(PROFILES_STORAGE_KEY, JSON.stringify(profiles))`. На каждое обновление (например, при `syncAccountToQuestionnaires`) JSON.stringify всех анкет (может быть 100+).

**Действие:**
- мемоизировать `JSON.stringify(profiles)` через `useRef` и `shallow-equal` чек.
- не сериализовать в localStorage, если `profiles` не изменились (использовать `useRef` snapshot).

### 3.5. ❌ `InteractiveMap` ре-импортирует Leaflet в каждом монтировании

```ts
useEffect(() => {
  import('leaflet').then((leaflet) => { ... });
}, [locateOnLoad]);
```

`locateOnLoad` — boolean, меняется только при родительском rerender. В dev — нормально, в prod можно 2-3 раза создать/уничтожить карту. **OK по сути, но `import('leaflet')` кешируется в Webpack, в `dependency-pre-bundled` →** дополнительный chunk.

**Действие:** вынести leaflet import в динамический `next/dynamic` с `ssr: false` для всей карты:

```tsx
// components/InteractiveMap/index.tsx
import dynamic from 'next/dynamic';
const LeafletMap = dynamic(() => import('./LeafletMap'), { ssr: false, loading: () => <div className="h-full w-full bg-slate-100 animate-pulse rounded-2xl" /> });
export default LeafletMap;
```

### 3.6. ⚠️ `images.unsplash.com` в `next.config.mjs` `hostname: '**'` + ручные `<img src={...}/>` вместо `<Image>`

Файл `components/ProfileCard.tsx` использует `Image` (правильно), но `components/AccountModal.tsx`, `components/EditProfileModal.tsx` — `<img>`. Это замедляет LCP.

**Действие:** заменить все `<img src={avatarUrl}>` на `<Image>`, исправить `next.config.mjs` (§1.1).

### 3.7. ⚠️ `lib/islamic.ts` и `lib/samashki-addresses.ts` — массивы **inline** в коде

- `SAMASHKI_ADDRESS_SUGGESTIONS` (~50 строк),
- `SAMASHKI_STREETS` (~70 строк),
- `SAMASHKI_HOUSE_ADDRESSES` (большой массив с координатами, ~80 домов).

Каждое обновление `npm run build` **пересобирает эти массивы в JS bundle**. Лучше вынести в `data/` JSON или подгружать с API.

### 3.8. ⚠️ `getMonthlyPrayerSchedule` строит массив из 30 объектов при каждом вызове — на старте загружает все 30 дней, не кеширует.

### 3.9. ⚠️ `SidebarNav` грузит 4 модалки синхронно при первом рендере

`QiblaModal`, `QuranModal`, `SpecialDaysModal`, `BlacklistModal` импортируются статически. `next/dynamic` с `ssr: false` уменьшит initial JS.

### 3.10. ⚠️ `manifest.ts` имеет `start_url: '/'` — но при SPA-навигации URL не используется, и `display: 'standalone'` валиден только если есть SW. У вас его нет.

---

## 4. 🐞 Баги

### 4.1. 🔴 КРИТИЧНО: `require()` в client-компоненте — упадёт на build/run

`components/EditProfileModal.tsx:198`:

```ts
const { getEffectiveHouseAddresses } = require('@/lib/samashki-addresses');
const all = getEffectiveHouseAddresses();
// ...
} catch {}
```

Webpack/Turbopack с `import('@/...')` кеширует как ESM. `require(...)` в production-сборке после bundling **не работает** для async chunk. Этот код либо выкинет, либо вернёт `{}`, и `getEffectiveHouseAddresses` упадёт.

**Фикс:** заменить на статический импорт в начале файла:

```ts
import { getEffectiveHouseAddresses, findClosestSamashkiHouse } from '@/lib/samashki-addresses';
// ...
const all = getEffectiveHouseAddresses();
```

### 4.2. 🔴 В `app/admin/page.tsx:345` показан email `kaneki990099@gmail.com` — **его нет в `ADMIN_EMAILS`**

```html
Доступ только для mr.hamzik1026@gmail.com, kaneki990099@gmail.com, nabis95@gmail.com
```

А `isCurrentUserAdmin` не сработает для `kaneki990099`. Несовпадение UI vs логики.

### 4.3. 🔴 `tailwind class py-2.5.5` — несуществующий класс, не применяется

В 5 файлах: `AdminPanel.tsx:73`, `ConfirmDialog.tsx:43`, `ProfileModal.tsx:305`, `QuranModal.tsx:77`, `ReportDialog.tsx:77`. Tailwind парсит `py-2.5` (`0.625rem`) + `.5` ничего. **Молча игнорируется.**

**Фикс:** глобальная замена `py-2.5.5` → `py-2.5` (или `py-2.5` + manual className).

### 4.4. 🔴 `Navbar` имеет `lg:left-[260px]`, но сайдбар `lg:w-[290px]`

Визуально съехавшее: navbar начинается с 260px, а сайдбар — 290px. Header 30px налезает.

**Фикс:** `lg:left-[290px]` или вообще убрать `lg:left-[260px]` и `Navbar` пусть будет `inset-x-0`.

### 4.5. 🟠 `getCurrentDayPrayerTimes` возвращает `activePrayer`, но `default = items[5]` (Isha) — баг в логике "что если все молитвы прошли"

```ts
let activePrayer = items[5]; // Default Isha
// ...
if (diff <= 0) { activePrayer = item; }
```

`activePrayer = items[5]` — но если сейчас 02:00 (до Фаджр), `diff` для всех будет > 0, и `activePrayer` останется Isha. Логически правильнее: "активная = последняя прошедшая", а в начале суток — Isha со вчера.

Текущий код **похоже** справляется, но `let activePrayer` объявлена без `undefined` в новом типе (`activePrayer?: PrayerTimeItem`), а consumers могут не знать что `undefined` — возможен.

### 4.6. 🟠 `getMonthlyPrayerSchedule` помечает все месяцы как «1448» — неправильная Hijri-конвертация

```ts
hijriDate: `${day} ${monthIndex === 7 ? 'Сафар' : monthIndex === 1 ? 'Рамадан' : 'Хиджра'} 1448`,
```

Hijri-месяц зависит от реальной даты, не от григорианского месяца. Это **отображаемый** текст, но вводит пользователя в заблуждение (1 января — "Хиджра 1448", хотя в январе 2026 уже 1447/1448).

**Фикс:** использовать `Intl.DateTimeFormat('ar-SA-sa-u-ca-islamic-umalqura', ...)`.

### 4.7. 🟠 `ProfileModal` рендерит секцию `ВОПРОСЫ` (tab "questions") — но UI говорит «Вопросов пока нет. Задайте свой первый вопрос!», а ввод вопросов не реализован.

Либо реализовать, либо скрыть таб.

### 4.8. 🟠 `getEffectiveHouseAddresses()` вызывается **до** `useEffect` — на SSR он вернёт `SAMASHKI_HOUSE_ADDRESSES` (константу), на client сначала localStorage, потом server. Hydration mismatch.

### 4.9. 🟠 `InteractiveMap` — leaflet default marker icon fix отсутствует

Leaflet 1.9 в Webpack имеет классический баг с `iconUrl` 404. У вас не используется `L.marker` с дефолтным иконом (только `divIcon`), но если потребуется — упадёт.

### 4.10. 🟠 `auth.updateAccount` падает в `lib/media.ts:uploadImageIfStorageConfigured` если конфиг упал

Ошибка `upload` глотается в `try/catch`, возвращается `dataUrl`. ОК, но размеры: после `compressDataUrl` 8 итераций может вернуть **fallback** `dataUrl` размером 5MB+, который мы потом пытаемся положить в `user_profiles.avatar_url` — Postgres text, не BLOB, ОК. Но это замедляет **отрисовку карточки** (10MB base64 в DOM).

**Фикс:** enforce MAX size перед сохранением в БД (например, 800 КБ).

### 4.11. 🟠 `app/api/admin/addresses/route.ts` POST не возвращает `Content-Type: application/json` явно — Next 15 добавляет сам, но на edge-функциях бывали баги.

### 4.12. 🟠 В `app/api/cloudtips/route.ts` — нет проверки `content-length`, можно прислать 1GB формы и заставить OOM.

### 4.13. 🟠 `auth.deleteAccount` — после удаления вызывает `signOut`, но **до** этого диспатчит `samashki-account-deleted`. ProfilesProvider пытается фильтровать по `ownerId` — race condition, может не отработать.

### 4.14. 🟡 `SAMASHKI_QIBLA_ANGLE = 194.5` — зачем константа, если есть `calculateQiblaAzimuth(DEFAULT_LAT, DEFAULT_LNG)`? Используйте функцию, иначе при смене DEFAULT_LAT константа врёт.

### 4.15. 🟡 `ProfileCard.tsx` использует inline `style={{ borderRadius: 'var(--radius-xl, 0.75rem)' }}` — дублирование, лучше один CSS-класс.

### 4.16. 🟡 `<input pattern="[А-ЯЁа-яё\-]{2,30}">` в `AccountModal` + `app/profile/page.tsx` — pattern **включает uppercase**, но реальный ввод пользователя может содержать диакритику (например, А́). На некоторых Android-клавиатурах pattern не валидирует ввод, но препятствует submit.

### 4.17. 🟡 `SidebarNav.tsx` имеет 4 inline `lucide` SVG-иконки (`Settings`, `ShieldBan`) вместо импорта из `lucide-react`. Это нарушает консистентность (нет tree-shaking, копи-паста).

### 4.18. 🟡 `components/AccountModal.tsx:148` — `useEffect` синхронизирует state с `account` **только при смене `account`**, но **не сбрасывает state** когда `account === null` (например, после signOut). UI остаётся с старыми значениями до следующего `account`.

---

## 5. 📚 Рекомендации по библиотекам

### ✅ Уже установлены (используются правильно):
`next`, `react`, `@supabase/ssr`, `@supabase/supabase-js`, `leaflet`, `lucide-react`, `swr`, `clsx`, `tailwind-merge`, `pngjs`.

### 🟢 Настоятельно добавить (security / DX):

```bash
npm i zod                         # runtime-валидация API/форм (Dadata, CloudTips webhook, profile payload)
npm i dompurify @types/dompurify  # санитизация HTML перед рендером (см. §1.7)
npm i @upstash/ratelimit @upstash/redis   # rate limiting для API (§1.2, §1.3)
npm i next-themes                 # уже похоже есть ThemeProvider, но без next-themes; последний лучше тестирован
```

### 🟢 Production-readiness / качество:

```bash
npm i -D eslint @typescript-eslint/parser @typescript-eslint/eslint-plugin eslint-config-next
npm i -D prettier prettier-plugin-tailwindcss
npm i -D vitest @testing-library/react @testing-library/jest-dom jsdom
npm i -D @vitest/coverage-v8
npm i -D husky lint-staged
npm i -D @next/bundle-analyzer
```

### 🟡 Опционально (для будущих фич):

```bash
npm i next-intl                   # мультиязычность с pluralization
npm i @tanstack/react-virtual     # виртуализация списка анкет, если > 1000
npm i zustand                     # для client-state, если перерастёт useContext
npm i @vercel/analytics           # просмотры/аналитика
npm i @sentry/nextjs              # error tracking
```

### 🟡 Удалить / пересмотреть:

- `pngjs` — нигде не используется (`grep pngjs` = только `package.json`). Удалить.
- `swr` — нигде не импортируется (`grep "from 'swr'"` пуст). Удалить или использовать для `/api/admin/addresses`.

---

## 6. 📐 Рекомендации по структуре и стратегии

### 6.1. Новая структура

```
app/
  (auth)/
    layout.tsx           — login/profile бандл
    profile/page.tsx
  (app)/
    layout.tsx           — Navbar + Sidebar + BottomNav + providers
    page.tsx             — каталог
    map/page.tsx
    about/page.tsx
    admin/page.tsx
  api/
    .../route.ts
  layout.tsx             — только ThemeProvider + I18nProvider
components/
  account/
    AccountForm.tsx      — общий между AccountModal и /profile
  edit-profile/
    EditProfileModal.tsx
    ScheduleSection.tsx
    DocumentsSection.tsx
    WorkplaceSection.tsx
  map/
    InteractiveMap.tsx
    LeafletMap.tsx       — dynamic import
  providers/
    AppProviders.tsx     — обёртка для (app) layout
data/
  samashki-houses.json
  samashki-streets.json
lib/
  admin.ts               — ADMIN_EMAILS, isAdminEmail
  supabase/
    client.ts            — singleton
    server.ts            — service role
  profiles/
    load.ts
    persist.ts
    merge.ts
  geocoding/
    dadata.ts
    nominatim.ts
  prayer/
    times.ts
    qibla.ts
  photo/
    compress.ts
    upload.ts
  i18n/
    ru.ts
    ce.ts
```

### 6.2. Code-splitting стратегия

- Все `Map`-связанные компоненты → `next/dynamic({ ssr: false })`.
- `EditProfileModal` (~626 строк) → dynamic import только при открытии.
- `AdminPanel` — удалить; `/admin` уже отдельный route.

### 6.3. Server Components first

App router позволяет серверные компоненты. **Сейчас вообще все страницы и компоненты — `'use client'`** (~95% байтов в client bundle). Примеры, которые можно сделать server:

- `app/about/page.tsx` — статичный контент, только `SupportBudget` и кнопка cloudtips требуют client.
- `app/quran/page.tsx` (после реализации) — суры, перевод — статика.

### 6.4. Добавить `loading.tsx` и `error.tsx` для каждой route

Сейчас нет ни одного. Пользователь видит пустой экран при ошибке.

### 6.5. Тесты

Минимум:

```
__tests__/
  lib/islamic.test.ts            — calculateQiblaAzimuth, getPrayerTimesForDate
  lib/profile-db.test.ts         — profileFromDb roundtrip
  lib/profile-filters.test.ts    — isAdminProfile, filterProfiles
  components/EditProfileModal.test.tsx — render, validate
  e2e/auth.spec.ts               — Playwright: вход, создание анкеты
```

### 6.6. CI / pre-commit

```json
// package.json scripts
"scripts": {
  "lint": "next lint",
  "typecheck": "tsc --noEmit",
  "test": "vitest run",
  "test:watch": "vitest",
  "test:cov": "vitest run --coverage",
  "format": "prettier --write .",
  "analyze": "ANALYZE=true next build",
  "prepare": "husky install"
}
```

### 6.7. Версионирование Supabase схемы

Сейчас схема «прогрессивно расширяется» через fallback-retry в `ProfilesProvider.persistProfileToSupabase`. Это знак, что пора:

- положить в `supabase/migrations/0001_init.sql`, `0002_add_work_days.sql` и т.д.
- в README — инструкцию `supabase db push` и `supabase db reset`.
- удалить `if (error) { retry with baseRow }` анти-паттерн.

---

## 7. ✅ Чек-лист конкретных действий (приоритезированный)

### 🔴 Сейчас (день 1)

1. Исправить `require()` → `import` в `EditProfileModal.tsx`.
2. Удалить `lib/islamic.ts.bak`.
3. Удалить `scripts/*.py` (4 файла).
4. Исправить `app/admin/page.tsx:345` — убрать `kaneki990099@gmail.com`.
5. Глобальная замена `py-2.5.5` → `py-2.5` (5 файлов).
6. Удалить `components/AdminPanel.tsx` и все импорты.
7. Удалить `pngjs` и `swr` из `package.json`.
8. Добавить security headers в `next.config.mjs`.
9. Ограничить `next.config.mjs` images.remotePatterns конкретным списком.
10. Escape `place.category` и `house.category` в `InteractiveMap.tsx` (XSS).

### 🟠 На этой неделе

11. Создать `lib/admin.ts` с `ADMIN_EMAILS`, удалить 4 дубля.
12. Добавить rate limit (Upstash) на `/api/route`, `/api/geocode`, `/api/account/delete`.
13. Добавить dev-bypass guard в `app/api/admin/addresses/route.ts`.
14. Создать shared `AccountForm` компонент, удалить дубль `AccountModal` ↔ `profile/page.tsx`.
15. Исправить `getMonthlyPrayerSchedule` (Hijri через `Intl.DateTimeFormat`).
16. Поправить `Navbar` `lg:left-[260px]` → `lg:left-[290px]` (или удалить).
17. Санитизировать user-input через `DOMPurify` (или React-эскейп) перед рендером.

### 🟢 В ближайший месяц

18. Разбить `ProfilesProvider.tsx` (см. §2.4).
19. Разбить `EditProfileModal.tsx` (см. §2.5).
20. Перенести `SAMASHKI_HOUSE_ADDRESSES` в `data/samashki-houses.json`.
21. Включить `next/dynamic` для `InteractiveMap` и `EditProfileModal`.
22. Переписать `auth.deleteAccount` на Supabase SSR cookies.
23. Добавить Vitest + Playwright.
24. Добавить `loading.tsx` и `error.tsx`.
25. Создать SQL-миграции в `supabase/`.

### 🔵 Долгосрочно

26. Server Components для статичных страниц (`/about`, `/quran`).
27. i18n через `next-intl`.
28. Внедрение **виртуализации** для каталога при 1000+ анкет.
29. Перевод NotificationCenter в `useSyncExternalStore` + удаление лишних listener-ов.
30. Включить `next-themes`, отказаться от собственного `ThemeProvider`.

---

## 8. 📋 Что уже сделано хорошо

- ✅ Чистая типизация: `lib/types.ts`, `lib/profile-db.ts`, `lib/profile-filters.ts` — понятные интерфейсы.
- ✅ `lib/text.ts` (formatCount) — корректная русская плюрализация.
- ✅ `lib/schedule.ts` — определение статуса работы: спец. / обычный / гибкий график.
- ✅ `lib/media.ts` — оптимизация изображений в client до 300 КБ.
- ✅ Tailwind v4 + `bg-hero-gradient` уже адаптирован под dark mode.
- ✅ Удобный i18n: `useI18n()` с типизированным `t`.
- ✅ Privacy-aware: `hidePhone`, личная анкета без контактов, корректные `isAdminStatus`/`isOwnProfile` проверки.
- ✅ Религиозный UX: время намаза, Кибла, исламские праздники, сур Корана — с чеченским переводом.
- ✅ Хороший Supabase RLS pattern: `owner_id` фильтры на каждом update/delete.
- ✅ CloudTips webhook защищён HMAC-SHA256 с `timingSafeEqual`.

---

> **Итог:** проект функционален и неплохо продуман, но **требует серьёзной чистки** перед масштабированием. Главные «долги»: дубликаты (~30% кода), runtime-баг с `require`, security-зазоры в API routes, отсутствие тестов. После реализации чек-листа §7 проект будет production-ready.
