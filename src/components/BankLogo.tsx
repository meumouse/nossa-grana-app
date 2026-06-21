import { siBinance, siMercadopago, siNubank, siPagseguro, siPicpay } from 'simple-icons';
import type { SimpleIcon } from 'simple-icons';
import { cn } from '@/lib/utils';

/**
 * Logo do banco. Quando há ícone oficial (simple-icons) renderiza o glifo em
 * branco sobre a cor da marca; senão cai para um badge com as iniciais. Tudo
 * client-side e offline — sem requisições de imagem.
 *
 * Cobertura de logo real é parcial (simple-icons): apenas alguns bancos. Para
 * adicionar mais, basta mapear o nome da instituição → ícone em BANK_ICONS.
 */
const BANK_ICONS: Record<string, SimpleIcon> = {
  nubank: siNubank,
  picpay: siPicpay,
  'mercado pago': siMercadopago,
  pagbank: siPagseguro,
  pagseguro: siPagseguro,
  binance: siBinance,
};

const COMBINING = /[̀-ͯ]/g;
const normalize = (s: string): string =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(COMBINING, '')
    .trim();

function iconFor(name: string): SimpleIcon | undefined {
  return BANK_ICONS[normalize(name)];
}

/** Iniciais p/ o fallback (até 2 letras significativas). */
function initials(name: string): string {
  const words = name.replace(/[^\p{L}\p{N} ]/gu, '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return (words[0]![0]! + words[words.length - 1]![0]!).toUpperCase();
}

export interface BankLogoProps {
  name: string;
  brandColor?: string | null;
  /** Diâmetro em px. Padrão 32. */
  size?: number;
  className?: string;
}

export function BankLogo({ name, brandColor, size = 32, className }: BankLogoProps) {
  const icon = iconFor(name);
  const bg = brandColor || (icon ? `#${icon.hex}` : '#64748b');

  return (
    <span
      className={cn('inline-flex shrink-0 items-center justify-center rounded-full', className)}
      style={{ width: size, height: size, backgroundColor: bg }}
      aria-hidden="true"
      title={name}
    >
      {icon ? (
        <svg
          role="img"
          viewBox="0 0 24 24"
          width={size * 0.58}
          height={size * 0.58}
          fill="#fff"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path d={icon.path} />
        </svg>
      ) : (
        <span
          className="font-semibold leading-none text-white"
          style={{ fontSize: size * 0.38 }}
        >
          {initials(name)}
        </span>
      )}
    </span>
  );
}
