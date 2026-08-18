'use client';

import { Fragment, type ReactNode } from 'react';

/**
 * Рендер главы из markdown в оформленный текст для чтения.
 *
 * Почему свой разбор, а не react-markdown
 * ---------------------------------------
 * Нужен ровно один экран возможностей: заголовки, абзацы, списки,
 * таблицы, цитаты, разделители и три вида выделения. Библиотека тянет
 * ~40 КБ и всё равно требует настройки безопасных элементов, а тело
 * главы приходит из админки — то есть это недоверенный ввод.
 *
 * Ключевое свойство: HTML НИКОГДА не вставляется строкой. Разбор
 * возвращает React-элементы из закрытого списка, поэтому <script> или
 * onerror= в тексте главы останутся просто символами на экране.
 *
 * Поддерживаемый синтаксис
 * ------------------------
 *   # / ## / ###   заголовки
 *   > текст        цитата (важное место)
 *   - пункт        маркированный список
 *   1. пункт       нумерованный список
 *   | a | b |      таблица (вторая строка — разделитель)
 *   ---            орнаментальный разделитель
 *   **жирный**  *курсив*  ==выделение цветом==
 *   [текст](https://…)  ссылка (только http/https/mailto)
 */

/** Разбор строчных выделений внутри абзаца. */
function inline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  // Один проход по всем видам выделения: порядок в регулярке задаёт
  // приоритет, поэтому **жирный** не разбирается как два *курсива*.
  const pattern = /(\*\*[^*]+\*\*|\*[^*]+\*|==[^=]+==|\[[^\]]+\]\([^)]+\))/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let index = 0;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) nodes.push(text.slice(last, match.index));
    const token = match[0];
    const key = `${keyPrefix}-i${index}`;
    index += 1;

    if (token.startsWith('**')) {
      nodes.push(<strong key={key} className="font-bold text-slate-900 dark:text-white">{token.slice(2, -2)}</strong>);
    } else if (token.startsWith('==')) {
      // «Выделение другим цветом» — акцент темы, а не жёлтый маркер.
      nodes.push(<mark key={key} className="smk-mark">{token.slice(2, -2)}</mark>);
    } else if (token.startsWith('[')) {
      const cut = token.indexOf('](');
      const label = token.slice(1, cut);
      const href = token.slice(cut + 2, -1);
      // Схему проверяем всегда: javascript:… в ссылке из админки —
      // это исполняемый код при клике.
      const safe = /^(https?:|mailto:|\/)/i.test(href);
      nodes.push(safe ? (
        <a
          key={key}
          href={href}
          target={href.startsWith('/') ? undefined : '_blank'}
          rel="noopener noreferrer"
          className="font-semibold text-emerald-700 underline decoration-emerald-300 underline-offset-2 transition hover:text-emerald-600 dark:text-emerald-400"
        >
          {label}
        </a>
      ) : label);
    } else {
      nodes.push(<em key={key} className="italic">{token.slice(1, -1)}</em>);
    }
    last = match.index + token.length;
  }

  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

/** Разобрать строку таблицы «| a | b |» на ячейки. */
function cells(row: string): string[] {
  return row.replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
}

export default function Prose({ text }: { text: string }) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const blocks: ReactNode[] = [];

  let i = 0;
  let key = 0;
  const next = () => `b${key++}`;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) { i += 1; continue; }

    // Разделитель — орнаментальный, как в карточках.
    if (/^-{3,}$/.test(trimmed)) {
      blocks.push(<hr key={next()} className="smk-orn my-6" />);
      i += 1;
      continue;
    }

    // Заголовки
    const heading = /^(#{1,3})\s+(.*)$/.exec(trimmed);
    if (heading) {
      const level = heading[1].length;
      const content = inline(heading[2], next());
      if (level === 1) {
        blocks.push(<h2 key={next()} className="smk-read-h1">{content}</h2>);
      } else if (level === 2) {
        blocks.push(<h3 key={next()} className="smk-read-h2">{content}</h3>);
      } else {
        blocks.push(<h4 key={next()} className="smk-read-h3">{content}</h4>);
      }
      i += 1;
      continue;
    }

    // Таблица: шапка, строка-разделитель, тело.
    if (trimmed.startsWith('|') && i + 1 < lines.length && /^\|[\s:|-]+\|$/.test(lines[i + 1].trim())) {
      const head = cells(trimmed);
      const body: string[][] = [];
      i += 2;
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        body.push(cells(lines[i].trim()));
        i += 1;
      }
      blocks.push(
        <div key={next()} className="smk-read-table-wrap">
          <table className="smk-read-table">
            <thead>
              <tr>{head.map((c, n) => <th key={n}>{inline(c, `th${n}`)}</th>)}</tr>
            </thead>
            <tbody>
              {body.map((row, r) => (
                <tr key={r}>{row.map((c, n) => <td key={n}>{inline(c, `td${r}-${n}`)}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }

    // Цитата — «важное место»
    if (trimmed.startsWith('>')) {
      const quote: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        quote.push(lines[i].trim().replace(/^>\s?/, ''));
        i += 1;
      }
      blocks.push(
        <blockquote key={next()} className="smk-read-quote">
          {inline(quote.join(' '), next())}
        </blockquote>,
      );
      continue;
    }

    // Списки
    const bullet = /^[-*]\s+/;
    const ordered = /^\d+\.\s+/;
    if (bullet.test(trimmed) || ordered.test(trimmed)) {
      const isOrdered = ordered.test(trimmed);
      const items: string[] = [];
      while (i < lines.length) {
        const cur = lines[i].trim();
        const re = isOrdered ? ordered : bullet;
        if (!re.test(cur)) break;
        items.push(cur.replace(re, ''));
        i += 1;
      }
      const content = items.map((item, n) => <li key={n}>{inline(item, `li${n}`)}</li>);
      blocks.push(isOrdered
        ? <ol key={next()} className="smk-read-list smk-read-list--num">{content}</ol>
        : <ul key={next()} className="smk-read-list">{content}</ul>);
      continue;
    }

    // Абзац: соседние непустые строки склеиваются в один абзац —
    // перенос в редакторе не должен рвать текст на экране.
    const para: string[] = [];
    while (i < lines.length) {
      const cur = lines[i].trim();
      if (!cur || /^(#{1,3}\s|>|[-*]\s|\d+\.\s|\|)/.test(cur) || /^-{3,}$/.test(cur)) break;
      para.push(cur);
      i += 1;
    }
    blocks.push(<p key={next()} className="smk-read-p">{inline(para.join(' '), next())}</p>);
  }

  return <Fragment>{blocks}</Fragment>;
}
