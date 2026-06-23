import { useEffect, useRef, useState } from 'react';
import { Loader2, Upload, Sparkles, FileText, Check, X, RotateCcw, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { CurrencyInput } from '@/components/ui/currency-input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { DatePicker } from '@/components/ui/date-picker';
import { toast } from '@/components/ui/sonner';
import { useLiveAccounts, useLiveCards, useLiveCategories } from '@/hooks/useLiveData';
import { useSync } from '@/sync/SyncProvider';
import { importApi } from '@/api/endpoints';
import { ApiError } from '@/api/client';
import type { ImportBatch, ImportItem, ImportSource } from '@/api/types';

interface Props {
  opened: boolean;
  onClose: () => void;
  workspaceId: string;
  // Modo "documento existente": começa de um lote já criado (via documentApi.import),
  // pulando a fase de upload. `initialSource` é o destino padrão ("acc:<id>"/"card:<id>").
  initialBatch?: ImportBatch | null;
  initialSource?: string;
}

// idle: escolha de conta/arquivo · uploading: enviando o doc · uploaded: dados
// do doc + "Continuar" · extracting: lendo com IA · review: revisão dos itens.
type Phase = 'idle' | 'uploading' | 'uploaded' | 'extracting' | 'review';

const SOURCE_LABEL: Record<ImportSource, string> = {
  PDF: 'PDF',
  IMAGE: 'Imagem',
  CSV: 'CSV',
  OFX: 'OFX',
};

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

/** Linha editável na revisão (espelha um ImportItem + estado local). */
interface Row {
  id: string;
  accept: boolean;
  date: Date;
  description: string;
  amount: string; // input cru
  type: 'INCOME' | 'EXPENSE';
  categoryId: string;
  // Origem do lançamento: conta ou cartão, codificada em "acc:<id>" / "card:<id>".
  source: string;
}

// O seletor de origem codifica conta vs cartão (mesma convenção do form de transação).
const accVal = (id: string) => `acc:${id}`;
const cardVal = (id: string) => `card:${id}`;

/** Decodifica "acc:<id>" / "card:<id>" no par {accountId, creditCardId} (um deles). */
function decodeSource(source: string): { accountId?: string; creditCardId?: string } {
  if (!source) return {};
  const id = source.slice(source.indexOf(':') + 1);
  return source.startsWith('card:') ? { creditCardId: id } : { accountId: id };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Acompanha a confirmação processada em background (fila). Faz polling do lote
 * até CONFIRMED (devolve qtd. importada) ou FAILED (lança com a mensagem).
 * Desiste após ~2min para não travar a UI caso o worker esteja indisponível.
 */
async function waitForImport(workspaceId: string, batchId: string): Promise<number> {
  const maxAttempts = 80; // ~2min a 1,5s por tentativa
  for (let i = 0; i < maxAttempts; i++) {
    await sleep(1500);
    const { batch } = await importApi.get(workspaceId, batchId);
    if (batch.status === 'CONFIRMED') {
      return (batch.items ?? []).filter((it) => it.status === 'IMPORTED').length;
    }
    if (batch.status === 'FAILED') {
      throw new Error(batch.error ?? 'Falha ao importar os lançamentos.');
    }
  }
  throw new Error('A importação ainda está em andamento. Confira o extrato em instantes.');
}

/**
 * Acompanha a extração processada em background (fila). Faz polling do lote até
 * PENDING_REVIEW (devolve o lote com os itens) ou FAILED (lança com a mensagem).
 * Desiste após ~2min para não travar a UI caso o worker esteja indisponível.
 */
async function waitForExtraction(
  workspaceId: string,
  batchId: string,
  onProgress?: (done: number, total: number) => void,
): Promise<ImportBatch> {
  const maxAttempts = 200; // ~5min a 1,5s por tentativa (docs pesados demoram mais)
  for (let i = 0; i < maxAttempts; i++) {
    await sleep(1500);
    const { batch } = await importApi.get(workspaceId, batchId);
    // Progresso do fracionamento (docs grandes lidos em chunks), quando houver.
    if (batch.chunkTotal && batch.chunkTotal > 1) {
      onProgress?.(batch.chunkDone ?? 0, batch.chunkTotal);
    }
    if (batch.status === 'PENDING_REVIEW') return batch;
    if (batch.status === 'FAILED') {
      throw new Error(batch.error ?? 'Falha ao ler o documento.');
    }
  }
  throw new Error('A leitura do documento ainda está em andamento. Tente novamente em instantes.');
}

function itemToRow(it: ImportItem, fallbackSource: string): Row {
  return {
    id: it.id,
    accept: true,
    date: new Date(it.date),
    description: it.description,
    amount: String(it.amount),
    type: it.type,
    categoryId: it.categoryId ?? '',
    source: it.creditCardId
      ? cardVal(it.creditCardId)
      : it.accountId
        ? accVal(it.accountId)
        : fallbackSource,
  };
}

export function ImportAiModal({
  opened,
  onClose,
  workspaceId,
  initialBatch,
  initialSource,
}: Props) {
  const { syncNow } = useSync();
  const accounts = useLiveAccounts(workspaceId) ?? [];
  const cards = useLiveCards(workspaceId) ?? [];
  const categories = useLiveCategories(workspaceId) ?? [];

  const fileInput = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  // Origem de destino do lote ("acc:<id>" | "card:<id>").
  const [source, setSource] = useState('');
  const [batch, setBatch] = useState<ImportBatch | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  // Progresso do fracionamento na extração ("lendo parte X de Y"). null = sem chunks.
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const patchRow = (id: string, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const reset = () => {
    setPhase('idle');
    setBatch(null);
    setRows([]);
    setDragOver(false);
    setProgress(null);
    if (fileInput.current) fileInput.current.value = '';
  };

  const close = () => {
    reset();
    onClose();
  };

  // Mostra a tela de revisão a partir de um lote já extraído.
  const goToReview = (b: ImportBatch) => {
    setBatch(b);
    setRows((b.items ?? []).map((it) => itemToRow(it, source)));
    if (b.items && b.items.length > 0) {
      setPhase('review');
    } else {
      setPhase('uploaded');
      toast.error('Nenhuma transação foi reconhecida no documento.');
    }
  };

  // Modo "documento existente": ao abrir com um lote já criado (Documentos →
  // Importar com IA), pula o upload e acompanha a extração / cai na revisão.
  // O ref evita reiniciar o polling a cada re-render do mesmo lote.
  const startedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!opened) {
      startedRef.current = null;
      return;
    }
    if (!initialBatch || startedRef.current === initialBatch.id) return;
    startedRef.current = initialBatch.id;

    const fallback = initialSource ?? '';
    setSource(fallback);
    setBatch(initialBatch);

    const showReview = (b: ImportBatch) => {
      setBatch(b);
      setRows((b.items ?? []).map((it) => itemToRow(it, fallback)));
      if (b.items && b.items.length > 0) {
        setPhase('review');
      } else {
        setPhase('uploaded');
        toast.error('Nenhuma transação foi reconhecida no documento.');
      }
    };

    if (initialBatch.status === 'PENDING_REVIEW') {
      showReview(initialBatch);
    } else if (initialBatch.status === 'FAILED') {
      toast.error(initialBatch.error ?? 'Falha ao ler o documento.');
      setPhase('uploaded');
    } else {
      setPhase('extracting');
      waitForExtraction(workspaceId, initialBatch.id, (done, total) => setProgress({ done, total }))
        .then(showReview)
        .catch((err) => {
          toast.error(err instanceof Error ? err.message : 'Falha ao ler o documento.');
          setPhase('uploaded');
        });
    }
  }, [opened, initialBatch, initialSource, workspaceId]);

  // Etapa 1: envia o documento (sem IA ainda). Em UPLOADED, mostra os dados do
  // doc e aguarda o "Continuar"; sem storage o backend já extrai inline e volta
  // PENDING_REVIEW, então pulamos direto para a revisão.
  const onFile = async (file: File) => {
    if (!source) {
      toast.error('Escolha a conta ou o cartão de destino antes de enviar o documento.');
      return;
    }
    setPhase('uploading');
    try {
      const { batch: b } = await importApi.upload(workspaceId, file, decodeSource(source));
      setBatch(b);
      if (b.status === 'UPLOADED') {
        setPhase('uploaded');
      } else {
        goToReview(b);
      }
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Falha ao enviar o documento.';
      toast.error(msg);
      reset();
    }
  };

  // Etapa 2: confirma e dispara a leitura com IA. Com fila (Redis), acompanha o
  // processamento em background por polling; sem fila, o lote já volta extraído.
  const continueExtraction = async () => {
    if (!batch) return;
    setProgress(null);
    setPhase('extracting');
    try {
      const res = await importApi.extract(workspaceId, batch.id);
      const extracted = res.queued
        ? await waitForExtraction(workspaceId, batch.id, (done, total) => setProgress({ done, total }))
        : res.batch;
      goToReview(extracted);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Falha ao ler o documento.';
      toast.error(msg);
      // O lote fica FAILED (reprocessável): volta à tela de confirmação p/ tentar
      // de novo ou recomeçar.
      setPhase('uploaded');
    }
  };

  // Drag-and-drop na área de upload (etapa idle).
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) void onFile(f);
  };

  const confirm = async () => {
    if (!batch) return;
    const accepted = rows.filter((r) => r.accept);
    if (accepted.length === 0) {
      toast.error('Marque ao menos um lançamento para importar.');
      return;
    }
    setConfirming(true);
    try {
      // Persiste os valores revisados (só dos itens aceitos) antes de confirmar.
      for (const r of accepted) {
        const owner = decodeSource(r.source);
        await importApi.patchItem(workspaceId, batch.id, r.id, {
          date: r.date.toISOString(),
          description: r.description.trim(),
          amount: Number(r.amount.replace(',', '.')),
          type: r.type,
          categoryId: r.categoryId || null,
          accountId: owner.accountId ?? null,
          creditCardId: owner.creditCardId ?? null,
          status: 'ACCEPTED',
        });
      }
      const res = await importApi.confirm(workspaceId, batch.id, decodeSource(source));
      // Com fila, a API só enfileira (202): acompanha o processamento em
      // background por polling até concluir. Sem fila, já vem o total importado.
      const imported = res.queued
        ? await waitForImport(workspaceId, batch.id)
        : (res.imported ?? 0);
      toast.success(`${imported} lançamento(s) importado(s).`);
      await syncNow();
      close();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Falha ao confirmar a importação.';
      toast.error(msg);
    } finally {
      setConfirming(false);
    }
  };

  const acceptedCount = rows.filter((r) => r.accept).length;

  return (
    <Dialog open={opened} onOpenChange={(o) => !o && close()}>
      <DialogContent
        className="max-w-2xl"
        // O seletor de arquivos do SO rouba o foco da janela ao abrir; sem isto
        // o Radix entende como "foco fora" e fecha o modal ao clicar no upload.
        // Mantém o fechamento por clique no overlay (pointerdown) e por Esc.
        onFocusOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Importar com IA
          </DialogTitle>
          <DialogDescription>
            Suba um extrato, fatura ou comprovante (PDF, imagem, CSV ou OFX). A IA extrai os
            lançamentos para você revisar e confirmar.
          </DialogDescription>
        </DialogHeader>

        {phase !== 'review' && (
          <Card className="space-y-4 p-4">
            {phase === 'idle' && (
              <div className="space-y-1.5">
                <Label>Conta ou cartão de destino</Label>
                <Select value={source} onValueChange={setSource}>
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
            )}

            <input
              ref={fileInput}
              type="file"
              accept=".pdf,.csv,.ofx,image/*,application/pdf,text/csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onFile(f);
              }}
            />

            {phase === 'idle' && (
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
                className={`flex w-full flex-col items-center gap-2 rounded-lg border-2 border-dashed p-10 transition-colors ${
                  dragOver
                    ? 'border-primary bg-primary/5 text-primary'
                    : 'border-border text-muted-foreground hover:border-primary hover:text-primary'
                }`}
              >
                <Upload className="h-8 w-8" />
                <span className="text-sm font-medium">
                  Arraste um documento aqui ou clique para escolher
                </span>
                <span className="text-xs">PDF · Imagem · CSV · OFX</span>
              </button>
            )}

            {phase === 'uploading' && (
              <div className="flex flex-col items-center gap-2 py-10 text-muted-foreground">
                <Upload className="h-8 w-8 animate-pulse text-primary" />
                <p className="text-sm">Enviando o documento…</p>
              </div>
            )}

            {(phase === 'uploaded' || phase === 'extracting') && batch && (
              <div className="space-y-4">
                {/* Dados do documento enviado */}
                <div className="flex items-start gap-3 rounded-lg border border-border p-3">
                  <FileText className="mt-0.5 h-8 w-8 shrink-0 text-primary" />
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="truncate text-sm font-medium">{batch.filename ?? 'documento'}</p>
                    <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                      <Badge variant="muted">{SOURCE_LABEL[batch.source]}</Badge>
                      <span>{formatBytes(batch.fileSize)}</span>
                      {batch.pageCount ? <span>· {batch.pageCount} página(s)</span> : null}
                    </div>
                  </div>
                </div>

                {phase === 'extracting' ? (
                  <div className="flex flex-col items-center gap-2 py-6 text-muted-foreground">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <p className="text-sm">Lendo o documento e extraindo os lançamentos…</p>
                    {progress && progress.total > 1 ? (
                      <div className="w-full max-w-xs space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <span>Documento grande — lendo em partes</span>
                          <span className="font-medium text-foreground">
                            {progress.done}/{progress.total}
                          </span>
                        </div>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-primary transition-all"
                            style={{
                              width: `${Math.round((progress.done / progress.total) * 100)}%`,
                            }}
                          />
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs">
                        Documentos grandes podem levar alguns instantes — pode acompanhar por aqui.
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-2">
                    <Button variant="ghost" size="sm" onClick={reset}>
                      <RotateCcw className="h-4 w-4" />
                      Trocar arquivo
                    </Button>
                    <Button onClick={() => void continueExtraction()}>
                      Continuar
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
            )}
          </Card>
        )}

        {phase === 'review' && batch && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <FileText className="h-4 w-4" />
                {batch.filename ?? 'documento'}
                <Badge variant="muted">{rows.length} encontrado(s)</Badge>
                <Badge variant="success">{acceptedCount} marcado(s)</Badge>
              </div>
              <Button variant="ghost" size="sm" onClick={reset}>
                <RotateCcw className="h-4 w-4" />
                Recomeçar
              </Button>
            </div>

            <div className="space-y-2">
              {rows.map((r) => {
                const catOptions = categories.filter((c) => c.kind === r.type);
                return (
                  <Card key={r.id} className={`space-y-3 p-3 ${r.accept ? '' : 'opacity-50'}`}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={r.accept}
                          onCheckedChange={(v) => patchRow(r.id, { accept: v })}
                          aria-label="Importar este lançamento"
                        />
                        <span className="text-xs text-muted-foreground">
                          {r.accept ? 'Será importado' : 'Ignorado'}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => patchRow(r.id, { accept: false })}
                        className="text-muted-foreground hover:text-destructive"
                        aria-label="Descartar"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>

                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <div className="space-y-1 sm:col-span-2">
                        <Label className="text-xs">Descrição</Label>
                        <Input
                          value={r.description}
                          onChange={(e) => patchRow(r.id, { description: e.target.value })}
                        />
                      </div>

                      <div className="space-y-1">
                        <Label className="text-xs">Valor</Label>
                        <CurrencyInput
                          value={r.amount}
                          onChange={(e) => patchRow(r.id, { amount: e.target.value })}
                        />
                      </div>

                      <div className="space-y-1">
                        <Label className="text-xs">Tipo</Label>
                        <Select
                          value={r.type}
                          onValueChange={(v) =>
                            patchRow(r.id, { type: v as 'INCOME' | 'EXPENSE', categoryId: '' })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="EXPENSE">Despesa</SelectItem>
                            <SelectItem value="INCOME">Receita</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-1">
                        <Label className="text-xs">Data</Label>
                        <DatePicker value={r.date} onChange={(d) => d && patchRow(r.id, { date: d })} />
                      </div>

                      <div className="space-y-1">
                        <Label className="text-xs">Conta ou cartão</Label>
                        <Select
                          value={r.source}
                          onValueChange={(v) => patchRow(r.id, { source: v })}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Conta ou cartão" />
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

                      <div className="space-y-1 sm:col-span-2">
                        <Label className="text-xs">Categoria</Label>
                        <Select
                          value={r.categoryId}
                          onValueChange={(v) => patchRow(r.id, { categoryId: v })}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Sem categoria" />
                          </SelectTrigger>
                          <SelectContent>
                            {catOptions.map((c) => (
                              <SelectItem key={c.key} value={c.key}>
                                {c.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>

            <Button
              className="w-full"
              onClick={() => void confirm()}
              disabled={confirming || acceptedCount === 0}
            >
              {confirming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Confirmar e importar
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
