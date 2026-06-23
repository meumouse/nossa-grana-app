import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Upload,
  FileText,
  FileImage,
  FileSpreadsheet,
  Download,
  Trash2,
  Sparkles,
  Loader2,
  MoreVertical,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from '@/components/ui/sonner';
import { ImportAiModal } from '@/components/ImportAiModal';
import { useWorkspace } from '@/workspace/WorkspaceProvider';
import { useLiveAccounts, useLiveCards } from '@/hooks/useLiveData';
import { documentApi } from '@/api/endpoints';
import { ApiError } from '@/api/client';
import type { DocumentFile, ImportBatch, ImportSource } from '@/api/types';

const SOURCE_LABEL: Record<ImportSource, string> = {
  PDF: 'PDF',
  IMAGE: 'Imagem',
  CSV: 'CSV',
  OFX: 'OFX',
};

function SourceIcon({ source }: { source: ImportSource }) {
  if (source === 'IMAGE') return <FileImage className="h-7 w-7 shrink-0 text-primary" />;
  if (source === 'CSV' || source === 'OFX')
    return <FileSpreadsheet className="h-7 w-7 shrink-0 text-primary" />;
  return <FileText className="h-7 w-7 shrink-0 text-primary" />;
}

/** Formata bytes em unidade legível (ex.: "1.4 MB"). */
function formatBytes(bytes?: number | null): string {
  if (!bytes || bytes <= 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  let v = bytes;
  let u = 0;
  while (v >= 1024 && u < units.length - 1) {
    v /= 1024;
    u += 1;
  }
  return `${v.toFixed(u > 0 && v < 10 ? 1 : 0)} ${units[u]}`;
}

const accVal = (id: string) => `acc:${id}`;
const cardVal = (id: string) => `card:${id}`;

function decodeSource(source: string): { accountId?: string; creditCardId?: string } {
  if (!source) return {};
  const id = source.slice(source.indexOf(':') + 1);
  return source.startsWith('card:') ? { creditCardId: id } : { accountId: id };
}

const ACCEPT = '.pdf,.csv,.ofx,image/*,application/pdf,text/csv';

export function DocumentosPage() {
  const { activeId } = useWorkspace();
  const accounts = useLiveAccounts(activeId) ?? [];
  const cards = useLiveCards(activeId) ?? [];

  const fileInput = useRef<HTMLInputElement>(null);
  const [docs, setDocs] = useState<DocumentFile[] | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  // Diálogo de destino antes de importar com IA um documento existente.
  const [importingDoc, setImportingDoc] = useState<DocumentFile | null>(null);
  const [destSource, setDestSource] = useState('');
  const [starting, setStarting] = useState(false);

  // Modal de revisão (reusa o fluxo do Extrato a partir de um lote já criado).
  const [reviewBatch, setReviewBatch] = useState<ImportBatch | null>(null);
  const [reviewSource, setReviewSource] = useState('');
  const [reviewOpen, setReviewOpen] = useState(false);

  const load = useCallback(async () => {
    if (!activeId) return;
    try {
      const { items } = await documentApi.list(activeId);
      setDocs(items);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Falha ao carregar os documentos.';
      toast.error(msg);
      setDocs([]);
    }
  }, [activeId]);

  useEffect(() => {
    void load();
  }, [load]);

  const onFile = async (file: File) => {
    if (!activeId) return;
    setUploading(true);
    try {
      await documentApi.upload(activeId, file);
      toast.success('Documento enviado.');
      await load();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Falha ao enviar o documento.';
      toast.error(msg);
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) void onFile(f);
  };

  const download = async (doc: DocumentFile) => {
    if (!activeId) return;
    try {
      const { url } = await documentApi.fileUrl(activeId, doc.id);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Falha ao baixar o documento.';
      toast.error(msg);
    }
  };

  const remove = async (doc: DocumentFile) => {
    if (!activeId) return;
    try {
      await documentApi.remove(activeId, doc.id);
      toast('Documento excluído');
      await load();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Falha ao excluir o documento.';
      toast.error(msg);
    }
  };

  const startImport = async () => {
    if (!activeId || !importingDoc) return;
    setStarting(true);
    try {
      const owner = decodeSource(destSource);
      const { batch } = await documentApi.import(activeId, importingDoc.id, owner);
      setReviewBatch(batch);
      setReviewSource(destSource);
      setReviewOpen(true);
      setImportingDoc(null);
      setDestSource('');
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Falha ao iniciar a importação.';
      toast.error(msg);
    } finally {
      setStarting(false);
    }
  };

  const closeReview = () => {
    setReviewOpen(false);
    setReviewBatch(null);
    setReviewSource('');
    void load();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Documentos</h1>
        <Button onClick={() => fileInput.current?.click()} disabled={uploading}>
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          Enviar documento
        </Button>
      </div>

      <input
        ref={fileInput}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void onFile(f);
        }}
      />

      {/* Área de drag-and-drop */}
      <button
        type="button"
        onClick={() => fileInput.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={`flex w-full flex-col items-center gap-2 rounded-lg border-2 border-dashed p-8 transition-colors ${
          dragOver
            ? 'border-primary bg-primary/5 text-primary'
            : 'border-border text-muted-foreground hover:border-primary hover:text-primary'
        }`}
      >
        <Upload className="h-7 w-7" />
        <span className="text-sm font-medium">Arraste um documento aqui ou clique para enviar</span>
        <span className="text-xs">PDF · Imagem · CSV · OFX — guardados com segurança</span>
      </button>

      {docs === null ? (
        <div className="flex justify-center py-10 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : docs.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          Nenhum documento ainda. Envie o primeiro acima ou use a importação por IA no Extrato.
        </p>
      ) : (
        <div className="space-y-2">
          {docs.map((doc) => {
            const imported = (doc.importBatches ?? []).some((b) => b.status === 'CONFIRMED');
            const reviewing = (doc.importBatches ?? []).some(
              (b) => b.status === 'PENDING_REVIEW' || b.status === 'PROCESSING',
            );
            return (
              <Card key={doc.id} className="flex items-center justify-between gap-3 p-3">
                <div className="flex min-w-0 items-center gap-3">
                  <SourceIcon source={doc.source} />
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="truncate text-sm font-medium">{doc.filename}</p>
                    <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                      <Badge variant="muted">{SOURCE_LABEL[doc.source]}</Badge>
                      <span>{formatBytes(doc.fileSize)}</span>
                      {doc.pageCount ? <span>· {doc.pageCount} pág.</span> : null}
                      <span>· {new Date(doc.createdAt).toLocaleDateString('pt-BR')}</span>
                      {imported ? (
                        <Badge variant="success">Importado</Badge>
                      ) : reviewing ? (
                        <Badge variant="muted">Em revisão</Badge>
                      ) : null}
                    </div>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setImportingDoc(doc);
                      setDestSource('');
                    }}
                  >
                    <Sparkles className="h-4 w-4" />
                    Importar com IA
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" aria-label="Mais ações">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => void download(doc)}>
                        <Download className="h-4 w-4" />
                        Baixar
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={() => void remove(doc)}
                      >
                        <Trash2 className="h-4 w-4" />
                        Excluir
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Diálogo: escolher conta/cartão antes de importar com IA */}
      <Dialog open={!!importingDoc} onOpenChange={(o) => !o && setImportingDoc(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Importar com IA
            </DialogTitle>
            <DialogDescription>
              Escolha a conta ou o cartão de destino. A IA vai ler “{importingDoc?.filename}” e extrair
              os lançamentos para você revisar.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label>Conta ou cartão de destino</Label>
            <Select value={destSource} onValueChange={setDestSource}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione a conta ou o cartão" />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((a) => (
                  <SelectItem key={`acc-${a.key}`} value={accVal(a.key)}>
                    {a.name}
                  </SelectItem>
                ))}
                {cards.map((c) => (
                  <SelectItem key={`card-${c.key}`} value={cardVal(c.key)}>
                    {c.name} (cartão)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            className="w-full"
            onClick={() => void startImport()}
            disabled={starting || !destSource}
          >
            {starting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Ler documento
          </Button>
        </DialogContent>
      </Dialog>

      {activeId && (
        <ImportAiModal
          opened={reviewOpen}
          onClose={closeReview}
          workspaceId={activeId}
          initialBatch={reviewBatch}
          initialSource={reviewSource}
        />
      )}
    </div>
  );
}
