import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { format } from 'date-fns';
import { History } from 'lucide-react';
import { api } from '../lib/api';
import { useDocumentTitle } from '../lib/hooks';
import type { LegalDocument, LegalType, LegalVersionPeriod } from '../lib/types';
import { Footer, PublicHeader } from '../components/layout';
import { Markdown } from '../components/Markdown';
import { Skeleton } from '../components/ui';

type CurrentResponse = LegalDocument & { versions: LegalVersionPeriod[] };

const period = (version: LegalVersionPeriod) =>
  `${format(new Date(version.effectiveFrom), 'MMM d, yyyy')} – ${version.effectiveTo ? format(new Date(version.effectiveTo), 'MMM d, yyyy') : 'present'}`;

/** /terms and /privacy. `?version=N` shows an earlier version, so guests can read what they agreed to. */
export function LegalPage({ type }: { type: LegalType }) {
  const [params] = useSearchParams();
  const requested = Number(params.get('version')) || null;

  const current = useQuery({ queryKey: ['legal', type], queryFn: () => api<CurrentResponse>(`/public/legal/${type}`) });
  const specific = useQuery({
    queryKey: ['legal', type, requested],
    queryFn: () => api<LegalDocument>(`/public/legal/${type}/versions/${requested}`),
    enabled: Boolean(requested && current.data && requested !== current.data.version),
  });
  const document = requested && current.data && requested !== current.data.version ? specific.data : current.data;
  const isOld = Boolean(document && current.data && document.version !== current.data.version);
  const versions = current.data?.versions ?? [];
  const shownPeriod = versions.find((version) => version.version === document?.version);
  useDocumentTitle(document?.title ?? (type === 'terms' ? 'Terms of Service' : 'Privacy Policy'));

  return (
    <div className="flex min-h-dvh flex-col">
      <PublicHeader />
      <main className="mx-auto grid w-full max-w-6xl flex-1 gap-12 px-5 py-12 md:px-10 lg:grid-cols-[1fr_260px]">
        <article className="min-w-0">
          {current.isError ? (
            <p className="text-ink-500">This page hasn't been published yet.</p>
          ) : !document ? (
            <div className="space-y-4">
              <Skeleton className="h-10 w-2/3" />
              <Skeleton className="h-64" />
            </div>
          ) : (
            <div className="animate-fade-in">
              {isOld && (
                <div className="mb-8 rounded-2xl bg-amber-50 p-4 text-sm text-amber-900 ring-1 ring-amber-600/20">
                  You're viewing version {document.version}{shownPeriod ? `, in force ${period(shownPeriod)}` : ''}.{' '}
                  <Link to={`/${type}`} className="font-semibold underline">See the current version</Link>.
                </div>
              )}
              <h1 className="text-4xl font-bold tracking-tight">{document.title}</h1>
              <p className="mt-3 text-sm text-ink-500">
                Version {document.version} · Effective {format(new Date(document.publishedAt), 'MMMM d, yyyy')}
              </p>
              <div className="mt-10">
                <Markdown>{document.content}</Markdown>
              </div>
            </div>
          )}
        </article>

        <aside className="lg:sticky lg:top-28 lg:self-start">
          <div className="mb-6 flex gap-2 rounded-xl bg-ink-100 p-1 text-sm font-semibold">
            {(['terms', 'privacy'] as const).map((item) => (
              <Link key={item} to={`/${item}`} className={clsx('flex-1 rounded-lg py-1.5 text-center transition', item === type ? 'bg-white shadow-ring' : 'text-ink-500 hover:text-ink-900')}>
                {item === 'terms' ? 'Terms' : 'Privacy'}
              </Link>
            ))}
          </div>
          {versions.length > 0 && (
            <>
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold"><History className="size-4" /> Version history</h2>
              <ol className="space-y-1">
                {versions.map((version) => {
                  const active = version.version === document?.version;
                  return (
                    <li key={version.version}>
                      <Link
                        to={version.effectiveTo ? `/${type}?version=${version.version}` : `/${type}`}
                        className={clsx('block rounded-xl px-3 py-2 transition', active ? 'bg-ink-900 text-white' : 'hover:bg-ink-100')}
                      >
                        <span className="text-sm font-semibold">Version {version.version}{!version.effectiveTo && ' · current'}</span>
                        <span className={clsx('block text-xs', active ? 'text-white/70' : 'text-ink-500')}>{period(version)}</span>
                        {version.changeNote && <span className={clsx('mt-0.5 block text-xs', active ? 'text-white/80' : 'text-ink-600')}>{version.changeNote}</span>}
                      </Link>
                    </li>
                  );
                })}
              </ol>
            </>
          )}
        </aside>
      </main>
      <Footer />
    </div>
  );
}
