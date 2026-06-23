import { useState } from 'react';
import { Loader2, Plus, Pencil, Trash2, Tag as TagIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from '@/components/ui/sonner';
import { useLiveTags } from '@/hooks/useLiveData';
import { useSync } from '@/sync/SyncProvider';
import { tagApi } from '@/api/endpoints';
import { ApiError, OfflineError } from '@/api/client';
import { db, type LocalTag } from '@/db/dexie';

const DEFAULT_COLOR = '#6366f1';

function handleError(err: unknown) {
  toast.error(
    err instanceof OfflineError
      ? 'Sem conexão — tags precisam do servidor'
      : err instanceof ApiError
        ? err.message
        : 'Erro inesperado',
  );
}

export function TagsSettings({
  workspaceId,
  canEdit,
}: {
  workspaceId: string;
  canEdit: boolean;
}) {
  const tags = useLiveTags(workspaceId) ?? [];
  const { syncNow } = useSync();

  const [opened, setOpened] = useState(false);
  const [editing, setEditing] = useState<LocalTag | null>(null);
  const [name, setName] = useState('');
  const [color, setColor] = useState(DEFAULT_COLOR);
  const [saving, setSaving] = useState(false);

  const openNew = () => {
    setEditing(null);
    setName('');
    setColor(DEFAULT_COLOR);
    setOpened(true);
  };

  const openEdit = (t: LocalTag) => {
    setEditing(t);
    setName(t.name);
    setColor(t.color ?? DEFAULT_COLOR);
    setOpened(true);
  };

  const save = async () => {
    if (!name.trim()) {
      toast.error('Dê um nome à tag.');
      return;
    }
    setSaving(true);
    try {
      const body = { name: name.trim(), color };
      const { tag } = editing?.id
        ? await tagApi.update(workspaceId, editing.id, body)
        : await tagApi.create(workspaceId, body);
      // Atualiza o cache local na hora (e o próximo sync confirma).
      await db.tags.put({ id: tag.id, workspaceId: tag.workspaceId, name: tag.name, color: tag.color });
      setOpened(false);
      void syncNow();
      toast.success('Tag salva');
    } catch (err) {
      handleError(err);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (t: LocalTag) => {
    if (!confirm(`Excluir a tag "${t.name}"? Ela será removida dos lançamentos.`)) return;
    try {
      await tagApi.remove(workspaceId, t.id);
      await db.tags.delete(t.id);
      void syncNow();
      toast('Tag excluída');
    } catch (err) {
      handleError(err);
    }
  };

  return (
    <Card className="max-w-2xl p-6">
      <div className="mb-4 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <TagIcon className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">Tags</h2>
        </div>
        {canEdit && (
          <Button size="sm" onClick={openNew}>
            <Plus className="h-4 w-4" />
            Nova tag
          </Button>
        )}
      </div>
      <p className="mb-5 text-sm text-muted-foreground">
        Etiquetas para organizar lançamentos. Use-as no formulário de lançamento e filtre o extrato por elas.
      </p>

      {tags.length === 0 ? (
        <p className="py-4 text-sm text-muted-foreground">Nenhuma tag.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {tags.map((t) => (
            <div
              key={t.id}
              className="flex items-center gap-2 rounded-md border border-border/60 py-1.5 pl-2.5 pr-1.5"
            >
              <span
                className="h-3.5 w-3.5 shrink-0 rounded-full"
                style={{ backgroundColor: t.color ?? DEFAULT_COLOR }}
              />
              <span className="text-sm font-medium">{t.name}</span>
              {canEdit && (
                <div className="flex shrink-0 items-center">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(t)} aria-label="Editar">
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive"
                    onClick={() => void remove(t)}
                    aria-label="Excluir"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
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
            <DialogTitle>{editing ? 'Editar tag' : 'Nova tag'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Nome</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex.: Viagem"
                maxLength={40}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void save();
                  }
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Cor</Label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="h-9 w-12 cursor-pointer rounded border border-border bg-transparent"
                  aria-label="Cor da tag"
                />
                <Input value={color} onChange={(e) => setColor(e.target.value)} className="w-32" />
                <span
                  className="ml-auto inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium"
                  style={{ borderColor: color, color }}
                >
                  {name.trim() || 'Prévia'}
                </span>
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
