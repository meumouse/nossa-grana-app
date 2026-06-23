import { useEffect, useState } from 'react';
import { Shapes } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { LocalCategory } from '@/db/dexie';

// Valor sentinela do "Sem categoria" — não colide com keys/ids (uuid/clientId).
const NONE = '__none__';

/**
 * Diálogo de alteração de categoria em massa, reutilizado por transações,
 * parcelamentos e recorrências. A categoria escolhida SUBSTITUI a atual nos
 * itens selecionados. `getValue` define se a opção carrega a key local (offline)
 * ou o id do servidor (entidades online). `null` limpa a categoria.
 */
export function BulkCategoryDialog({
  open,
  onOpenChange,
  categories,
  count,
  loading,
  getValue,
  onApply,
  noun,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  categories: LocalCategory[];
  count: number;
  loading: boolean;
  getValue: (c: LocalCategory) => string;
  onApply: (categoryId: string | null) => void;
  noun: { one: string; many: string };
}) {
  const [value, setValue] = useState(NONE);
  // Reinicia para "Sem categoria" a cada abertura.
  useEffect(() => {
    if (open) setValue(NONE);
  }, [open]);

  const label = count === 1 ? noun.one : noun.many;

  return (
    <Dialog open={open} onOpenChange={(o) => !loading && onOpenChange(o)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Alterar categoria</DialogTitle>
          <DialogDescription>
            A categoria escolhida substituirá a atual em {count} {label}.
          </DialogDescription>
        </DialogHeader>
        <Select value={value} onValueChange={setValue}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>Sem categoria</SelectItem>
            {categories.map((c) => (
              <SelectItem key={getValue(c)} value={getValue(c)}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancelar
          </Button>
          <Button onClick={() => onApply(value === NONE ? null : value)} disabled={loading}>
            <Shapes className="h-4 w-4" />
            {loading ? 'Aplicando…' : 'Aplicar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
