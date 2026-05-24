'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';

type ShortcutAction =
  | { kind: 'navigate'; href: string }
  | { kind: 'focus-search' }
  | { kind: 'show-help' }
  | { kind: 'new-ticket' };

type Shortcut = {
  combo: string; // ex: "g t", "n", "/", "?"
  label: string;
  group: 'Navegação' | 'Ação' | 'Geral';
  action: ShortcutAction;
};

const SHORTCUTS: Shortcut[] = [
  { combo: 'g d', label: 'Ir para Dashboard', group: 'Navegação', action: { kind: 'navigate', href: '/dashboard' } },
  { combo: 'g t', label: 'Ir para Tickets', group: 'Navegação', action: { kind: 'navigate', href: '/tickets' } },
  { combo: 'g i', label: 'Ir para Integrações', group: 'Navegação', action: { kind: 'navigate', href: '/integrations' } },
  { combo: 'g f', label: 'Ir para Formulários', group: 'Navegação', action: { kind: 'navigate', href: '/forms' } },
  { combo: 'g l', label: 'Ir para Painéis', group: 'Navegação', action: { kind: 'navigate', href: '/layouts' } },
  { combo: 'g r', label: 'Ir para Regras', group: 'Navegação', action: { kind: 'navigate', href: '/rules' } },
  { combo: 'g s', label: 'Ir para Configurações', group: 'Navegação', action: { kind: 'navigate', href: '/settings/organization' } },
  { combo: 'n', label: 'Novo ticket', group: 'Ação', action: { kind: 'new-ticket' } },
  { combo: '/', label: 'Focar busca', group: 'Ação', action: { kind: 'focus-search' } },
  { combo: '?', label: 'Mostrar este painel', group: 'Geral', action: { kind: 'show-help' } },
];

const PREFIX_TIMEOUT = 1200;

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (el.isContentEditable) return true;
  return false;
}

export function KeyboardShortcuts() {
  const router = useRouter();
  const [helpOpen, setHelpOpen] = useState(false);
  const [pendingPrefix, setPendingPrefix] = useState<string | null>(null);

  const grouped = useMemo(() => {
    const out: Record<string, Shortcut[]> = {};
    for (const s of SHORTCUTS) {
      (out[s.group] ??= []).push(s);
    }
    return out;
  }, []);

  const runAction = useCallback(
    (action: ShortcutAction) => {
      switch (action.kind) {
        case 'navigate':
          router.push(action.href);
          break;
        case 'new-ticket':
          router.push('/tickets/new');
          break;
        case 'focus-search': {
          const el = document.querySelector<HTMLInputElement>(
            'input[name="q"], input[type="search"]',
          );
          if (el) {
            el.focus();
            el.select();
          } else {
            router.push('/tickets');
          }
          break;
        }
        case 'show-help':
          setHelpOpen(true);
          break;
      }
    },
    [router],
  );

  useEffect(() => {
    if (!pendingPrefix) return;
    const timer = window.setTimeout(() => setPendingPrefix(null), PREFIX_TIMEOUT);
    return () => window.clearTimeout(timer);
  }, [pendingPrefix]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'Escape') {
        if (helpOpen) {
          e.preventDefault();
          setHelpOpen(false);
        }
        setPendingPrefix(null);
        return;
      }

      if (isTypingTarget(e.target)) return;

      // Combo com prefixo "g _"
      if (pendingPrefix === 'g') {
        const combo = `g ${e.key.toLowerCase()}`;
        const match = SHORTCUTS.find((s) => s.combo === combo);
        setPendingPrefix(null);
        if (match) {
          e.preventDefault();
          runAction(match.action);
        }
        return;
      }

      // Iniciar prefixo "g"
      if (e.key === 'g') {
        e.preventDefault();
        setPendingPrefix('g');
        return;
      }

      // Atalhos diretos
      if (e.key === '?' || (e.key === '/' && e.shiftKey)) {
        e.preventDefault();
        setHelpOpen(true);
        return;
      }
      if (e.key === '/') {
        e.preventDefault();
        runAction({ kind: 'focus-search' });
        return;
      }
      if (e.key.toLowerCase() === 'n') {
        e.preventDefault();
        runAction({ kind: 'new-ticket' });
        return;
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [helpOpen, pendingPrefix, runAction]);

  return (
    <>
      {pendingPrefix ? (
        <div
          className="pointer-events-none fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-md border border-border bg-foreground px-3 py-1.5 text-xs text-background shadow-lg"
          role="status"
          aria-live="polite"
        >
          <span className="font-mono">{pendingPrefix.toUpperCase()}</span>
          <span className="ml-1 text-background/60">aguardando próxima tecla…</span>
        </div>
      ) : null}

      {helpOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-foreground/30 px-4 py-12 backdrop-blur-sm"
          onClick={() => setHelpOpen(false)}
        >
          <div
            className="relative w-full max-w-lg overflow-hidden rounded-md border border-border bg-surface shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="flex items-center justify-between border-b border-border px-5 py-3">
              <div>
                <p className="font-mono text-[0.6875rem] uppercase tracking-widest text-muted-foreground">
                  Atalhos
                </p>
                <h2 className="mt-0.5 font-display text-lg font-medium tracking-tight">
                  Teclado
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setHelpOpen(false)}
                className="rounded-sm border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                Esc
              </button>
            </header>

            <div className="grid gap-5 p-5 sm:grid-cols-2">
              {Object.entries(grouped).map(([group, list]) => (
                <div key={group}>
                  <p className="divider-eyebrow text-muted-foreground">{group}</p>
                  <ul className="mt-2 flex flex-col gap-1.5">
                    {list.map((s) => (
                      <li key={s.combo} className="flex items-center justify-between gap-3 text-xs">
                        <span className="text-foreground-secondary">{s.label}</span>
                        <span className="flex shrink-0 items-center gap-1">
                          {s.combo.split(' ').map((k, i) => (
                            <kbd
                              key={i}
                              className="rounded-sm border border-border bg-surface-raised px-1.5 py-0.5 font-mono text-[0.6875rem] text-foreground shadow-xs"
                            >
                              {k === '?' ? '⇧/' : k.toUpperCase()}
                            </kbd>
                          ))}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>

            <footer className="border-t border-border bg-surface-sunken px-5 py-2 text-[0.6875rem] text-muted-foreground">
              Atalhos não disparam enquanto você digita em campos de texto.
            </footer>
          </div>
        </div>
      ) : null}
    </>
  );
}
