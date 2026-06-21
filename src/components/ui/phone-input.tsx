import { useEffect, useRef } from 'react';
import intlTelInput from 'intl-tel-input';
import { pt } from 'intl-tel-input/locale';
import 'intl-tel-input/styles';
import { cn } from '@/lib/utils';

export interface PhoneInputProps {
  id?: string;
  /** Valor inicial (E.164 ou nacional). Lido apenas na montagem — o campo é não-controlado. */
  initialValue?: string;
  /** Recebe o número em formato internacional (E.164) sempre que muda. */
  onChange: (value: string) => void;
  /** Informa se o número atual é válido. Vazio conta como válido (campo opcional). */
  onValidityChange?: (valid: boolean) => void;
  disabled?: boolean;
  placeholder?: string;
  autoComplete?: string;
  className?: string;
}

/**
 * Campo de telefone internacional com seletor de país (intl-tel-input).
 * Não-controlado: a lib gerencia o valor do <input> (formatação/máscara por país);
 * o valor é propagado via `onChange` como E.164 (ex.: +5511988887777).
 */
export function PhoneInput({
  id,
  initialValue = '',
  onChange,
  onValidityChange,
  disabled,
  placeholder,
  autoComplete = 'tel',
  className,
}: PhoneInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  // Mantém as callbacks atuais sem reinicializar o plugin a cada render.
  const onChangeRef = useRef(onChange);
  const onValidityChangeRef = useRef(onValidityChange);
  onChangeRef.current = onChange;
  onValidityChangeRef.current = onValidityChange;

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;

    const iti = intlTelInput(input, {
      initialCountry: 'br',
      countryOrder: ['br', 'pt', 'us'],
      separateDialCode: true,
      strictMode: true,
      countrySearch: true,
      uiTranslations: pt,
      // utils carregadas sob demanda (validação, formatação e placeholders).
      loadUtils: () => import('intl-tel-input/utils'),
    });

    const emit = () => {
      // getNumber() devolve E.164 quando as utils já carregaram; antes disso,
      // ou para números incompletos, cai no texto cru do input.
      onChangeRef.current(iti.getNumber() || input.value);
      const validity = onValidityChangeRef.current;
      if (validity) {
        const empty = input.value.trim() === '';
        // isValidNumber() é null até as utils carregarem — só bloqueia em `false`.
        validity(empty || iti.isValidNumber() !== false);
      }
    };

    input.addEventListener('input', emit);
    input.addEventListener('countrychange', emit);
    // Após as utils carregarem, reemite o valor já normalizado para E.164.
    iti.promise.then(emit).catch(() => {});

    return () => {
      input.removeEventListener('input', emit);
      input.removeEventListener('countrychange', emit);
      iti.destroy();
    };
    // Inicializa uma única vez; callbacks vêm via refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <input
      ref={inputRef}
      id={id}
      type="tel"
      defaultValue={initialValue}
      disabled={disabled}
      placeholder={placeholder}
      autoComplete={autoComplete}
      className={cn(
        'flex h-10 w-full rounded-md border border-input bg-background py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
    />
  );
}
