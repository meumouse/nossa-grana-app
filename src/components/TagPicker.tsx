import { useMemo, useState } from 'react';
import { Check, Plus, Tag as TagIcon, X } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/sonner';
import { cn } from '@/lib/utils';
import { db, type LocalTag } from '@/db/dexie';
import { tagApi } from '@/api/endpoints';
import { ApiError, OfflineError } from '@/api/client';

interface Props {
  workspaceId: string;
  /** Catálogo de tags disponíveis (cacheado, via useLiveTags). */
  tags: LocalTag[];
  /** Ids selecionados. */
  value: string[];
  onChange: (ids: string[]) => void;
}

// Paleta de cores oferecida ao criar uma tag (mesmas matizes do catálogo padrão).
const TAG_COLORS = [
  '#0ea5e9', '#6366f1', '#14b8a6', '#10b981', '#f97316',
  '#ec4899', '#06b6d4', '#eab308', '#8b5cf6', '#ef4444',
];

/** Cor inicial determinística pelo nome — nenhuma tag nasce sem cor. */
function colorForName(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return TAG_COLORS[h % TAG_COLORS.length] ?? TAG_COLORS[0]!;
}

/**
 * Multi-seleção de tags com criação inline. Selecionar/remover funciona offline
 * (só mexe nos ids do lançamento). Criar tag nova exige rede (tags são geridas
 * online) — a recém-criada é cacheada localmente na hora p/ aparecer já.
 */
export function TagPicker({ workspaceId, tags, value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  // Cor escolhida p/ a próxima tag. null = ainda não tocou → usa cor por nome.
  const [pickedColor, setPickedColor] = useState<string | null>(null);

  const byId = useMemo(() => new Map(tags.map((t) => [t.id, t])), [tags]);
  const selected = value.map((id) => byId.get(id)).filter((t): t is LocalTag => !!t);

  const q = query.trim().toLowerCase();
  const filtered = q ? tags.filter((t) => t.name.toLowerCase().includes(q)) : tags;
  // "Criar" aparece só quando há texto que não bate exatamente com uma tag existente.
  const exactMatch = tags.some((t) => t.name.toLowerCase() === q);
  const canCreate = q.length > 0 && !exactMatch;

  const toggle = (id: string) =>
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);

  const create = async () => {
    const name = query.trim();
    if (!name || creating) return;
    setCreating(true);
    try {
      const color = pickedColor ?? colorForName(name);
      const { tag } = await tagApi.create(workspaceId, { name, color });
      // Cacheia localmente p/ o useLiveTags refletir na hora (e no próximo sync).
      await db.tags.put({ id: tag.id, workspaceId: tag.workspaceId, name: tag.name, color: tag.color });
      onChange([...value, tag.id]);
      setQuery('');
      setPickedColor(null);
    } catch (err) {
      if (err instanceof OfflineError) {
        toast.error('Conecte-se à internet para criar tags');
      } else if (err instanceof ApiError) {
        toast.error(err.message);
      } else {
        toast.error('Não foi possível criar a tag');
      }
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="flex min-h-10 w-full flex-wrap items-center gap-1.5 rounded-md border border-input bg-background px-3 py-2 text-left text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            {selected.length === 0 ? (
              <span className="flex items-center gap-2 text-muted-foreground">
                <TagIcon className="h-4 w-4" />
                Adicionar tags
              </span>
            ) : (
              selected.map((t) => (
                <span
                  key={t.id}
                  className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium"
                  style={t.color ? { borderColor: t.color, color: t.color } : undefined}
                >
                  {t.name}
                  <X
                    className="h-3 w-3 cursor-pointer opacity-70 hover:opacity-100"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggle(t.id);
                    }}
                  />
                </span>
              ))
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[--radix-popover-trigger-width] p-0">
          <div className="border-b p-2">
            <Input
              autoFocus
              placeholder="Buscar ou criar tag…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && canCreate) {
                  e.preventDefault();
                  void create();
                }
              }}
              className="h-9"
            />
          </div>
          <div className="max-h-56 overflow-y-auto p-1">
            {filtered.map((t) => {
              const isSel = value.includes(t.id);
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => toggle(t.id)}
                  className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent"
                >
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full border"
                    style={{ backgroundColor: t.color ?? 'transparent', borderColor: t.color ?? 'currentColor' }}
                  />
                  <span className="min-w-0 flex-1 truncate">{t.name}</span>
                  <Check className={cn('h-4 w-4 shrink-0', isSel ? 'opacity-100' : 'opacity-0')} />
                </button>
              );
            })}
            {filtered.length === 0 && !canCreate && (
              <p className="px-2 py-3 text-center text-sm text-muted-foreground">Nenhuma tag.</p>
            )}
            {canCreate && (
              <div className="border-t pt-1">
                <button
                  type="button"
                  onClick={() => void create()}
                  disabled={creating}
                  className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent disabled:opacity-50"
                >
                  <Plus className="h-4 w-4 shrink-0" style={{ color: pickedColor ?? colorForName(query.trim()) }} />
                  <span className="min-w-0 flex-1 truncate">
                    Criar tag “{query.trim()}”
                  </span>
                </button>
                <div className="flex flex-wrap items-center gap-1.5 px-2 py-1.5">
                  <span className="text-xs text-muted-foreground">Cor:</span>
                  {TAG_COLORS.map((c) => {
                    const active = (pickedColor ?? colorForName(query.trim())) === c;
                    return (
                      <button
                        key={c}
                        type="button"
                        aria-label={`Cor ${c}`}
                        onClick={() => setPickedColor(c)}
                        className={cn(
                          'h-5 w-5 rounded-full border transition-transform',
                          active ? 'scale-110 ring-2 ring-ring ring-offset-1 ring-offset-popover' : 'opacity-80 hover:opacity-100',
                        )}
                        style={{ backgroundColor: c, borderColor: c }}
                      />
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
