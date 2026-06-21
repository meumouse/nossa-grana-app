import { useState } from 'react';
import { format, subDays, subMonths, subYears } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Calendar as CalendarIcon, X } from 'lucide-react';
import type { DateRange } from 'react-day-picker';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

export type { DateRange };

interface Preset {
  label: string;
  range: () => DateRange;
}

/** Início do dia de hoje (zera horas p/ comparação consistente). */
function today(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

const PRESETS: Preset[] = [
  { label: '7 dias', range: () => ({ from: subDays(today(), 6), to: today() }) },
  { label: '15 dias', range: () => ({ from: subDays(today(), 14), to: today() }) },
  { label: '30 dias', range: () => ({ from: subDays(today(), 29), to: today() }) },
  { label: '45 dias', range: () => ({ from: subDays(today(), 44), to: today() }) },
  { label: '60 dias', range: () => ({ from: subDays(today(), 59), to: today() }) },
  { label: '90 dias', range: () => ({ from: subDays(today(), 89), to: today() }) },
  { label: '6 meses', range: () => ({ from: subMonths(today(), 6), to: today() }) },
  { label: '1 ano', range: () => ({ from: subYears(today(), 1), to: today() }) },
];

interface DateRangePickerProps {
  value?: DateRange;
  onChange: (range: DateRange | undefined) => void;
  placeholder?: string;
  className?: string;
}

export function DateRangePicker({
  value,
  onChange,
  placeholder = 'Período',
  className,
}: DateRangePickerProps) {
  const [open, setOpen] = useState(false);
  const fmt = (d: Date) => format(d, 'dd/MM/yyyy', { locale: ptBR });

  let label = placeholder;
  if (value?.from && value.to) label = `${fmt(value.from)} – ${fmt(value.to)}`;
  else if (value?.from) label = `A partir de ${fmt(value.from)}`;

  const hasValue = Boolean(value?.from || value?.to);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={cn(
            'w-full justify-start text-left font-normal',
            !hasValue && 'text-muted-foreground',
            className,
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
          <span className="truncate">{label}</span>
          {hasValue && (
            <span
              role="button"
              tabIndex={0}
              aria-label="Limpar período"
              className="ml-auto inline-flex shrink-0 rounded-sm opacity-60 hover:opacity-100"
              onClick={(e) => {
                e.stopPropagation();
                onChange(undefined);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  e.stopPropagation();
                  onChange(undefined);
                }
              }}
            >
              <X className="h-4 w-4" />
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <div className="flex flex-col sm:flex-row">
          <div className="flex flex-row flex-wrap gap-1 border-b p-2 sm:max-w-[150px] sm:flex-col sm:flex-nowrap sm:border-b-0 sm:border-r">
            {PRESETS.map((p) => (
              <Button
                key={p.label}
                type="button"
                variant="ghost"
                size="sm"
                className="justify-start font-normal"
                onClick={() => {
                  onChange(p.range());
                  setOpen(false);
                }}
              >
                {p.label}
              </Button>
            ))}
          </div>
          <Calendar
            mode="range"
            selected={value}
            onSelect={(r) => onChange(r)}
            numberOfMonths={1}
            defaultMonth={value?.from}
            initialFocus
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}
