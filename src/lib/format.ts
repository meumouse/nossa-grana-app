const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export function toCents(v: string | number): number {
  return Math.round(Number(v) * 100);
}
export function fromCents(c: number): number {
  return c / 100;
}

/** Formata dinheiro. `hidden` aplica o modo privacidade (esconde valores). */
export function formatMoney(v: string | number, hidden = false): string {
  if (hidden) return 'R$ ••••';
  return BRL.format(Number(v));
}

export function formatMoneyCents(cents: number, hidden = false): string {
  return formatMoney(fromCents(cents), hidden);
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatMonth(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
}

/** Data de hoje no formato YYYY-MM-DD (para inputs de data). */
export function todayDateInput(): string {
  return new Date().toISOString().slice(0, 10);
}
