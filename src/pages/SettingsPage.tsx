import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Sparkles, KeyRound, ShieldCheck, SlidersHorizontal, Search, Palette } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/components/ui/sonner';
import { CategoriesSettings } from '@/components/settings/CategoriesSettings';
import { TagsSettings } from '@/components/settings/TagsSettings';
import { InstitutionsSettings } from '@/components/settings/InstitutionsSettings';
import { useWorkspace } from '@/workspace/WorkspaceProvider';
import { useTheme } from '@/ui/ThemeProvider';
import type { ThemeMode } from '@/ui/ThemeProvider';
import { workspaceApi } from '@/api/endpoints';
import { ApiError, OfflineError } from '@/api/client';
import type { LlmModelInfo, LlmProvider, WorkspaceSettings, WorkspaceSettingsInput } from '@/api/types';

// Providers suportados (o backend valida o mesmo conjunto).
const PROVIDERS: { value: LlmProvider; label: string }[] = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'anthropic', label: 'Anthropic (Claude)' },
  { value: 'google', label: 'Google (Gemini)' },
];
const PROVIDER_LABEL: Record<LlmProvider, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  google: 'Google (Gemini)',
};
// Sugestões iniciais por provider (até o usuário buscar a lista real via API).
// Todos precisam suportar visão p/ ler PDF/imagem de extratos.
const MODEL_SUGGESTIONS: Record<LlmProvider, string[]> = {
  openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4.1', 'gpt-4.1-mini'],
  anthropic: ['claude-opus-4-8', 'claude-sonnet-4-6', 'claude-haiku-4-5'],
  google: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash'],
};
// Opções de tema (preferência do dispositivo, salva localmente no navegador).
const THEME_OPTIONS: { value: ThemeMode; label: string }[] = [
  { value: 'light', label: 'Claro' },
  { value: 'dark', label: 'Escuro' },
  { value: 'system', label: 'Sistema (segue o aparelho)' },
];
const CURRENCIES = ['BRL', 'USD', 'EUR', 'GBP', 'ARS'];
const CURRENCY_SYMBOLS: Record<string, string> = {
  BRL: 'R$',
  USD: 'US$',
  EUR: '€',
  GBP: '£',
  ARS: 'AR$',
};
// Valor-sentinela do seletor de modelo p/ "usar o padrão do servidor" (o Radix
// Select não aceita value vazio); ao salvar, vira string vazia.
const DEFAULT_MODEL = '__default__';

function handleError(err: unknown) {
  toast.error(
    err instanceof OfflineError
      ? 'Sem conexão — as configurações precisam do servidor'
      : err instanceof ApiError
        ? err.message
        : 'Erro inesperado',
  );
}

