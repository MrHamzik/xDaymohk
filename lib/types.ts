export type VerificationStatus = 'none' | 'pending' | 'verified' | 'rejected';
export type AudienceFilter = 'residents' | 'specialists' | 'verified' | 'admins' | 'open_now' | 'break' | 'offline' | 'flexible';
export type UserMasterStatus = 'auto' | 'active' | 'break' | 'offline' | 'flexible';
export type ProfileStatusType = 'active' | 'break' | 'offline' | 'flexible';

export interface MapPosition {
  lat: number;
  lng: number;
}

export interface MapMarker {
  id: string;
  position: MapPosition;
  label: string;
  description?: string;
  status?: ProfileStatusType;
  onClick?: () => void;
}

export interface Review {
  authorId?: string;
  authorAvatarUrl?: string;
  id: string;
  author: string;
  rating: number;
  text: string;
  createdAt: string;
}

export type ComplaintStatus = 'open' | 'dismissed' | 'resolved';

export interface Complaint {
  id: string;
  profileId: string;
  targetUserId?: string;
  authorId: string;
  authorName: string;
  reason: string;
  status: ComplaintStatus;
  createdAt: string;
}

export interface UserSummary {
  gender?: 'male' | 'female';
  birthDate?: string;
  settlement?: string;
  id: string;
  email: string;
  fullName: string;
  avatarUrl: string;
  isAdmin: boolean;
  isBlocked: boolean;
  profileCount: number;
}

export type NotificationType =
  | 'system'
  | 'profile_hidden'
  | 'profile_visible'
  | 'user_blocked'
  | 'user_unblocked'
  // Активность
  | 'review_received'
  | 'question_commented'
  | 'comment_replied'
  | 'like_received'
  // Жалобы
  | 'complaint_result'
  // Такси
  | 'taxi_request'
  | 'taxi_info';

/** Категории уведомлений (вкладки в центре уведомлений). */
export type NotificationCategory = 'system' | 'activity' | 'complaint' | 'taxi';

export function notificationCategory(type: NotificationType): NotificationCategory {
  switch (type) {
    case 'review_received':
    case 'question_commented':
    case 'comment_replied':
    case 'like_received':
      return 'activity';
    case 'complaint_result':
      return 'complaint';
    case 'taxi_request':
    case 'taxi_info':
      return 'taxi';
    default:
      return 'system';
  }
}

export interface AppNotification {
  id: string;
  recipientId: string;
  type: NotificationType;
  title: string;
  message: string;
  /** Чеченский вариант (показывается, если пользователь выбрал чеченский). */
  titleCe?: string;
  messageCe?: string;
  /** Отправитель (по умолчанию «Даймохк»); админ может изменить. */
  sender?: string;
  isRead: boolean;
  createdAt: string;
}

/** Письмо-уведомление, отправляемое из админки (например, итог жалобы). */
export interface NotificationLetterPayload {
  recipientId: string;
  title: string;
  message: string;
  /** Чеченский вариант темы и текста. */
  ceTitle?: string;
  ceMessage?: string;
  /** Отправитель (по умолчанию «Даймохк»). */
  sender?: string;
  /** Категория; по умолчанию 'system'. */
  type?: NotificationType;
}

export interface Certificate {
  id: string;
  title: string;
  issuer: string;
  year: string;
  imageUrl: string;
}

export interface Profile {
  isPersonal?: boolean; // личная анкета, нельзя скрыть/удалить, минимальная инфа
  gender?: 'male' | 'female';
  birthDate?: string;
  settlement?: string;
  id: string;
  ownerId?: string;
  fullName: string;
  avatarUrl: string;
  photos: string[];
  isSpecialist: boolean;
  professionCategory?: string;
  professionTitle?: string;
  experience?: string;
  experienceStart?: string;
  experienceEnd?: string;
  experienceCurrent?: boolean;
  bio: string;
  workplaceAddress: string;
  workplaceCoords: { lat: number; lng: number };
  rating: number;
  reviewCount: number;
  reviews?: Review[];
  certificates: Certificate[];
  phone: string;
  hidePhone?: boolean;
  /** Whether the questionnaire WhatsApp is synchronized with the account phone. */
  sameAsPhoneWhatsapp?: boolean;
  isVerified?: boolean;
  verificationStatus?: VerificationStatus;
  /** Denormalized display status; account email remains the authority. */
  isAdmin?: boolean;
  /** Questionnaire moderation status. Hidden profiles are not public. */
  isHidden?: boolean;
  /** Legacy alias kept for existing rows; new code uses isHidden. */
  isBanned?: boolean;
  telegram?: string;
  whatsapp?: string;
  videoUrl?: string;
  workDays?: string[];
  workHoursStart?: string;
  workHoursEnd?: string;
  breakStart?: string;
  breakEnd?: string;
  isFlexibleSchedule?: boolean;
  statusOverride?: UserMasterStatus;
  createdAt: string;
}

