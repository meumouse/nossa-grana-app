import { useState } from 'react';
import { Loader2, Plus, Pencil, Trash2, Tags } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from '@/components/ui/sonner';
import { useLiveCategories } from '@/hooks/useLiveData';
import { useSync } from '@/sync/SyncProvider';
import { categoryApi } from '@/api/endpoints';
import { ApiError, OfflineError } from '@/api/client';
import type { LocalCategory } from '@/db/dexie';
import type { CategoryKind, CategoryNature } from '@/api/types';

const NATURE_OPTIONS: { value: CategoryNature; label: string }[] = [
  { value: 'FIXED', label: 'Fixo' },
  { value: 'VARIABLE', label: 'Variável' },
  { value: 'LEISURE', label: 'Lazer' },
  { value: 'INVESTMENT', label: 'Investimento' },
  { value: 'INCOME', label: 'Receita' },
  { value: 'OTHER', label: 'Outros' },
];

const DEFAULT_COLOR = '#64748b';

function handleError(err: unknown) {
  toast.error(
    err instanceof OfflineError
      ? 'Sem conexão — categorias precisam do servidor'
      : err instanceof ApiError
        ? err.message
        : 'Erro inesperado',
  );
}

export function CategoriesSettings({
  workspaceId,
  canEdit,
}: {
  workspaceId: string;
  canEdit: boolean;
}) {
  const categories = useLiveCategories(workspaceId) ?? [];
  const { syncNow } = useSync();

  const [opened, setOpened] = useState(false);
  const [editing, setEditing] = useState<LocalCategory | null>(null);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<CategoryKind>('EXPENSE');
  const [nature, setNature] = useState<CategoryNature>('VARIABLE');
  const [color, setColor] = useState(DEFAULT_COLOR);
  const [saving, setSaving] = useState(false);

  const openNew = () => {
    setEditing(null);
    setName('');
    setKind('EXPENSE');
    setNature('VARIABLE');
    setColor(DEFAULT_COLOR);
    setOpened(true);
  };

  const openEdit = (c: LocalCategory) => {
    setEditing(c);
    setName(c.name);
    setKind(c.kind);
    setNature(c.nature);
    setColor(c.color ?? DEFAULT_COLOR);
    setOpened(true);
  };

  const save = async () => {
    if (!name.trim()) {
      toast.error('Dê um nome à categoria.');
      return;
    }
    setSaving(true);
    try {
      const body = { name: name.trim(), kind, nature, color };
      if (editing?.id) {
        await categoryApi.update(workspaceId, editing.id, body);
      } else {
        await categoryApi.create(workspaceId, body);
      }
      setOpened(false);
      await syncNow();
      toast.success('Categoria salva');
    } catch (err) {
      handleError(err);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (c: LocalCategory) => {
    if (!c.id) return;
    if (!confirm(`Excluir a categoria "${c.name}"?`)) return;
    try {
      await categoryApi.remove(workspaceId, c.id);
      await syncNow();
      toast('Categoria excluída');
    } catch (err) {
      handleError(err);
    }
  };

  return (
    <Card className="max-w-2xl p-6">
      <div className="mb-4 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Tags className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">Categorias</h2>
        </div>
        {canEdit && (
          <Button size="sm" onClick={openNew}>
            <Plus className="h-4 w-4" />
            Nova categoria
          </Button>
        )}
      </div>
      <p className="mb-5 text-sm text-muted-foreground">
        Personalize as categorias usadas em lançamentos, orçamentos e na importação por IA.
      </p>

      {categories.length === 0 ? (
        <p className="py-4 text-sm text-muted-foreground">Nenhuma categoria.</p>
      ) : (
        <div className="space-y-1.5">
          {categories.map((c) => (
            <div
              key={c.key}
              className="flex items-center justify-between gap-2 rounded-md border border-border/60 p-2.5"
            >
              <div className="flex min-w-0 items-center gap-2.5">
                <span
                  className="h-4 w-4 shrink-0 rounded-full"
                  style={{ backgroundColor: c.color ?? DEFAULT_COLOR }}
                />
                <span className="truncate text-sm font-medium">{c.name}</span>
                <Badge variant={c.kind === 'INCOME' ? 'success' : 'muted'}>
                  {c.kind === 'INCOME' ? 'Receita' : 'Despesa'}
                </Badge>
              </div>
              {canEdit && (
                <div className="flex shrink-0 items-center gap-1">
                  <Button variant="ghost" size="icon" onClick={() => openEdit(c)} aria-label="Editar">
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive"
                    onClick={() => void remove(c)}
                    aria-label="Excluir"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Dialog open={opened} onOpenChange={setOpened}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar categoria' : 'Nova categoria'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Nome</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Pets" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Tipo</Label>
                <Select value={kind} onValueChange={(v) => setKind(v as CategoryKind)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="EXPENSE">Despesa</SelectItem>
                    <SelectItem value="INCOME">Receita</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Natureza</Label>
                <Select value={nature} onValueChange={(v) => setNature(v as CategoryNature)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {NATURE_OPTIONS.map((n) => (
                      <SelectItem key={n.value} value={n.value}>
                        {n.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Cor</Label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="h-9 w-12 cursor-pointer rounded border border-border bg-transparent"
                  aria-label="Cor da categoria"
                />
                <Input value={color} onChange={(e) => setColor(e.target.value)} className="w-32" />
              </div>
            </div>
            <Button className="w-full" onClick={() => void save()} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Salvar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