export function SettingsPage() {
  const { activeId, active } = useWorkspace();
  const { theme, setTheme } = useTheme();
  const qc = useQueryClient();
  const canEdit = active?.role === 'OWNER' || active?.role === 'ADMIN';

  const { data, isLoading, isError } = useQuery({
    queryKey: ['settings', activeId],
    queryFn: () => workspaceApi.getSettings(activeId!),
    enabled: !!activeId,
  });
  const settings = data?.settings ?? null;

  // --- Geral / financeiro ---
  const [baseCurrency, setBaseCurrency] = useState('BRL');
  const [monthStartDay, setMonthStartDay] = useState('1');
  const [forecastHorizon, setForecastHorizon] = useState('12');
  const [variableLookback, setVariableLookback] = useState('3');
  const [weekStartsOnMonday, setWeekStartsOnMonday] = useState(false);

  // --- IA ---
  const [provider, setProvider] = useState<LlmProvider>('openai');
  const [model, setModel] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [models, setModels] = useState<LlmModelInfo[]>([]);
  const keyConfigured = settings?.llmApiKeySet ?? false;

  // Hidrata o formulário quando as settings chegam (a chave nunca volta).
  useEffect(() => {
    if (!settings) return;
    setBaseCurrency(settings.baseCurrency ?? 'BRL');
    setMonthStartDay(String(settings.monthStartDay ?? 1));
    setForecastHorizon(String(settings.forecastHorizon ?? 12));
    setVariableLookback(String(settings.variableLookback ?? 3));
    setWeekStartsOnMonday(settings.weekStartsOnMonday ?? false);
    const hydratedProvider = (settings.llmProvider as LlmProvider) || 'openai';
    setProvider(hydratedProvider);
    setModel(settings.llmModel ?? '');
    setApiKey('');
    // Restaura a lista de modelos cacheada no banco (só se for do mesmo
    // provider; evita mostrar modelos de um provider que não está selecionado).
    setModels(
      settings.llmModelsProvider === hydratedProvider ? settings.llmModels ?? [] : [],
    );
  }, [settings]);

  const save = useMutation({
    mutationFn: (body: WorkspaceSettingsInput) => workspaceApi.updateSettings(activeId!, body),
    onSuccess: () => {
      setApiKey('');
      void qc.invalidateQueries({ queryKey: ['settings', activeId] });
      toast.success('Configurações salvas');
    },
    onError: handleError,
  });

  // Busca via API a lista de modelos do provider. Manda a chave digitada (se
  // houver) p/ permitir testar uma ainda não salva; senão o backend usa a do
  // workspace ou a de env.
  const fetchModels = useMutation({
    mutationFn: () =>
      workspaceApi.listLlmModels(activeId!, {
        provider,
        apiKey: apiKey.trim() || undefined,
      }),
    onSuccess: (res) => {
      setModels(res.models);
      // A lista já foi persistida no banco pelo backend; reflete no cache local
      // (sem refetch, p/ não limpar a chave digitada no formulário).
      qc.setQueryData<{ settings: WorkspaceSettings | null }>(['settings', activeId], (prev) =>
        prev?.settings
          ? {
              settings: {
                ...prev.settings,
                llmModels: res.models,
                llmModelsProvider: res.provider,
                llmModelsFetchedAt: res.fetchedAt,
              },
            }
          : prev,
      );
      toast.success(
        res.models.length
          ? `${res.models.length} modelo(s) encontrado(s)`
          : 'Nenhum modelo retornado pelo provedor',
      );
    },
    onError: handleError,
  });

  // Trocar de provider invalida a lista buscada e o modelo (eram do provider
  // anterior); volta para "Padrão do servidor" até o usuário escolher outro.
  const onChangeProvider = (value: LlmProvider) => {
    setProvider(value);
    setModels([]);
    setModel('');
  };

  // Opções do seletor: a lista buscada via API, ou as sugestões do provider.
  // Garante que o modelo salvo apareça mesmo se não estiver na lista buscada.
  const modelOptions = useMemo<LlmModelInfo[]>(() => {
    const base: LlmModelInfo[] = models.length
      ? models
      : MODEL_SUGGESTIONS[provider].map((id) => ({ id, label: null }));
    if (model && !base.some((m) => m.id === model)) {
      return [{ id: model, label: null }, ...base];
    }
    return base;
  }, [models, provider, model]);

  const onSubmitAi = (e: React.FormEvent) => {
    e.preventDefault();
    const body: WorkspaceSettingsInput = {
      llmProvider: provider,
      llmModel: model.trim(),
    };
    // Só envia a chave se o usuário digitou algo (evita sobrescrever com vazio).
    if (apiKey.trim()) body.llmApiKey = apiKey.trim();
    save.mutate(body);
  };

  // Clampa um inteiro dentro de [min,max], caindo no fallback se for inválido.
  const clamp = (raw: string, min: number, max: number, fallback: number) => {
    const n = Math.round(Number(raw));
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
  };

  const onSubmitGeneral = (e: React.FormEvent) => {
    e.preventDefault();
    save.mutate({
      baseCurrency,
      monthStartDay: clamp(monthStartDay, 1, 28, 1),
      forecastHorizon: clamp(forecastHorizon, 1, 36, 12),
      variableLookback: clamp(variableLookback, 1, 12, 3),
      weekStartsOnMonday,
    });
  };

  const clearKey = () => {
    if (!confirm('Remover a chave de API deste perfil?')) return;
    save.mutate({ llmApiKey: '' });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Configurações</h1>
        <p className="text-sm text-muted-foreground">
          Preferências do perfil <span className="font-medium text-foreground">{active?.name}</span>.
        </p>
      </div>

      <Card className="max-w-2xl p-6">
        <div className="mb-4 flex items-center gap-2">
          <Palette className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">Aparência</h2>
        </div>
        <p className="mb-5 text-sm text-muted-foreground">
          Modo de cor da interface. Esta preferência fica salva apenas neste aparelho.
        </p>
        <div className="space-y-2">
          <Label htmlFor="theme">Tema</Label>
          <Select value={theme} onValueChange={(v) => setTheme(v as ThemeMode)}>
            <SelectTrigger id="theme" className="w-full sm:w-64">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {THEME_OPTIONS.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            “Sistema” acompanha automaticamente o tema claro/escuro do seu dispositivo.
          </p>
        </div>
      </Card>

      <Card className="max-w-2xl p-6">
        <div className="mb-4 flex items-center gap-2">
          <SlidersHorizontal className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">Geral</h2>
        </div>
        <p className="mb-5 text-sm text-muted-foreground">
          Moeda, mês financeiro e parâmetros da previsão de saldo deste perfil.
        </p>

        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : isError ? (
          <p className="py-4 text-sm text-destructive">Não foi possível carregar as configurações.</p>
        ) : (
          <form onSubmit={onSubmitGeneral} className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="baseCurrency">Moeda base</Label>
                <Select value={baseCurrency} onValueChange={setBaseCurrency} disabled={!canEdit}>
                  <SelectTrigger id="baseCurrency">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        <span className="text-muted-foreground">{CURRENCY_SYMBOLS[c] ?? ''}</span> {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="monthStartDay">Dia de início do mês</Label>
                <Input
                  id="monthStartDay"
                  type="number"
                  min={1}
                  max={28}
                  value={monthStartDay}
                  onChange={(e) => setMonthStartDay(e.target.value)}
                  disabled={!canEdit}
                />
                <p className="text-xs text-muted-foreground">1–28. Útil p/ quem organiza por data do salário.</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="forecastHorizon">Horizonte da previsão (meses)</Label>
                <Input
                  id="forecastHorizon"
                  type="number"
                  min={1}
                  max={36}
                  value={forecastHorizon}
                  onChange={(e) => setForecastHorizon(e.target.value)}
                  disabled={!canEdit}
                />
                <p className="text-xs text-muted-foreground">1–36 meses projetados à frente.</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="variableLookback">Histórico de gastos variáveis (meses)</Label>
                <Input
                  id="variableLookback"
                  type="number"
                  min={1}
                  max={12}
                  value={variableLookback}
                  onChange={(e) => setVariableLookback(e.target.value)}
                  disabled={!canEdit}
                />
                <p className="text-xs text-muted-foreground">1–12. Base da média móvel na previsão.</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="weekStart">Primeiro dia da semana</Label>
                <Select
                  value={weekStartsOnMonday ? 'monday' : 'sunday'}
                  onValueChange={(v) => setWeekStartsOnMonday(v === 'monday')}
                  disabled={!canEdit}
                >
                  <SelectTrigger id="weekStart">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sunday">Domingo</SelectItem>
                    <SelectItem value="monday">Segunda-feira</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Define o início da semana nos calendários e relatórios.</p>
              </div>
            </div>

            {canEdit ? (
              <Button type="submit" disabled={save.isPending}>
                {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Salvar
              </Button>
            ) : (
              <p className="text-sm text-muted-foreground">
                Apenas administradores do perfil podem alterar estas configurações.
              </p>
            )}
          </form>
        )}
      </Card>

      <Card className="max-w-2xl p-6">
        <div className="mb-4 flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">Importação por IA</h2>
        </div>
        <p className="mb-5 text-sm text-muted-foreground">
          Escolha o provedor de IA, a chave e o modelo usados para ler extratos, faturas e
          comprovantes. A chave é guardada cifrada e compartilhada pelos membros deste perfil.
        </p>

        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : isError ? (
          <p className="py-4 text-sm text-destructive">Não foi possível carregar as configurações.</p>
        ) : (
          <form onSubmit={onSubmitAi} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="provider">Provedor</Label>
              <Select
                value={provider}
                onValueChange={(v) => onChangeProvider(v as LlmProvider)}
                disabled={!canEdit}
              >
                <SelectTrigger id="provider" className="w-full sm:w-64">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROVIDERS.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="model">Modelo de LLM</Label>
              <div className="flex flex-wrap items-center gap-2">
                <Select
                  value={model || DEFAULT_MODEL}
                  onValueChange={(v) => setModel(v === DEFAULT_MODEL ? '' : v)}
                  disabled={!canEdit}
                >
                  <SelectTrigger id="model" className="w-full sm:w-64">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={DEFAULT_MODEL}>Padrão do servidor</SelectItem>
                    {modelOptions.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.label ?? m.id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {canEdit && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => fetchModels.mutate()}
                    disabled={fetchModels.isPending}
                  >
                    {fetchModels.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Search className="h-4 w-4" />
                    )}
                    Buscar modelos
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {models.length
                  ? `${models.length} modelo(s) do provedor — escolha um com visão (lê PDF/imagem).`
                  : 'Escolha um modelo com visão (lê PDF/imagem) ou clique em “Buscar modelos” para listar os do provedor pela API. “Padrão do servidor” usa o configurado no servidor.'}
              </p>
              {settings?.llmModelsFetchedAt && settings.llmModelsProvider === provider && (
                <p className="text-xs text-muted-foreground">
                  Lista atualizada em {new Date(settings.llmModelsFetchedAt).toLocaleString('pt-BR')}.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="apiKey" className="flex items-center gap-2">
                <KeyRound className="h-4 w-4" />
                Chave de API · {PROVIDER_LABEL[provider]}
                {keyConfigured && (
                  <Badge variant="success" className="gap-1">
                    <ShieldCheck className="h-3 w-3" /> Configurada
                  </Badge>
                )}
              </Label>
              <Input
                id="apiKey"
                type="password"
                autoComplete="off"
                placeholder={
                  keyConfigured ? '•••••••••• (deixe em branco p/ manter)' : 'Cole a chave de API do provedor'
                }
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                disabled={!canEdit}
              />
              <p className="text-xs text-muted-foreground">
                Nunca exibimos a chave salva. Digite uma nova para substituí-la.
              </p>
            </div>

            {canEdit ? (
              <div className="flex flex-wrap items-center gap-2">
                <Button type="submit" disabled={save.isPending}>
                  {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  Salvar
                </Button>
                {keyConfigured && (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={clearKey}
                    disabled={save.isPending}
                    className="text-destructive hover:text-destructive"
                  >
                    Remover chave
                  </Button>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Apenas administradores do perfil podem alterar estas configurações.
              </p>
            )}
          </form>
        )}
      </Card>

      {activeId && <CategoriesSettings workspaceId={activeId} canEdit={canEdit} />}
      {activeId && <TagsSettings workspaceId={activeId} canEdit={canEdit} />}
      {activeId && <InstitutionsSettings workspaceId={activeId} canEdit={canEdit} />}
    </div>
  );
}
