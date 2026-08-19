import { isSupabaseConfigured, supabase } from '@/lib/supabase';

const MAX_INLINE_IMAGE_BYTES = 300 * 1024;
const MAX_IMAGE_DIMENSION = 1400;

function dataUrlBytes(dataUrl: string) {
  const base64 = dataUrl.split(',')[1] ?? '';
  return Math.ceil((base64.length * 3) / 4);
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Не удалось прочитать изображение.'));
    reader.onerror = () => reject(new Error('Не удалось прочитать изображение.'));
    reader.readAsDataURL(file);
  });
}

function loadImage(dataUrl: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    const timer = window.setTimeout(() => {
      image.onload = null;
      image.onerror = null;
      reject(new Error('Не удалось обработать изображение (таймаут).'));
    }, 15000);
    image.onload = () => {
      window.clearTimeout(timer);
      resolve(image);
    };
    image.onerror = () => {
      window.clearTimeout(timer);
      reject(new Error('Не удалось обработать изображение.'));
    };
    image.src = dataUrl;
  });
}

async function compressDataUrl(dataUrl: string, square = false) {
  if (!dataUrl.startsWith('data:') || dataUrlBytes(dataUrl) <= MAX_INLINE_IMAGE_BYTES) {
    return dataUrl;
  }

  const image = await loadImage(dataUrl);
  // Для аватара сразу вырезаем центральный квадрат — меньше пикселей,
  // меньше вес файла в Storage.
  const cropSize = square ? Math.min(image.width, image.height) : 0;
  const srcX = square ? (image.width - cropSize) / 2 : 0;
  const srcY = square ? (image.height - cropSize) / 2 : 0;
  const srcW = square ? cropSize : image.width;
  const srcH = square ? cropSize : image.height;

  let scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(image.width, image.height));
  let smallestDataUrl = dataUrl;
  let smallestBytes = dataUrlBytes(dataUrl);

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(srcW * scale));
    canvas.height = Math.max(1, Math.round(srcH * scale));
    const context = canvas.getContext('2d');
    if (!context) return smallestDataUrl;

    context.drawImage(image, srcX, srcY, srcW, srcH, 0, 0, canvas.width, canvas.height);
    const compressed = canvas.toDataURL('image/webp', Math.max(0.35, 0.82 - attempt * 0.07));
    const compressedBytes = dataUrlBytes(compressed);
    if (compressedBytes < smallestBytes) {
      smallestDataUrl = compressed;
      smallestBytes = compressedBytes;
    }
    if (compressedBytes <= MAX_INLINE_IMAGE_BYTES) return compressed;
    scale *= 0.72;
  }

  return smallestDataUrl;
}

export async function compressImageFile(file: File, square = false) {
  const dataUrl = await readFileAsDataUrl(file);
  return compressDataUrl(dataUrl, square);
}

/**
 * Добавляет ?v=<timestamp> к URL аватара, если его ещё нет — чтобы браузер
 * не показывал закэшированную старую версию после перезаписи файла в Storage.
 * Работает только с нашими storage-URL (profile-media).
 */
export function cacheBustAvatarUrl(url: string): string {
  // Пустое значение нельзя отдавать в src: React предупреждает
  // («An empty string was passed to the src attribute»), а браузер
  // повторно скачивает саму страницу. У жителей без аватара поле
  // пустое, поэтому подставляем иконку приложения.
  if (!url || !url.trim()) return AVATAR_FALLBACK;
  if (!url.includes('/profile-media/')) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}v=${Date.now()}`;
}

/** Запасной аватар: используется, когда ссылки нет или картинка не грузится. */
export const AVATAR_FALLBACK = '/icon.png';

export async function compressImageDataUrl(dataUrl: string, square = false) {
  return compressDataUrl(dataUrl, square);
}

/**
 * Предел размера файла в Storage, байты.
 *
 * ДУБЛИРУЕТ ограничение самого bucket (обновление 46) намеренно: там
 * оно защищает от обхода через консоль, здесь — даёт человеку понятную
 * ошибку до отправки, вместо технического отказа сервера после
 * ожидания загрузки.
 */
const MAX_UPLOAD_BYTES = 3 * 1024 * 1024;

/** Разрешённые типы. Белый список, как и на bucket. SVG исключён: это
 *  XML с исполняемым JavaScript внутри. */
const ALLOWED_UPLOAD_TYPES = ['image/webp', 'image/jpeg', 'image/png'];

export async function uploadImageIfStorageConfigured(dataUrl: string, ownerId: string, folder: 'avatars' | 'documents') {
  const safeDataUrl = await compressDataUrl(dataUrl, folder === 'avatars');
  if (!isSupabaseConfigured || !supabase || !safeDataUrl.startsWith('data:')) return safeDataUrl;

  try {
    const response = await fetch(safeDataUrl);
    const blob = await response.blob();

    if (blob.size > MAX_UPLOAD_BYTES) {
      throw new Error(
        `Файл слишком большой: ${(blob.size / 1024 / 1024).toFixed(1)} МБ. `
        + `Максимум — ${MAX_UPLOAD_BYTES / 1024 / 1024} МБ.`,
      );
    }
    if (blob.type && !ALLOWED_UPLOAD_TYPES.includes(blob.type)) {
      throw new Error('Можно загружать только изображения JPEG, PNG или WebP.');
    }
    // Путь = uuid владельца: при повторной загрузке аватар ПЕРЕЗАПИСЫВАЕТСЯ,
    // а не копится новыми файлами (upsert: true).
    const path = `${folder}/${ownerId}.webp`;
    const { error } = await supabase.storage.from('profile-media').upload(path, blob, {
      contentType: 'image/webp',
      upsert: true,
    });

    if (error) {
      // Больше НЕ проглатываем: пробрасываем, чтобы пользователь увидел,
      // почему аватар не сохраняется (например, нет прав на bucket).
      throw new Error(`Не удалось загрузить файл в Storage: ${error.message}`);
    }
    return `${supabase.storage.from('profile-media').getPublicUrl(path).data.publicUrl}?v=${Date.now()}`;
  } catch (e) {
    // Пробрасываем наверх, чтобы updateAccount показал реальную причину.
    throw e instanceof Error ? e : new Error('Не удалось загрузить изображение');
  }
}
