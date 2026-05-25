'use client';

import { useActionState, useState } from 'react';
import { uploadFileSourceAction, type UploadState } from './actions';

const initial: UploadState | undefined = undefined;

export function UploadFileForm() {
  const [state, formAction, pending] = useActionState(uploadFileSourceAction, initial);
  const [fileName, setFileName] = useState<string | null>(null);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_auto]">
        <label className="flex cursor-pointer items-center gap-3 rounded-sm border border-dashed border-border bg-surface-raised px-3 py-2 text-sm text-muted-foreground hover:border-primary/40 hover:text-foreground">
          <span>📎</span>
          <span className="flex-1 truncate">
            {fileName ?? 'Escolher arquivo (PDF, DOCX, MD, TXT — max 25MB)'}
          </span>
          <input
            name="file"
            type="file"
            required
            accept=".pdf,.docx,.md,.markdown,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/markdown,text/plain"
            onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
            className="hidden"
          />
        </label>
        <button
          type="submit"
          disabled={pending || !fileName}
          className="rounded-sm bg-primary px-3 py-2 text-xs font-medium text-primary-foreground disabled:opacity-60"
        >
          {pending ? 'Enviando…' : '＋ Indexar arquivo'}
        </button>
      </div>
      {state && !state.ok ? (
        <p role="alert" className="text-xs text-destructive">⚠ {state.error}</p>
      ) : null}
      {state && state.ok ? (
        <p className="text-xs text-success">✓ Arquivo enviado — indexação rodando.</p>
      ) : null}
    </form>
  );
}
