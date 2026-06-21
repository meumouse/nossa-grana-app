import * as React from 'react';
import { cn } from '@/lib/utils';
import { Input } from './input';

export interface CurrencyInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /** Símbolo de moeda exibido como prefixo (padrão: "R$"). */
  symbol?: string;
}

const CurrencyInput = React.forwardRef<HTMLInputElement, CurrencyInputProps>(
  ({ className, symbol = 'R$', inputMode = 'decimal', ...props }, ref) => (
    <div className="relative">
      <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-sm text-muted-foreground">
        {symbol}
      </span>
      <Input ref={ref} inputMode={inputMode} className={cn('pl-10', className)} {...props} />
    </div>
  ),
);
CurrencyInput.displayName = 'CurrencyInput';

export { CurrencyInput };
