import { useRef, useState } from 'react';
import { Loader2, Plus, Pencil, Trash2, Landmark, Upload } from 'lucide-react';
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
import { BankLogo } from '@/components/BankLogo';
import { useLiveInstitutions } from '@/hooks/useLiveData';
import { useSync } from '@/sync/SyncProvider';
import { institutionApi } from '@/api/endpoints';
import { ApiError, OfflineError } from '@/api/client';
import type { LocalInstitution } from '@/db/dexie';

const DEFAULT_COLOR = '#64748b';

function handleError(err: unknown) {
  toast.error(
    err instanceof OfflineError
      ? 'Sem conexão — instituições precisam do servidor'
      : err instanceof ApiError
        ? err.message
        : 'Erro inesperado',
  );
}

export function InstitutionsSettings({
  workspaceId,
  canEdit,
}: {
  workspaceId: string;
  canEdit: boolean;
}) {
  // Só as instituições customizadas do workspace são gerenciáveis (as globais do
  // catálogo têm workspaceId null e não aparecem aqui).
  const all = useLiveInstitutions(workspaceId) ?? [];
  const custom = all.filter((i) => i.workspaceId !== null);
  const { syncNow } = useSync();

  const fileInput = useRef<HTMLInputElement>(null);
  const [opened, setOpened] = useState(false);
  const [editing, setEditing] = useState<LocalInstitution | null>(null);
  const [name, setName] = useState('');
  const [shortName, setShortName] = useState('');
  const [brandColor, setBrandColor] = useState(DEFAULT_COLOR);
  // Chave do logo recém-enviado (a salvar em logoUrl); preview é a URL devolvida.
  const [logoKey, setLogoKey] = useState<string | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [saving, setSaving] = useState(false);

  const openNew = () => {
    setEditing(null);
    setName('');
    setShortName('');
    setBrandColor(DEFAULT_COLOR);
    setLogoKey(null);
    setLogoPreview(null);
    setOpened(true);
  };

  const openEdit = (i: LocalInstitution) => {
    setEditing(i);
    setName(i.name);
    setShortName(i.shortName ?? '');
    setBrandColor(i.brandColor ?? DEFAULT_COLOR);
    setLogoKey(null);
    setLogoPreview(i.logoUrl);
    setOpened(true);
  };

  const onPickLogo = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast.error('O logo deve ser uma imagem.');
      return;
    }
    setUploadingLogo(true);
    try {
      const { key, url } = await institutionApi.uploadLogo(workspaceId, file);
      setLogoKey(key);
      setLogoPreview(url);
    } catch (err) {
      handleError(err);
    } finally {
      setUploadingLogo(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const save = async () => {
    if (!name.trim()) {
      toast.error('Dê um nome à instituição.');
      return;
    }
    setSaving(true);
    try {
      // Só envia logoUrl quando há um logo novo (evita gravar a URL assinada
      // — temporária — quando o logo não mudou).
      const body = {
        name: name.trim(),
        shortName: shortName.trim() || undefined,
        brandColor,
        ...(logoKey ? { logoUrl: logoKey } : {}),
      };
      if (editing?.id) {
        await institutionApi.update(workspaceId, editing.id, body);
      } else {
        await institutionApi.create(workspaceId, body);
      }
      setOpened(false);
      await syncNow();
      toast.success('Instituição salva');
    } catch (err) {
      handleError(err);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (i: LocalInstitution) => {
    if (!confirm(`Excluir o banco "${i.name}"? As contas/cartões ficarão sem logo.`)) return;
    try {
      await institutionApi.remove(workspaceId, i.id);
      await syncNow();
      toast('Instituição excluída');
    } catch (err) {
      handleError(err);
    }
  };

  return (
    <Card className="max-w-2xl p-6">
      <div className="mb-4 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Landmark className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">Bancos e instituições</h2>
        </div>
        {canEdit && (
          <Button size="sm" onClick={openNew}>
            <Plus className="h-4 w-4" />
            Novo banco
          </Button>
        )}
      </div>
      <p className="mb-5 text-sm text-muted-foreground">
        Adicione bancos ou emissores de cartão fora do catálogo, com logo e cor da marca. Ficam
        disponíveis ao criar contas e cartões.
      </p>

      {custom.length === 0 ? (
        <p className="py-4 text-sm text-muted-foreground">
          Nenhuma instituição personalizada. As do catálogo já aparecem nos formulários.
        </p>
      ) : (
        <div className="space-y-1.5">
          {custom.map((i) => (
            <div
              key={i.id}
              className="flex items-center justify-between gap-2 rounded-md border border-border/60 p-2.5"
            >
              <div className="flex min-w-0 items-center gap-2.5">
                <BankLogo
                  name={i.shortName || i.name}
                  brandColor={i.brandColor}
                  logoUrl={i.logoUrl}
                  size={32}
                />
                <span className="truncate text-sm font-medium">{i.name}</span>
              </div>
              {canEdit && (
                <div className="flex shrink-0 items-center gap-1">
                  <Button variant="ghost" size="icon" onClick={() => openEdit(i)} aria-label="Editar">
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive"
                    onClick={() => void remove(i)}
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
            <DialogTitle>{editing ? 'Editar instituição' : 'Novo banco'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <BankLogo
                name={shortName || name || '?'}
                brandColor={brandColor}
                logoUrl={logoPreview}
                size={48}
              />
              <div className="space-y-1">
                <input
                  ref={fileInput}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void onPickLogo(f);
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInput.current?.click()}
                  disabled={uploadingLogo}
                >
                  {uploadingLogo ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4" />
                  )}
                  Enviar logo
                </Button>
                <p className="text-xs text-muted-foreground">PNG/JPG/SVG. Opcional.</p>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Nome</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Havan" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Nome curto</Label>
                <Input
                  value={shortName}
                  onChange={(e) => setShortName(e.target.value)}
                  placeholder="Ex.: Havan"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Cor da marca</Label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={brandColor}
                    onChange={(e) => setBrandColor(e.target.value)}
                    className="h-9 w-12 cursor-pointer rounded border border-border bg-transparent"
                    aria-label="Cor da marca"
                  />
                  <Input
                    value={brandColor}
                    onChange={(e) => setBrandColor(e.target.value)}
                    className="w-28"
                  />
                </div>
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
