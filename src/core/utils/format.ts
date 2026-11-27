import type { DateFormatOption } from '@shared/types/ipc';

export function formatDate(
  value: number | string | Date,
  dateFormat: DateFormatOption = 'dd/mm/yyyy',
  includeTime = true
): string {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  if (dateFormat === 'locale') {
    return includeTime ? d.toLocaleString() : d.toLocaleDateString();
  }
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  let datePart = `${dd}/${mm}/${yyyy}`;
  if (dateFormat === 'mm/dd/yyyy') datePart = `${mm}/${dd}/${yyyy}`;
  else if (dateFormat === 'yyyy-mm-dd') datePart = `${yyyy}-${mm}-${dd}`;
  if (!includeTime) return datePart;
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${datePart} ${hh}:${min}`;
}

export function formatIsk(value: number, compact = false): string {
  if (!Number.isFinite(value)) return '0.00 ISK';
  if (compact) {
    const abs = Math.abs(value);
    if (abs >= 1_000_000_000_000) return `${(value / 1_000_000_000_000).toFixed(2)}T ISK`;
    if (abs >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)}B ISK`;
    if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M ISK`;
    if (abs >= 1_000) return `${(value / 1_000).toFixed(1)}K ISK`;
  }
  return `${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ISK`;
}

export function formatVolume(m3: number): string {
  if (!Number.isFinite(m3)) return '0 m³';
  return `${m3.toLocaleString('en-US', { maximumFractionDigits: 2 })} m³`;
}

export function formatSp(sp: number): string {
  return `${Math.round(sp).toLocaleString('en-US')} SP`;
}

export function getSecurityColorClass(sec: number): string {
  if (sec >= 0.9) return 'text-[#2FEFEF]';
  if (sec >= 0.7) return 'text-[#48F078]';
  if (sec >= 0.5) return 'text-[#E3F545]';
  if (sec > 0.0) return 'text-[#F58E26]';
  return 'text-[#EF4444]';
}

