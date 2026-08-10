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
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Не удалось обработать изображение.'));
    image.src = dataUrl;
  });
}

async function compressDataUrl(dataUrl: string) {
  if (!dataUrl.startsWith('data:') || dataUrlBytes(dataUrl) <= MAX_INLINE_IMAGE_BYTES) {
    return dataUrl;
  }

  const image = await loadImage(dataUrl);
  let scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(image.width, image.height));
  let smallestDataUrl = dataUrl;
  let smallestBytes = dataUrlBytes(dataUrl);

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const context = canvas.getContext('2d');
    if (!context) return smallestDataUrl;

    context.drawImage(image, 0, 0, canvas.width, canvas.height);
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

export async function compressImageFile(file: File) {
  const dataUrl = await readFileAsDataUrl(file);
  return compressDataUrl(dataUrl);
}

export async function compressImageDataUrl(dataUrl: string) {
  return compressDataUrl(dataUrl);
}

export async function uploadImageIfStorageConfigured(dataUrl: string, ownerId: string, folder: 'avatars' | 'documents') {
  const safeDataUrl = await compressDataUrl(dataUrl);
  if (!isSupabaseConfigured || !supabase || !safeDataUrl.startsWith('data:')) return safeDataUrl;

  try {
    const response = await fetch(safeDataUrl);
    const blob = await response.blob();
    const path = `${folder}/${ownerId}-${Date.now()}.webp`;
    const { error } = await supabase.storage.from('profile-media').upload(path, blob, {
      contentType: 'image/webp',
      upsert: false,
    });

    if (error) return safeDataUrl;
    return supabase.storage.from('profile-media').getPublicUrl(path).data.publicUrl;
  } catch {
    // The app still works with a compressed inline image if Storage is not configured.
    return safeDataUrl;
  }
}
