import { Profile } from './types';

export const INITIAL_PROFILES: Profile[] = [
  {
    id: 'sam-admin',
    ownerId: 'sam-admin',
    fullName: 'Администратор Даймохк',
    avatarUrl: 'https://images.unsplash.com/photo-1560250097-0b93528c311a?q=80&w=600&auto=format&fit=crop',
    photos: [],
    isSpecialist: false,
    isVerified: true,
    verificationStatus: 'verified',
    isAdmin: true,
    bio: 'Поддержка платформы Даймохк, проверка анкет и модерация каталога.',
    workplaceAddress: 'Даймохк, ул. Центральная, 1',
    workplaceCoords: { lat: 43.288024, lng: 45.298989 },
    rating: 5.0,
    reviewCount: 0,
    reviews: [],
    phone: '+7 (928) 000-00-00',
    hidePhone: false,
    sameAsPhoneWhatsapp: true,
    whatsapp: '79280000000',
    certificates: [],
    createdAt: '2026-01-01'
  },
];