export const SAMASHKI_ADDRESS_SUGGESTIONS = [
  'ул. Заводская, 28',
  'ул. Школьная, 14',
  'ул. Центральная, 88',
  'ул. А. Айдамирова, 45',
  'ул. Советская, 12',
  'ул. Речная, 5',
  'ул. В. Чапаева, 15',
  'ул. А. Кадырова, 10',
  'ул. Выгонная, 8',
  'ул. М. Акуева, 12',
  'ул. Ленина, 20',
  'ул. Гагарина, 16',
  'ул. А. Магомадова, 22',
  'ул. А. Шерипова, 18',
  'ул. А. Чеченского, 7',
  'ул. М. Мамакаева, 14',
  'ул. М. Эсембаева, 9',
  'ул. Вахи Агаева, 11',
  'ул. В. Высоцкого, 6',
  'ул. Алдама Боьшниева, 15',
  'ул. М. Гайрбекова, 25',
  'ул. М. Дадаева, 30',
  'ул. М.М. Баршигова, 18',
  'ул. М. Мазаева, 12',
  'ул. М. Осипова, 5',
  'ул. М.Ш. Ахмадова, 10',
  'ул. Лермонтова, 19',
  'ул. А. Пушкина, 14',
  'ул. Мира, 8',
  'ул. Победы, 24',
  'ул. Первомайская, 16',
  'ул. Октябрьская, 21',
  'ул. Садовая, 17',
  'ул. Спортивная, 3',
  'ул. Почтовая, 9',
  'ул. Пролетарская, 15',
  'ул. Северная, 11',
  'ул. Южная, 13',
  'ул. Степная, 20',
  'ул. Трудовая, 14',
  'ул. Учительская, 6',
  'ул. Кооперативная, 10',
  'ул. Красноармейская, 12',
  'ул. Линейная, 8',
  'ул. Лорсанова, 15',
  'ул. Луговая, 7',
  'ул. Набережная, 12',
  'ул. Новая, 4',
  'ул. 8 Марта, 14',
  'ул. 9 Мая, 16',
  'трасса Кавказ, автосервис',
];

export const SAMASHKI_STREETS = [
  'А. Айдамирова',
  'А. Кадырова',
  'А. Кулаева',
  'А. Магомадова',
  '1-й А. Магомадова',
  '2-й А. Магомадова',
  'А. Пушкина',
  'А. Сайханова',
  'А. Шерипова',
  'А. Чеченского',
  'А. Захарова',
  'А.А. Назирова',
  'А-Х. Идрисова',
  'Алдама Боьшниева',
  'Абрикосовая',
  'Амбулаторная',
  'Байсултанова',
  'Басоевского',
  'Вахи Агаева',
  'Виноградная',
  'В. Высоцкого',
  'В. Чапаева',
  'Водозаборная',
  'Вокзальная',
  'Выгонная',
  'Гагарина',
  'Заводская',
  'Кооперативная',
  'Красноармейская',
  'Ленина',
  'Лермонтова',
  'Линейная',
  'Лорсанова',
  'Луговая',
  'М. Акуева',
  'М. Висаитова',
  'М. Гайрбекова',
  'М. Дадаева',
  'М.М. Баршигова',
  'М. Мазаева',
  'М. Мамакаева',
  'М. Осипова',
  'М.Ш. Ахмадова',
  'М. Эсембаева',
  'Мира',
  'Молодёжная',
  'Набережная',
  'Новая',
  'Октябрьская',
  'Первомайская',
  'Победы',
  'Подгорная',
  '2-я Подгорная',
  'Почтовая',
  'Пролетарская',
  'Речная',
  'Садовая',
  'Северная',
  'Спортивная',
  'Советская',
  '1-й Советский',
  'Степная',
  'Трудовая',
  'Учительская',
  'Центральная',
  'Школьная',
  'Южная',
  '8 Марта',
  '9 Мая',
  'трасса Кавказ',
];

export const AVATAR_PRESETS = [
  'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?q=80&w=600&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?q=80&w=600&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?q=80&w=600&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1622253692010-333f2da6031d?q=80&w=600&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1544005313-94ddf0286df2?q=80&w=600&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?q=80&w=600&auto=format&fit=crop',
];

export const PROFESSION_CATEGORIES = [
  { id: 'all', label: 'Все', labelCe: 'Дерриг', icon: 'Users' },
  { id: 'doctor', label: 'Здоровье', labelCe: 'Могушалла', icon: 'Stethoscope' },
  { id: 'builder', label: 'Строительство', labelCe: 'ГIишлош яр', icon: 'Hammer' },
  { id: 'teacher', label: 'Образование', labelCe: 'Дешар', icon: 'GraduationCap' },
  { id: 'mechanic', label: 'Авто', labelCe: 'Авто', icon: 'Wrench' },
  { id: 'service', label: 'Бытовые услуги', labelCe: 'ХIусаман гIуллакхаш', icon: 'Scissors' },
  { id: 'trade', label: 'Торговля', labelCe: 'Йохк-эцар', icon: 'ShoppingBag' },
  { id: 'agriculture', label: 'Сельское хозяйство', labelCe: 'Юьртбахам', icon: 'Sprout' },
  { id: 'other', label: 'Другое', labelCe: 'Кхидерш', icon: 'Briefcase' },
];
