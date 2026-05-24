import Link from 'next/link';
import { searchPublished } from '@/src/services/kb';

export async function KbSuggestions({
  organizationId,
  organizationSlug,
  ticketSubject,
}: {
  organizationId: string;
  organizationSlug: string;
  ticketSubject: string;
}) {
  const articles = await searchPublished(organizationId, ticketSubject, 3);
  if (articles.length === 0) return null;

  return (
    <div className="card p-4">
      <p className="divider-eyebrow text-muted-foreground">Artigos relacionados</p>
      <h3 className="mt-2 font-display text-sm font-medium tracking-tight">
        Base de conhecimento
      </h3>
      <ul className="mt-3 flex flex-col gap-1.5">
        {articles.map((a) => (
          <li key={a.id}>
            <Link
              href={`/help/${organizationSlug}/${a.slug}`}
              target="_blank"
              rel="noreferrer"
              className="block rounded-sm border border-border bg-surface-raised p-2 transition-colors hover:border-primary/40 hover:bg-primary-soft/30"
            >
              <p className="text-xs font-medium text-foreground">{a.title}</p>
              {a.excerpt ? (
                <p className="mt-0.5 line-clamp-2 text-[0.6875rem] text-muted-foreground">
                  {a.excerpt}
                </p>
              ) : null}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
