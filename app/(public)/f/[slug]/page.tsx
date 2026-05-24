import { notFound } from 'next/navigation';
import { getPublishedFormBySlug } from '@/src/services/forms';

export async function generateMetadata(props: { params: Promise<{ slug: string }> }) {
  const { slug } = await props.params;
  const form = await getPublishedFormBySlug(slug);
  if (!form) return { title: 'Formulário' };
  return { title: `${form.name} — ${form.organization.name}` };
}

export default async function PublicFormPage(props: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { slug } = await props.params;
  const { error } = await props.searchParams;
  const form = await getPublishedFormBySlug(slug);

  if (!form) notFound();

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-8 px-5 py-14">
      <header className="text-center">
        <p className="divider-eyebrow text-muted-foreground">{form.organization.name}</p>
        <h1 className="mt-3 font-display text-[2.25rem] font-semibold leading-tight tracking-tight">
          {form.name}
        </h1>
        {form.description ? (
          <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">{form.description}</p>
        ) : null}
      </header>

      <form
        method="POST"
        action={`/api/public/forms/${form.slug}/submit`}
        className="flex flex-col gap-5 rounded-lg border border-border bg-surface p-7 shadow-md"
      >
        {error ? (
          <p
            className="rounded-sm border border-destructive/30 bg-destructive-soft px-3 py-2 text-xs text-destructive"
            role="alert"
          >
            {decodeURIComponent(error)}
          </p>
        ) : null}

        {form.fields
          .filter((f) => f.type !== 'hidden')
          .map((f) => (
            <FieldRenderer key={f.id} field={f} />
          ))}

        {form.fields
          .filter((f) => f.type === 'hidden')
          .map((f) => (
            <input key={f.id} type="hidden" name={f.key} value={f.placeholder ?? ''} />
          ))}

        {form.honeypotField ? (
          <div className="absolute -left-[9999px] h-0 w-0 overflow-hidden" aria-hidden>
            <label>
              Não preencha:
              <input
                type="text"
                name={form.honeypotField}
                tabIndex={-1}
                autoComplete="off"
              />
            </label>
          </div>
        ) : null}

        <button
          type="submit"
          className="mt-2 inline-flex items-center justify-center gap-2 rounded-sm bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground shadow-sm transition-all hover:shadow-md active:translate-y-px"
        >
          Enviar solicitação
          <span aria-hidden className="font-mono text-xs">→</span>
        </button>
      </form>

      <p className="text-center text-[0.6875rem] uppercase tracking-widest text-muted-foreground">
        Powered by <span className="font-display italic text-foreground">SmartDesk</span>
      </p>
    </div>
  );
}

function FieldRenderer({
  field,
}: {
  field: {
    id: string;
    key: string;
    label: string;
    type: string;
    placeholder: string | null;
    helpText: string | null;
    required: boolean;
    options: unknown;
  };
}) {
  const fieldId = `field-${field.id}`;
  const baseInputClass =
    'w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary';

  const renderOptions = () => {
    const opts = Array.isArray(field.options) ? (field.options as string[]) : [];
    return opts;
  };

  let input: React.ReactNode;
  switch (field.type) {
    case 'textarea':
      input = (
        <textarea
          id={fieldId}
          name={field.key}
          required={field.required}
          rows={5}
          placeholder={field.placeholder ?? ''}
          className={baseInputClass}
        />
      );
      break;
    case 'select':
      input = (
        <select
          id={fieldId}
          name={field.key}
          required={field.required}
          defaultValue=""
          className={baseInputClass}
        >
          <option value="" disabled>— selecione —</option>
          {renderOptions().map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
      );
      break;
    case 'multiselect':
      input = (
        <select
          id={fieldId}
          name={field.key}
          required={field.required}
          multiple
          className={`${baseInputClass} min-h-24`}
        >
          {renderOptions().map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
      );
      break;
    case 'checkbox':
      input = (
        <label className="flex items-center gap-2 text-sm">
          <input
            id={fieldId}
            type="checkbox"
            name={field.key}
            required={field.required}
            className="h-4 w-4"
          />
          {field.placeholder ?? 'Sim'}
        </label>
      );
      break;
    case 'date':
      input = (
        <input
          id={fieldId}
          type="date"
          name={field.key}
          required={field.required}
          className={baseInputClass}
        />
      );
      break;
    case 'number':
    case 'currency':
      input = (
        <input
          id={fieldId}
          type="number"
          step={field.type === 'currency' ? '0.01' : 'any'}
          name={field.key}
          required={field.required}
          placeholder={field.placeholder ?? ''}
          className={baseInputClass}
        />
      );
      break;
    case 'email':
      input = (
        <input
          id={fieldId}
          type="email"
          name={field.key}
          required={field.required}
          placeholder={field.placeholder ?? ''}
          autoComplete="email"
          className={baseInputClass}
        />
      );
      break;
    case 'url':
      input = (
        <input
          id={fieldId}
          type="url"
          name={field.key}
          required={field.required}
          placeholder={field.placeholder ?? ''}
          className={baseInputClass}
        />
      );
      break;
    case 'phone':
      input = (
        <input
          id={fieldId}
          type="tel"
          name={field.key}
          required={field.required}
          placeholder={field.placeholder ?? ''}
          autoComplete="tel"
          className={baseInputClass}
        />
      );
      break;
    default:
      input = (
        <input
          id={fieldId}
          type="text"
          name={field.key}
          required={field.required}
          placeholder={field.placeholder ?? ''}
          className={baseInputClass}
        />
      );
  }

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={fieldId} className="text-sm font-medium">
        {field.label}
        {field.required ? <span className="ml-0.5 text-destructive">*</span> : null}
      </label>
      {input}
      {field.helpText ? (
        <p className="text-xs text-muted-foreground">{field.helpText}</p>
      ) : null}
    </div>
  );
}
