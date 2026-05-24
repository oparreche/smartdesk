'use client';

import { useEffect, useRef, useState } from 'react';

type Props = {
  html: string | null;
  text: string | null;
  /** Quando true (notas internas, WhatsApp), força render texto. */
  textOnly?: boolean;
};

const MAX_IFRAME_HEIGHT = 2400;
const COMPACT_HEIGHT = 380;

export function EmailBody({ html, text, textOnly }: Props) {
  const hasHtml = !!html?.trim() && !textOnly;
  const hasText = !!text?.trim();
  const [mode, setMode] = useState<'html' | 'text'>(hasHtml ? 'html' : 'text');
  const [height, setHeight] = useState(220);
  const [imagesAllowed, setImagesAllowed] = useState(false);
  const [capped, setCapped] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    function handler(e: MessageEvent) {
      if (
        typeof e.data !== 'object' ||
        !e.data ||
        e.data.type !== 'smartdesk:email-height'
      ) {
        return;
      }
      if (e.source !== iframeRef.current?.contentWindow) return;
      const h = Number(e.data.height);
      if (Number.isFinite(h) && h > 0) {
        const next = h + 16;
        setCapped(next > MAX_IFRAME_HEIGHT);
        setHeight(Math.min(next, MAX_IFRAME_HEIGHT));
      }
    }
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  if (!hasHtml && !hasText) {
    return <p className="text-xs italic text-muted-foreground">— sem conteúdo —</p>;
  }

  if (mode === 'html' && hasHtml) {
    // Quando não expandido, mostra preview de texto limpo (rápido de ler).
    // Quando expandido, renderiza o iframe HTML completo.
    if (!expanded) {
      const preview = cleanPlain(text ?? stripTags(html ?? ''));
      const truncated = preview.length > 800;
      const previewText = truncated ? preview.slice(0, 800).trim() + '…' : preview;

      return (
        <div className="flex flex-col gap-2">
          <Toolbar
            mode={mode}
            setMode={setMode}
            hasText={hasText}
            imagesAllowed={imagesAllowed}
            onToggleImages={() => setImagesAllowed((v) => !v)}
          />
          <div className="rounded-sm border border-border bg-surface-raised p-4">
            <p className="whitespace-pre-wrap text-sm leading-relaxed">{previewText}</p>
          </div>
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="inline-flex items-center justify-center gap-1.5 self-stretch rounded-sm border border-dashed border-primary/40 bg-primary-soft/40 px-3 py-1.5 text-xs font-medium text-primary hover:border-primary hover:bg-primary-soft"
          >
            ↓ Ver email original (HTML)
            {truncated ? (
              <span className="font-mono text-[0.6875rem] text-muted-foreground">
                · texto cortado em 800 caracteres
              </span>
            ) : null}
          </button>
        </div>
      );
    }

    return (
      <div className="flex flex-col gap-2">
        <Toolbar
          mode={mode}
          setMode={setMode}
          hasText={hasText}
          imagesAllowed={imagesAllowed}
          onToggleImages={() => setImagesAllowed((v) => !v)}
        />
        <iframe
          ref={iframeRef}
          title="Mensagem de email"
          sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
          referrerPolicy="no-referrer"
          srcDoc={buildSrcDoc(html ?? '', { allowRemoteImages: imagesAllowed })}
          className="w-full rounded-sm border border-border bg-white"
          style={{ height }}
        />
        <div className="flex flex-wrap items-center justify-between gap-2 text-[0.6875rem] text-muted-foreground">
          <span>
            {!imagesAllowed ? (
              <>
                Imagens remotas bloqueadas (privacidade — evita trackers).{' '}
                <button
                  type="button"
                  onClick={() => setImagesAllowed(true)}
                  className="font-medium text-primary hover:underline"
                >
                  Carregar imagens
                </button>
              </>
            ) : (
              <>Imagens carregadas — IP exposto a trackers.</>
            )}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setExpanded(false)}
              className="rounded-sm border border-border bg-surface-raised px-2 py-0.5 text-muted-foreground hover:text-foreground"
            >
              ↑ Recolher
            </button>
            {capped ? (
              <button
                type="button"
                onClick={() => setFullscreen(true)}
                className="rounded-sm border border-warning/40 bg-warning-soft/40 px-2 py-0.5 font-medium text-warning hover:bg-warning-soft"
                title="Email longo — abrir em tela cheia"
              >
                ⤢ Tela cheia
              </button>
            ) : null}
          </div>
        </div>

        {fullscreen ? (
          <FullscreenEmail
            html={html ?? ''}
            allowRemoteImages={imagesAllowed}
            onClose={() => setFullscreen(false)}
          />
        ) : null}
      </div>
    );
  }

  const clean = cleanPlain(text ?? stripTags(html ?? ''));
  return (
    <div className="flex flex-col gap-2">
      {hasHtml && !textOnly ? (
        <Toolbar
          mode={mode}
          setMode={setMode}
          hasText={hasText}
          imagesAllowed={imagesAllowed}
          onToggleImages={() => setImagesAllowed((v) => !v)}
        />
      ) : null}
      <p className="whitespace-pre-wrap text-sm leading-relaxed">{clean}</p>
    </div>
  );
}

