import { notFound } from 'next/navigation';
import { getSurveyByToken } from '@/src/services/csat';
import { CsatForm } from './csat-form';

export const metadata = { title: 'Avaliar atendimento — SmartDesk' };

export default async function CsatPage(props: { params: Promise<{ token: string }> }) {
  const { token } = await props.params;
  const survey = await getSurveyByToken(token);
  if (!survey) notFound();

  return (
    <div className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center px-6 py-12">
      <div className="w-full overflow-hidden rounded-md border border-border bg-surface shadow-sm">
        <header className="border-b border-border bg-surface-raised px-6 py-4">
          <p className="font-mono text-[0.6875rem] uppercase tracking-widest text-muted-foreground">
            {survey.ticket.organization.name}
          </p>
          <h1 className="mt-2 font-display text-2xl font-semibold leading-tight tracking-tight">
            Como foi seu atendimento?
          </h1>
          <p className="mt-1 text-xs text-muted-foreground">
            Ticket{' '}
            <code className="rounded-sm bg-muted px-1 font-mono">{survey.ticket.code}</code>
            {' · '}
            {survey.ticket.subject}
          </p>
        </header>

        <div className="p-6">
          {survey.submittedAt ? (
            <div className="text-center">
              <div className="numeral-serif text-5xl text-success">✓</div>
              <p className="mt-4 font-display text-lg font-medium tracking-tight">
                Já recebemos sua avaliação
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                Sua nota: <strong className="text-foreground">{survey.rating}/5</strong>.
                Obrigado pelo feedback!
              </p>
            </div>
          ) : (
            <CsatForm token={token} />
          )}
        </div>

        <footer className="border-t border-border bg-surface-sunken px-6 py-3 text-[0.6875rem] text-muted-foreground">
          Sua avaliação é confidencial e usada pra melhorar o atendimento.
        </footer>
      </div>
    </div>
  );
}
