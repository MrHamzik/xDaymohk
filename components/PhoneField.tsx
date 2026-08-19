'use client';

interface PhoneFieldProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  describedBy?: string;
  required?: boolean;
}

export default function PhoneField({ id, value, onChange, placeholder = '928 000 00 00', describedBy, required = false }: PhoneFieldProps) {
  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    let digits = event.target.value.replace(/\D/g, '');

    // Accept a pasted +7/8 number, but keep only the ten local digits.
    if (digits.length > 10 && (digits.startsWith('7') || digits.startsWith('8'))) {
      digits = digits.slice(1);
    }

    onChange(digits.slice(0, 10));
  };

  return (
    // Тот же класс .smk-field, что у остальных полей формы: раньше
    // телефон рисовался своим bg-white с рамкой и выглядел приподнятым
    // рядом с «вдавленными» соседями. Разделитель перед +7 — из слота
    // «Разделители», а не из литерала slate-200.
    <div className="smk-field flex w-full items-center overflow-hidden transition focus-within:ring-2 focus-within:ring-emerald-500">
      <span
        className="select-none px-3 py-2.5 text-xs font-bold text-slate-700 dark:text-zinc-300"
        style={{ borderRight: '1px solid var(--smk-divider)' }}
      >
        +7
      </span>
      <input
        id={id}
        type="tel"
        inputMode="numeric"
        autoComplete="tel-national"
        value={value}
        onChange={handleChange}
        placeholder={placeholder}
        aria-describedby={describedBy}
        required={required}
        maxLength={18}
        className="min-w-0 flex-1 bg-transparent px-3 py-2.5 text-xs text-slate-900 outline-none placeholder:text-slate-400 dark:text-white"
      />
    </div>
  );
}
