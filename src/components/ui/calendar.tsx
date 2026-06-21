import * as React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { DayPicker, type DropdownProps } from 'react-day-picker';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { buttonVariants } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

function Dropdown({ value, onChange, children }: DropdownProps) {
  const options = React.Children.toArray(children) as React.ReactElement<
    React.OptionHTMLAttributes<HTMLOptionElement>
  >[];
  const selected = options.find((child) => child.props.value === value);

  const handleChange = (newValue: string) => {
    const changeEvent = {
      target: { value: newValue },
    } as React.ChangeEvent<HTMLSelectElement>;
    onChange?.(changeEvent);
  };

  return (
    <Select value={value?.toString()} onValueChange={handleChange}>
      <SelectTrigger className="h-8 w-fit gap-1 border-none px-2 font-medium capitalize shadow-none focus:ring-0 focus:ring-offset-0">
        <SelectValue>{selected?.props?.children}</SelectValue>
      </SelectTrigger>
      <SelectContent position="popper" className="max-h-72">
        {options.map((option, id) => (
          <SelectItem key={`${option.props.value}-${id}`} value={option.props.value?.toString() ?? ''}>
            {option.props.children}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  captionLayout = 'dropdown-buttons',
  fromYear,
  toYear,
  ...props
}: CalendarProps) {
  const currentYear = new Date().getFullYear();

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      locale={ptBR}
      captionLayout={captionLayout}
      fromYear={fromYear ?? currentYear - 100}
      toYear={toYear ?? currentYear + 10}
      className={cn('p-3', className)}
      classNames={{
        months: 'flex flex-col sm:flex-row gap-2',
        month: 'flex flex-col gap-4',
        caption: 'flex justify-center pt-1 relative items-center w-full',
        caption_label: 'text-sm font-medium capitalize',
        caption_dropdowns: 'flex items-center justify-center gap-1',
        nav: 'flex items-center gap-1',
        nav_button: cn(
          buttonVariants({ variant: 'outline' }),
          'size-7 bg-transparent p-0 opacity-50 hover:opacity-100',
        ),
        nav_button_previous: 'absolute left-1',
        nav_button_next: 'absolute right-1',
        table: 'w-full border-collapse space-x-1',
        head_row: 'flex',
        head_cell: 'text-muted-foreground rounded-md w-8 font-normal text-[0.8rem]',
        row: 'flex w-full mt-2',
        cell: 'relative p-0 text-center text-sm focus-within:relative focus-within:z-20 [&:has([aria-selected])]:bg-accent [&:has([aria-selected].day-range-end)]:rounded-r-md [&:has([aria-selected].day-outside)]:bg-accent/50 first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md',
        day: cn(buttonVariants({ variant: 'ghost' }), 'size-8 p-0 font-normal aria-selected:opacity-100'),
        day_range_end: 'day-range-end',
        day_selected:
          'bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground',
        day_today: 'bg-accent text-accent-foreground',
        day_outside: 'day-outside text-muted-foreground aria-selected:text-muted-foreground',
        day_disabled: 'text-muted-foreground opacity-50',
        day_hidden: 'invisible',
        vhidden: 'hidden',
        ...classNames,
      }}
      components={{
        IconLeft: () => <ChevronLeft className="size-4" />,
        IconRight: () => <ChevronRight className="size-4" />,
        Dropdown,
      }}
      {...props}
    />
  );
}