function Toolbar({
  mode,
  setMode,
  hasText,
  imagesAllowed,
  onToggleImages,
}: {
  mode: 'html' | 'text';
  setMode: (m: 'html' | 'text') => void;
  hasText: boolean;
  imagesAllowed: boolean;
  onToggleImages: () => void;
}) {
  return (
    <div className="flex items-center justify-end gap-2">
      {mode === 'html' && imagesAllowed ? (
        <button
          type="button"
          onClick={onToggleImages}
          className="rounded-sm border border-border bg-surface-raised px-2 py-0.5 text-[0.6875rem] text-muted-foreground hover:text-foreground"
        >
          🚫 Bloquear imagens
        </button>
      ) : null}
      {hasText ? (
        <div className="flex items-center gap-0.5 rounded-sm border border-border bg-surface-raised p-0.5 text-[0.6875rem]">
          <button
            type="button"
            onClick={() => setMode('html')}
            className={`rounded-sm px-2 py-0.5 transition-colors ${
              mode === 'html'
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            🌐 HTML
          </button>
          <button
            type="button"
            onClick={() => setMode('text')}
            className={`rounded-sm px-2 py-0.5 transition-colors ${
              mode === 'text'
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            📝 Texto
          </button>
        </div>
      ) : null}
    </div>
  );
}

function buildSrcDoc(html: string, opts: { allowRemoteImages: boolean }): string {
  const sanitized = opts.allowRemoteImages
    ? html
    : html.replace(/<img\b[^>]*>/gi, (m) =>
        m.replace(
          /\s(src|srcset)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi,
          ' data-blocked-$1=$2',
        ),
      );

  return `<!doctype html>
<html>
<head>
  <base target="_blank">
  <meta charset="utf-8">
  <meta name="referrer" content="no-referrer">
  <style>
    html, body { margin: 0; padding: 0; }
    body {
      font: 14px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Arial, sans-serif;
      color: #14171c;
      padding: 14px 16px;
      background: #ffffff;
      word-wrap: break-word;
      overflow-wrap: break-word;
    }
    * { max-width: 100% !important; }
    img { max-width: 100%; border: 0; }
    table { max-width: 100% !important; border-collapse: collapse; }
    td, th { vertical-align: top; }
    a { color: #1c2541; text-decoration: underline; word-break: break-all; }
    pre, code { font-family: ui-monospace, "SF Mono", Menlo, monospace; font-size: 0.85em; background: #f4f1e6; padding: 1px 4px; border-radius: 3px; }
    pre { padding: 8px; overflow-x: auto; }
    blockquote { border-left: 3px solid #d0c8b0; margin: 8px 0; padding: 2px 12px; color: #595449; }
    hr { border: 0; border-top: 1px solid #e6e0cf; margin: 12px 0; }
    h1, h2, h3, h4, h5 { font-family: "Fraunces", Georgia, serif; line-height: 1.2; }
    [data-blocked-src]::before {
      content: "🖼 imagem bloqueada";
      display: inline-block;
      padding: 2px 6px;
      font-size: 11px;
      background: #faf0d8;
      color: #83580f;
      border-radius: 3px;
    }
  </style>
</head>
<body>${sanitized}
<script>
  (function() {
    function dehydrateBlockedImages() {
      // Imagens sem src real (bloqueadas) viram zero altura pra não reservar espaço fantasma
      document.querySelectorAll('img').forEach(function(img) {
        var hasSrc = img.getAttribute('src') && img.getAttribute('src').trim() !== '';
        if (!hasSrc) {
          img.style.height = '0';
          img.style.width = '0';
          img.style.display = 'inline-block';
        }
      });
    }

    function measureContentHeight() {
      // Mede pelo fundo do último elemento VISÍVEL com conteúdo real.
      // Ignora trackers invisíveis (opacity 0, hidden, font-size minúsculo).
      var maxBottom = 0;
      var all = document.body.getElementsByTagName('*');
      for (var i = 0; i < all.length; i++) {
        var el = all[i];
        var cs = window.getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') continue;
        var fontPx = parseFloat(cs.fontSize) || 0;
        var txt = (el.textContent || '').replace(/[\\s\\u00a0]/g, '');
        var hasText = txt.length > 0 && fontPx >= 6;
        var isImg = el.tagName === 'IMG' && el.getAttribute('src') && el.getAttribute('src').trim() !== '';
        var isMedia = el.tagName === 'VIDEO' || el.tagName === 'IFRAME' || el.tagName === 'CANVAS';
        if (!hasText && !isImg && !isMedia) continue;
        var rect = el.getBoundingClientRect();
        if (rect.width <= 1 || rect.height <= 1) continue;
        if (rect.bottom > maxBottom) maxBottom = rect.bottom;
      }
      return Math.ceil(maxBottom);
    }

    function emit() {
      var content = measureContentHeight();
      var fallback = document.body.scrollHeight;
      // Se mediu conteúdo, usa ele. Senão, scrollHeight.
      var h = content > 80 ? content + 14 : fallback;
      parent.postMessage({ type: 'smartdesk:email-height', height: h }, '*');
    }
    function refresh() { dehydrateBlockedImages(); emit(); }

    window.addEventListener('load', refresh);
    window.addEventListener('resize', emit);
    if (typeof ResizeObserver !== 'undefined') {
      new ResizeObserver(emit).observe(document.body);
    }
    setTimeout(refresh, 50);
    setTimeout(refresh, 300);
    setTimeout(refresh, 1000);
    document.querySelectorAll('img').forEach(function(i) {
      i.addEventListener('load', refresh);
      i.addEventListener('error', refresh);
    });
  })();
</script>
</body>
</html>`;
}

function FullscreenEmail({
  html,
  allowRemoteImages,
  onClose,
}: {
  html: string;
  allowRemoteImages: boolean;
  onClose: () => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-foreground/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex h-full w-full flex-col overflow-hidden rounded-md border border-border bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-border px-4 py-2.5">
          <p className="font-display text-sm font-medium tracking-tight">Email completo</p>
          <button
            type="button"
            onClick={onClose}
            className="rounded-sm border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            Fechar · Esc
          </button>
        </header>
        <iframe
          title="Email em tela cheia"
          sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
          referrerPolicy="no-referrer"
          srcDoc={buildSrcDoc(html, { allowRemoteImages })}
          className="flex-1 w-full bg-white"
        />
      </div>
    </div>
  );
}

function cleanPlain(s: string): string {
  return s
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/^[ \t]*\|[ \t]*$/gm, '')
    .replace(/^[ \t]*[-=_*]{3,}[ \t]*$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function stripTags(s: string): string {
  return s
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n[ \t]+/g, '\n')
    .trim();
}
