'use client';

import { useActionState, useState } from 'react';
import { saveChatbotConfigAction, type SaveState } from './actions';

const inputClass =
  'rounded-sm border border-border bg-surface-raised px-3 py-2 text-sm shadow-xs outline-none transition-colors focus:border-primary focus:bg-background';

const initial: SaveState | undefined = undefined;

export type ConnOption = { id: string; displayPhoneNumber: string };
export type RequiredFieldInput = {
  key: string;
  label: string;
  question: string;
  type: 'text' | 'email' | 'phone' | 'cpf';
  required: boolean;
};

export function ChatbotConfigForm({
  connections,
  initialValues,
  hasKey,
}: {
  connections: ConnOption[];
  initialValues: {
    connectionId: string;
    enabled: boolean;
    greeting: string;
    systemPrompt: string;
    maxTurns: number;
    geminiModel: string | null;
    requiredFields: RequiredFieldInput[];
    escalationKeywords: string[];
  } | null;
  hasKey: boolean;
}) {
  const defaults = initialValues ?? {
    connectionId: connections[0]?.id ?? '',
    enabled: false,
    greeting: 'Olá! Sou o assistente virtual do SmartDesk. Em que posso ajudar?',
    systemPrompt:
      'Você é um assistente cordial que atende clientes via WhatsApp. Seu objetivo é entender a demanda do cliente, responder dúvidas frequentes do escopo abaixo e, quando necessário, coletar informações antes de transferir pra um atendente humano.\n\nEscopo: helpdesk genérico (substitua aqui pelo seu).',
    maxTurns: 20,
    geminiModel: null,
    requiredFields: [
      { key: 'nome', label: 'Nome completo', question: 'Antes de continuar, qual seu nome completo?', type: 'text', required: true },
      { key: 'email', label: 'Email', question: 'Qual o melhor email pra retorno?', type: 'email', required: true },
      { key: 'assunto', label: 'Resumo do problema', question: 'Pode descrever em 1-2 frases o que está acontecendo?', type: 'text', required: true },
    ],
    escalationKeywords: ['atendente', 'humano', 'pessoa', 'falar com alguem'],
  };

  const [state, formAction, pending] = useActionState(saveChatbotConfigAction, initial);
  const [fields, setFields] = useState<RequiredFieldInput[]>(defaults.requiredFields);
  const [keywords, setKeywords] = useState<string[]>(defaults.escalationKeywords);
  const [newKw, setNewKw] = useState('');
  const [clearKey, setClearKey] = useState(false);

  return (
    <form action={formAction} className="card flex flex-col gap-5 p-5">
      <input type="hidden" name="requiredFields" value={JSON.stringify(fields)} />
      <input type="hidden" name="escalationKeywords" value={JSON.stringify(keywords)} />
      {clearKey ? <input type="hidden" name="geminiApiKey" value="__clear__" /> : null}

      <header>
        <p className="divider-eyebrow text-muted-foreground">
          <span className="numeral-serif text-[0.6875rem] text-primary">01</span>
          <span className="mx-1.5 opacity-40">·</span>
          Configuração do chatbot
        </p>
        <p className="mt-1.5 text-xs text-muted-foreground">
          Quando habilitado, o bot atende mensagens inbound antes de virar ticket. Coleta as
          informações abaixo e escala pra atendente quando bater keyword, atingir limite de
          turnos ou ele mesmo decidir.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-foreground-secondary">Número conectado</span>
          <select name="connectionId" required defaultValue={defaults.connectionId} className={inputClass}>
            {connections.map((c) => (
              <option key={c.id} value={c.id}>{c.displayPhoneNumber}</option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            name="enabled"
            defaultChecked={defaults.enabled}
            className="h-4 w-4 rounded-sm border border-border bg-surface-raised"
          />
          <span className="text-sm font-medium text-foreground">Chatbot habilitado</span>
        </label>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-foreground-secondary">
          Greeting <span className="ml-1 text-muted-foreground">· primeira mensagem (futuro — hoje o bot já entra direto na conversa)</span>
        </span>
        <textarea
          name="greeting"
          defaultValue={defaults.greeting}
          maxLength={2000}
          rows={2}
          className={inputClass}
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-foreground-secondary">
          System prompt · instruções de papel/tom/conhecimento (max 8k chars)
        </span>
        <textarea
          name="systemPrompt"
          defaultValue={defaults.systemPrompt}
          required
          minLength={10}
          maxLength={8000}
          rows={8}
          className={`${inputClass} font-mono text-[0.8125rem]`}
        />
      </label>

      <FieldsEditor fields={fields} onChange={setFields} />

      <KeywordsEditor
        keywords={keywords}
        newValue={newKw}
        onNewValueChange={setNewKw}
        onAdd={() => {
          const t = newKw.trim();
          if (t && !keywords.includes(t)) setKeywords([...keywords, t]);
          setNewKw('');
        }}
        onRemove={(k) => setKeywords(keywords.filter((x) => x !== k))}
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-foreground-secondary">
            Limite de turnos antes de escalar
          </span>
          <input
            name="maxTurns"
            type="number"
            min={2}
            max={50}
            defaultValue={defaults.maxTurns}
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-foreground-secondary">
            Modelo Gemini override <span className="ml-1 text-muted-foreground">· vazio usa o do servidor</span>
          </span>
          <input
            name="geminiModel"
            defaultValue={defaults.geminiModel ?? ''}
            placeholder="gemini-2.5-flash"
            className={inputClass}
          />
        </label>
      </div>

      <div className="rounded-sm border border-border bg-surface-raised p-3">
        <p className="text-xs font-medium text-foreground-secondary">Gemini API Key (tenant)</p>
        <p className="mt-1 text-[0.6875rem] text-muted-foreground">
          Por padrão o bot usa a chave global do SmartDesk. Cole aqui pra usar a chave da sua
          organização (cobrança em conta sua) ou clique em remover pra voltar pro global.
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input
            name="geminiApiKey"
            type="password"
            placeholder={hasKey ? '••• já configurada — cole nova pra trocar' : 'AIzaSyB…'}
            disabled={clearKey}
            autoComplete="off"
            className={`${inputClass} flex-1 font-mono text-[0.8125rem] min-w-[200px]`}
          />
          {hasKey ? (
            <label className="flex items-center gap-1.5 text-[0.6875rem] text-muted-foreground">
              <input
                type="checkbox"
                checked={clearKey}
                onChange={(e) => setClearKey(e.target.checked)}
                className="h-3.5 w-3.5"
              />
              Remover chave (voltar pro global)
            </label>
          ) : null}
        </div>
      </div>

      {state?.ok ? (
        <p className="rounded-sm border border-success/30 bg-success-soft px-3 py-2 text-xs text-success">
          ✓ Configuração salva
        </p>
      ) : null}
      {state && !state.ok ? (
        <p role="alert" className="rounded-sm border border-destructive/30 bg-destructive-soft px-3 py-2 text-xs text-destructive">
          ⚠ {state.error}
        </p>
      ) : null}

      <footer className="flex items-center justify-end border-t border-border-subtle pt-4">
        <button
          type="submit"
          disabled={pending}
          className="rounded-sm bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm disabled:opacity-60"
        >
          {pending ? 'Salvando…' : 'Salvar configuração'}
        </button>
      </footer>
    </form>
  );
}

/* ─────────────────────────── helpers UI ─────────────────────────── */

function FieldsEditor({
  fields,
  onChange,
}: {
  fields: RequiredFieldInput[];
  onChange: (next: RequiredFieldInput[]) => void;
}) {
  function update(i: number, patch: Partial<RequiredFieldInput>) {
    onChange(fields.map((f, idx) => (idx === i ? { ...f, ...patch } : f)));
  }
  return (
    <div className="rounded-sm border border-border bg-surface-raised p-3">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-foreground-secondary">
            Campos a coletar antes de abrir ticket
          </p>
          <p className="mt-0.5 text-[0.6875rem] text-muted-foreground">
            O bot pergunta um por vez. Ordem importa. Key só letras/números/underscore.
          </p>
        </div>
        <button
          type="button"
          onClick={() => onChange([...fields, { key: '', label: '', question: '', type: 'text', required: true }])}
          className="rounded-sm border border-border bg-surface px-2 py-1 text-xs hover:bg-muted"
        >
          ＋ Campo
        </button>
      </div>
      <ul className="mt-3 flex flex-col gap-2">
        {fields.map((f, i) => (
          <li key={i} className="rounded-sm border border-border bg-surface p-2.5">
            <div className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_1fr_2fr_auto_auto_auto]">
              <input
                value={f.key}
                onChange={(e) => update(i, { key: e.target.value.toLowerCase().replace(/[^a-z0-9_]+/g, '_') })}
                placeholder="key (cpf, pedido)"
                className={`${inputClass} font-mono text-[0.75rem]`}
              />
              <input
                value={f.label}
                onChange={(e) => update(i, { label: e.target.value })}
                placeholder="Rótulo (CPF)"
                className={inputClass}
              />
              <input
                value={f.question}
                onChange={(e) => update(i, { question: e.target.value })}
                placeholder="Pergunta que o bot faz"
                className={inputClass}
              />
              <select
                value={f.type}
                onChange={(e) => update(i, { type: e.target.value as RequiredFieldInput['type'] })}
                className={`${inputClass} text-xs`}
              >
                <option value="text">texto</option>
                <option value="email">email</option>
                <option value="phone">phone</option>
                <option value="cpf">cpf</option>
              </select>
              <label className="flex items-center gap-1 text-[0.6875rem] text-muted-foreground">
                <input
                  type="checkbox"
                  checked={f.required}
                  onChange={(e) => update(i, { required: e.target.checked })}
                />
                req
              </label>
              <button
                type="button"
                onClick={() => onChange(fields.filter((_, idx) => idx !== i))}
                className="rounded-sm border border-border bg-surface px-2 text-xs text-muted-foreground hover:border-destructive/40 hover:text-destructive"
              >
                ×
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function KeywordsEditor({
  keywords,
  newValue,
  onNewValueChange,
  onAdd,
  onRemove,
}: {
  keywords: string[];
  newValue: string;
  onNewValueChange: (v: string) => void;
  onAdd: () => void;
  onRemove: (k: string) => void;
}) {
  return (
    <div className="rounded-sm border border-border bg-surface-raised p-3">
      <p className="text-xs font-medium text-foreground-secondary">Keywords de escalação imediata</p>
      <p className="mt-0.5 text-[0.6875rem] text-muted-foreground">
        Se a mensagem do usuário contiver qualquer uma dessas palavras (case-insensitive), o bot
        escala direto sem rodar o LLM.
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {keywords.map((k) => (
          <span
            key={k}
            className="flex items-center gap-1 rounded-sm border border-border bg-surface px-2 py-0.5 text-xs"
          >
            {k}
            <button
              type="button"
              onClick={() => onRemove(k)}
              className="text-muted-foreground hover:text-destructive"
            >
              ×
            </button>
          </span>
        ))}
        <div className="flex items-center gap-1">
          <input
            value={newValue}
            onChange={(e) => onNewValueChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); onAdd(); }
            }}
            placeholder="nova palavra…"
            className={`${inputClass} text-xs`}
            style={{ minWidth: 120 }}
          />
          <button
            type="button"
            onClick={onAdd}
            className="rounded-sm border border-border bg-surface px-2 text-xs hover:bg-muted"
          >
            +
          </button>
        </div>
      </div>
    </div>
  );
}
