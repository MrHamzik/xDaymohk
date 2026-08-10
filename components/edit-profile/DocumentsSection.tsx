'use client';

import { useState } from 'react';
import { Award } from 'lucide-react';
import { compressImageFile } from '@/lib/media';
import { Certificate } from '@/lib/types';

interface DocumentsSectionProps {
  certificates: Certificate[];
  setCertificates: (value: Certificate[] | ((prev: Certificate[]) => Certificate[])) => void;
  onNotice: (message: string) => void;
}

const MAX_FILE_SIZE = 5 * 1024 * 1024;

export default function DocumentsSection({ certificates, setCertificates, onNotice }: DocumentsSectionProps) {
  const [title, setTitle] = useState('');
  const [issuer, setIssuer] = useState('');
  const [imageUrl, setImageUrl] = useState('');

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      onNotice('Загрузите изображение документа.');
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      onNotice('Размер исходного документа не должен превышать 5 МБ.');
      return;
    }

    try {
      setImageUrl(await compressImageFile(file));
    } catch (error) {
      onNotice(error instanceof Error ? error.message : 'Не удалось обработать документ.');
    }
  };

  const handleAdd = () => {
    if (!imageUrl) {
      onNotice('Сначала загрузите изображение документа.');
      return;
    }
    const next: Certificate = {
      id: `cert-${Date.now()}`,
      title: title.trim() || 'Документ',
      issuer: issuer.trim() || 'Самашки',
      year: new Date().getFullYear().toString(),
      imageUrl,
    };
    setCertificates((current) => [...current, next]);
    setTitle('');
    setIssuer('');
    setImageUrl('');
  };

  return (
    <div className="space-y-2.5 border-t border-slate-200/80 pt-2.5 dark:border-zinc-800">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-zinc-400">Документы и грамоты</h4>
          <p className="text-[10px] text-slate-500 dark:text-zinc-500">Добавьте дипломы или сертификаты.</p>
        </div>
        <Award className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
      </div>

      {certificates.length > 0 && (
        <div className="space-y-1.5">
          {certificates.map((certificate) => (
            <div key={certificate.id} className="flex items-center gap-2 rounded-xl bg-white p-2 dark:bg-zinc-800">
              <img src={certificate.imageUrl} alt="" className="h-8 w-8 rounded-lg object-cover" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold text-slate-900 dark:text-white">{certificate.title}</p>
                <p className="truncate text-[10px] text-slate-500 dark:text-zinc-500">{certificate.issuer} · {certificate.year}</p>
              </div>
              <button
                type="button"
                onClick={() => setCertificates((items) => items.filter((item) => item.id !== certificate.id))}
                className="shrink-0 px-2 py-1 text-[11px] font-semibold text-red-600 hover:underline dark:text-red-400"
              >
                Удалить
              </button>
            </div>
          ))}
        </div>
      )}

      <input
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder="Название документа"
        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-zinc-800 dark:bg-zinc-800 dark:text-white"
      />
      <input
        value={issuer}
        onChange={(event) => setIssuer(event.target.value)}
        placeholder="Кем выдан"
        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-zinc-800 dark:bg-zinc-800 dark:text-white"
      />
      <input
        id="profile-certificate"
        type="file"
        accept="image/*"
        onChange={handleUpload}
        className="w-full text-xs text-slate-500 file:mr-3 file:rounded-xl file:border-0 file:bg-emerald-600 file:px-3 file:py-1 file:text-xs file:font-semibold file:text-white hover:file:bg-emerald-700"
      />
      {imageUrl && <p className="text-xs text-emerald-700 dark:text-emerald-400">Документ загружен, нажмите «Добавить документ».</p>}
      <button
        type="button"
        onClick={handleAdd}
        className="rounded-xl border border-emerald-200 px-3 py-1 text-xs font-bold text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-300 dark:hover:bg-emerald-950/40"
      >
        Добавить документ
      </button>
    </div>
  );
}
