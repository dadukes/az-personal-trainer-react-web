import { ChevronRight, Dumbbell, PencilLine, Search, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

import { Button, Eyebrow, Input } from '@/components/ui';
import {
  getExerciseAlternatives,
  searchExercises,
  type CatalogExerciseSummary,
} from '@/lib/api';
import type { ExercisePick } from '@/lib/exercise';

/**
 * The provider's name search returns a small bounded window (~10 max), so keep the page
 * size below it — otherwise page one grabs everything and "Load more" never shows.
 */
const SEARCH_PAGE_SIZE = 8;
const SUGGESTION_LIMIT = 8;

interface Suggestion {
  item: CatalogExerciseSummary;
  why?: string;
}

interface FindAlternativeDialogProps {
  accessToken: string | undefined;
  /** The exercise being replaced. */
  name: string;
  exerciseId?: string;
  title?: string;
  onPick: (pick: ExercisePick) => void;
  onClose: () => void;
}

function toPick(item: CatalogExerciseSummary): ExercisePick {
  return {
    name: item.name,
    exerciseId: item.id,
    targetMuscle: item.target ?? undefined,
    bodyPart: item.body_part ?? undefined,
  };
}

/**
 * "I can't do this one" — suggestions the moment it opens, plus a search for when the
 * user already knows what they'd rather do. Shared by the workout (guided + list) and
 * the plan editor (day rows + exercise detail); the caller decides what a pick means.
 *
 * Like `CoachMemory`, it owns its own fetching: it is opened from deep inside rows on
 * several screens, and none of them need the results afterwards.
 *
 * Full-screen on phones (a bottom sheet would sit under the keyboard the moment the
 * search is focused), a centred dialog from `sm` up. Portalled so it escapes any
 * transformed/scrolling ancestor.
 */
export default function FindAlternativeDialog({
  accessToken,
  name,
  exerciseId,
  title = 'Find an alternative',
  onPick,
  onClose,
}: FindAlternativeDialogProps) {
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CatalogExerciseSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [searching, setSearching] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const reqIdRef = useRef(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Suggestions load straight away. Alternatives hang off a catalog id, so an unlinked
  // exercise first borrows the id of its nearest name match — which is itself offered,
  // since it is often exactly the exercise the user meant.
  useEffect(() => {
    let active = true;
    setSuggestions(null);
    void (async () => {
      if (!accessToken) {
        setSuggestions([]);
        return;
      }
      try {
        let id = exerciseId;
        let closest: CatalogExerciseSummary | undefined;
        if (!id && name.trim().length >= 2) {
          const match = await searchExercises(accessToken, { search: name.trim(), limit: 1 });
          closest = match.exercises[0];
          id = closest?.id;
        }
        const alternatives = id
          ? (await getExerciseAlternatives(accessToken, id, SUGGESTION_LIMIT)).alternatives
          : [];
        if (!active) return;
        setSuggestions([
          ...(closest ? [{ item: closest, why: 'Nearest match by name' }] : []),
          ...alternatives
            .filter((a) => a.id !== exerciseId && a.id !== closest?.id)
            .map((a) => ({ item: a, why: a.why })),
        ]);
      } catch {
        if (active) setSuggestions([]);
      }
    })();
    return () => {
      active = false;
    };
  }, [accessToken, exerciseId, name]);

  // First search page, debounced on the typed term.
  useEffect(() => {
    const term = query.trim();
    if (term.length < 2 || !accessToken) {
      reqIdRef.current += 1;
      setResults([]);
      setTotal(0);
      setSearching(false);
      setLoadingMore(false);
      return;
    }
    setSearching(true);
    const reqId = ++reqIdRef.current;
    const handle = setTimeout(async () => {
      try {
        const res = await searchExercises(accessToken, { search: term, limit: SEARCH_PAGE_SIZE, offset: 0 });
        if (reqId === reqIdRef.current) {
          setResults(res.exercises);
          setTotal(res.total);
        }
      } catch {
        if (reqId === reqIdRef.current) {
          setResults([]);
          setTotal(0);
        }
      } finally {
        if (reqId === reqIdRef.current) setSearching(false);
      }
    }, 350);
    return () => clearTimeout(handle);
  }, [query, accessToken]);

  // Next page, keyed to the live request so a newer query discards a stale page.
  const loadMore = useCallback(async () => {
    const term = query.trim();
    if (!accessToken || term.length < 2) return;
    const reqId = reqIdRef.current;
    setLoadingMore(true);
    try {
      const res = await searchExercises(accessToken, {
        search: term,
        limit: SEARCH_PAGE_SIZE,
        offset: results.length,
      });
      if (reqId === reqIdRef.current) {
        setResults((prev) => [...prev, ...res.exercises]);
        setTotal(res.total);
      }
    } catch {
      /* keep the pages we already have */
    } finally {
      setLoadingMore(false);
    }
  }, [query, accessToken, results.length]);

  const term = query.trim();
  const searchActive = term.length >= 2;
  const visibleResults = results.filter((r) => r.id !== exerciseId);

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex justify-center sm:items-center sm:p-5"
      style={{ background: 'rgba(6,34,77,0.45)' }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="flex h-[100dvh] w-full flex-col sm:h-auto sm:max-h-[min(680px,85dvh)] sm:max-w-[520px] sm:rounded-[24px]"
        style={{ background: 'var(--bg-app)', border: '1px solid var(--border-base)' }}
      >
        <div className="flex items-start gap-3 px-5 pb-3 pt-[max(16px,env(safe-area-inset-top))] sm:pt-5">
          <div className="min-w-0 flex-1">
            <div className="text-[18px] font-extrabold" style={{ color: 'var(--text-primary)' }}>
              {title}
            </div>
            <div className="truncate text-[13px]" style={{ color: 'var(--text-muted)' }}>
              Instead of {name}
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl"
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-base)' }}
          >
            <X size={19} color="var(--text-secondary)" />
          </button>
        </div>

        <div className="relative px-5 pb-3">
          <Search size={16} color="var(--text-muted)" className="pointer-events-none absolute left-[34px] top-[24px] -translate-y-1/2" />
          {/* Not auto-focused: on a phone that raises the keyboard over the suggestions,
              which are what most people opened this for. 16px keeps iOS from zooming. */}
          <Input
            type="search"
            enterKeyHint="search"
            value={query}
            placeholder="Search for an exercise…"
            aria-label="Search for an exercise"
            onChange={(e) => setQuery(e.target.value)}
            style={{ paddingLeft: 40, fontSize: 16 }}
          />
        </div>

        <div
          className="flex flex-1 flex-col gap-2 overflow-y-auto px-5 pb-[max(20px,env(safe-area-inset-bottom))]"
          style={{ overscrollBehavior: 'contain' }}
        >
          {searchActive ? (
            <>
              {searching ? (
                <Muted>Searching…</Muted>
              ) : visibleResults.length > 0 ? (
                <>
                  <Eyebrow className="mt-1">
                    {total > results.length ? `Showing ${results.length} of ${total}` : 'Results'}
                  </Eyebrow>
                  {visibleResults.map((r) => (
                    <ExerciseOptionRow key={r.id} item={r} onPick={() => onPick(toPick(r))} />
                  ))}
                  {results.length < total ? (
                    <Button variant="secondary" size="sm" fullWidth onClick={loadMore} disabled={loadingMore}>
                      {loadingMore ? 'Loading…' : 'Load more results'}
                    </Button>
                  ) : null}
                </>
              ) : (
                <Muted>No catalog matches.</Muted>
              )}
              {/* The catalog will never have everything — let the typed name stand. */}
              {!searching ? (
                <button
                  onClick={() => onPick({ name: term })}
                  className="mt-1 flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-transform active:scale-[0.99]"
                  style={{ border: '1px dashed var(--border-strong)' }}
                >
                  <PencilLine size={16} color="var(--accent-text)" className="flex-shrink-0" />
                  <span className="min-w-0 flex-1 truncate text-[13.5px] font-bold" style={{ color: 'var(--text-primary)' }}>
                    Use &ldquo;{term}&rdquo;
                  </span>
                  <span className="flex-shrink-0 text-[11.5px]" style={{ color: 'var(--text-muted)' }}>
                    as typed
                  </span>
                </button>
              ) : null}
            </>
          ) : (
            <>
              <Eyebrow className="mt-1">Suggested alternatives</Eyebrow>
              {suggestions == null ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-[66px] animate-pulse rounded-xl"
                    style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-base)' }}
                  />
                ))
              ) : suggestions.length === 0 ? (
                <Muted>No suggestions for this one — search above for what you&rsquo;d rather do.</Muted>
              ) : (
                suggestions.map((s) => (
                  <ExerciseOptionRow key={s.item.id} item={s.item} why={s.why} onPick={() => onPick(toPick(s.item))} />
                ))
              )}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function Muted({ children }: { children: ReactNode }) {
  return (
    <p className="py-2 text-[13px]" style={{ color: 'var(--text-muted)' }}>
      {children}
    </p>
  );
}

function ExerciseOptionRow({
  item,
  why,
  onPick,
}: {
  item: CatalogExerciseSummary;
  why?: string;
  onPick: () => void;
}) {
  return (
    <button
      onClick={onPick}
      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-transform active:scale-[0.99]"
      style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-base)' }}
    >
      <div
        className="flex h-11 w-11 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg"
        style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-base)' }}
      >
        {item.image_url ? (
          <img src={item.image_url} alt="" className="h-full w-full object-contain" />
        ) : (
          <Dumbbell size={18} color="var(--text-muted)" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        {/* Catalog names run long ("assisted seated pectoralis major stretch…") and the
            distinguishing word is often last, so they get two lines, not an ellipsis. */}
        <div className="line-clamp-2 text-[14px] font-bold leading-snug" style={{ color: 'var(--text-primary)' }}>
          {item.name}
        </div>
        {/* `why` is a sentence from the backend; only the bare catalog fields get title case. */}
        <div className={`line-clamp-2 text-[12px] ${why ? '' : 'capitalize'}`} style={{ color: 'var(--text-muted)' }}>
          {why ?? [item.target, item.equipment].filter(Boolean).join(' · ')}
        </div>
      </div>
      <ChevronRight size={17} color="var(--text-muted)" className="flex-shrink-0" />
    </button>
  );
}
