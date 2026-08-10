/**
 * Lightweight HTML escape for trusted-context strings inserted into HTML
 * (e.g. Leaflet divIcon HTML). DO NOT use for arbitrary user input without
 * additional sanitization (DOMPurify).
 */
export function escapeHtml(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
