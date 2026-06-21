import { useRef, useState } from 'react';
import { Loader2, Upload, Sparkles, FileText, Check, X, RotateCcw } from 'lucide-react';
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
import { useLiveAccounts, useLiveCategories } from '@/hooks/useLiveData';
import { useSync } from '@/sync/SyncProvider';
import { importApi } from '@/api/endpoints';
import { ApiError } from '@/api/client';
import type { ImportBatch, ImportItem } from '@/api/types';

interface Props {
  opened: boolean;
  onClose: () => void;
  workspaceId: string;
}

type Phase = 'idle' | 'processing' | 'review';

/** Linha editável na revisão (espelha um ImportItem + estado local). */
interface Row {
  id: string;
  accept: boolean;
  date: Date;
  description: string;
  amount: string; // input cru
  type: 'INCOME' | 'EXPENSE';
  categoryId: string;
  accountId: string;
}

function itemToRow(it: ImportItem, fallbackAccount: string): Row {
  return {
    id: it.id,
    accept: true,
    date: new Date(it.date),
    description: it.description,
    amount: String(it.amount),
    type: it.type,
    categoryId: it.categoryId ?? '',
    accountId: it.accountId ?? fallbackAccount,
  };
}

export function ImportAiModal({ opened, onClose, workspaceId }: Props) {
  const { syncNow } = useSync();
  const accounts = useLiveAccounts(workspaceId) ?? [];
  const categories = useLiveCategories(workspaceId) ?? [];

  const fileInput = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [accountId, setAccountId] = useState('');
  const [batch, setBatch] = useState<ImportBatch | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [confirming, setConfirming] = useState(false);

  const patchRow = (id: string, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const reset = () => {
    setPhase('idle');
    setBatch(null);
    setRows([]);
    if (fileInput.current) fileInput.current.value = '';
  };

  const close = () => {
    reset();
    onClose();
  };

  const onFile = async (file: File) => {
    if (!accountId) {
      toast.error('Escolha a conta de destino antes de enviar o documento.');
      return;
    }
    setPhase('processing');
    try {
      const { batch: b } = await importApi.upload(workspaceId, file, accountId);
      setBatch(b);
      setRows((b.items ?? []).map((it) => itemToRow(it, accountId)));
      setPhase(b.items && b.items.length > 0 ? 'review' : 'idle');
      if (!b.items || b.items.length === 0) {
        toast.error('Nenhuma transação foi reconhecida no documento.');
      }
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Falha ao processar o documento.';
      toast.error(msg);
      reset();
    }
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
        await importApi.patchItem(workspaceId, batch.id, r.id, {
          date: r.date.toISOString(),
          description: r.description.trim(),
          amount: Number(r.amount.replace(',', '.')),
          type: r.type,
          categoryId: r.categoryId || null,
          accountId: r.accountId || null,
          status: 'ACCEPTED',
        });
      }
      const { imported } = await importApi.confirm(workspaceId, batch.id, accountId || undefined);
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
      <DialogContent className="max-w-2xl">
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
            <div className="space-y-1.5">
              <Label>Conta de destino</Label>
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a conta" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((a) => (
                    <SelectItem key={a.key} value={a.key}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

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

            {phase === 'processing' ? (
              <div className="flex flex-col items-center gap-2 py-10 text-muted-foreground">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-sm">Lendo o documento e extraindo os lançamentos…</p>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                className="flex w-full flex-col items-center gap-2 rounded-lg border-2 border-dashed border-border p-10 text-muted-foreground transition-colors hover:border-primary hover:text-primary"
              >
                <Upload className="h-8 w-8" />
                <span className="text-sm font-medium">Clique para escolher um documento</span>
                <span className="text-xs">PDF · Imagem · CSV · OFX</span>
              </button>
            )}
          </Card>
        )}

        {phase === 'review' && batch && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <FileText className="h-4 w-4" />
                {batch.filename ?? 'documento'}
                <Badge variant="muted">{rows.length} encontrado(s)</Badge>
                <Badge variant="success">{acceptedCount} marcado(s)</Badge>
              </p>
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
                        <Label className="text-xs">Conta</Label>
                        <Select
                          value={r.accountId}
                          onValueChange={(v) => patchRow(r.id, { accountId: v })}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Conta" />
                          </SelectTrigger>
                          <SelectContent>
                            {accounts.map((a) => (
                              <SelectItem key={a.key} value={a.key}>
                                {a.name}
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
                                {c.icon ? `${c.icon} ` : ''}
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
