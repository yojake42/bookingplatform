import { useEffect, useMemo, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { format, formatDistanceToNow } from 'date-fns';
import { Eye, FileText, History, Mail, MailWarning, RotateCcw, Search, Send, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../lib/api';
import { useDebounced, useDocumentTitle } from '../../lib/hooks';
import type { EmailDetail, EmailStatus, EmailSummary, LegalDocument, LegalHistoryEntry, LegalType } from '../../lib/types';
import { AdminPage } from '../../components/layout';
import { Markdown } from '../../components/Markdown';
import { Badge, Button, Card, ConfirmDialog, Drawer, EmptyState, Input, Modal, Segmented, Skeleton } from '../../components/ui';

// ---------------------------------------------------------------------------
// Emails
// ---------------------------------------------------------------------------

const statusTone: Record<EmailStatus, 'green' | 'amber' | 'red' | 'neutral'> = { SENT: 'green', PENDING: 'amber', SENDING: 'amber', FAILED: 'red' };

const templateLabels: Record<string, string> = {
  booking_confirmed: 'Booking confirmed',
  booking_cancelled: 'Booking cancelled',
  refund_issued: 'Refund issued',
  stay_reminder: 'Arrival reminder',
  review_request: 'Review request',
  booking_links: 'Booking links',
  staff_new_booking: 'Staff · new booking',
  staff_booking_cancelled: 'Staff · cancellation',
  staff_welcome: 'Staff · welcome',
};

export function EmailsPage() {
  const [status, setStatus] = useState<'all' | EmailStatus>('all');
  const [text, setText] = useState('');
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<string | null>(null);
  const q = useDebounced(text, 300);
  useDocumentTitle('Emails');

  const emails = useQuery({
    queryKey: ['admin', 'emails', status, q, page],
    queryFn: () => api<{ items: EmailSummary[]; total: number; page: number; pageSize: number; provider: string }>('/admin/emails', { query: { status: status === 'all' ? undefined : status, q, page } }),
    placeholderData: keepPreviousData,
    refetchInterval: 10_000,
  });
  const data = emails.data;

  return (
    <AdminPage
      title="Emails"
      description="Every email the platform sends to guests and staff."
      actions={data && <Badge tone={data.provider === 'log' ? 'amber' : 'green'}>Provider: {data.provider}</Badge>}
    >
      {data?.provider === 'log' && (
        <div className="mb-6 flex gap-3 rounded-2xl bg-amber-50 p-4 text-sm text-amber-900 ring-1 ring-amber-600/20">
          <MailWarning className="size-5 shrink-0" />
          <span>Development mode: emails are recorded here but not delivered. Set <code className="font-mono">EMAIL_PROVIDER=brevo</code> and <code className="font-mono">BREVO_API_KEY</code> to send them.</span>
        </div>
      )}
      <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <Segmented
          value={status}
          onChange={(value) => { setStatus(value); setPage(1); }}
          options={[{ value: 'all', label: 'All' }, { value: 'SENT', label: 'Sent' }, { value: 'PENDING', label: 'Queued' }, { value: 'FAILED', label: 'Failed' }]}
        />
        <Input prefix={<Search className="size-4" />} placeholder="Recipient or subject" value={text} onChange={(event) => { setText(event.target.value); setPage(1); }} wrapperClassName="lg:w-80" />
      </div>

      <Card className="overflow-hidden">
        {emails.isPending ? (
          <div className="space-y-2 p-4">{Array.from({ length: 6 }, (_, index) => <Skeleton key={index} className="h-12" />)}</div>
        ) : !data?.items.length ? (
          <div className="p-6"><EmptyState icon={<Mail className="size-6" />} title="No emails yet" description="Booking confirmations, cancellations, reminders and staff notices will appear here." /></div>
        ) : (
          <ul className={clsx('divide-y divide-ink-100 transition-opacity', emails.isFetching && 'opacity-70')}>
            {data.items.map((email) => (
              <li key={email.id}>
                <button type="button" onClick={() => setOpenId(email.id)} className="flex w-full items-center gap-4 px-5 py-3.5 text-left transition hover:bg-ink-50">
                  <span className={clsx('size-2 shrink-0 rounded-full', { SENT: 'bg-emerald-500', PENDING: 'bg-amber-400', SENDING: 'bg-amber-400', FAILED: 'bg-danger-500' }[email.status])} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{email.subject}</span>
                    <span className="block truncate text-xs text-ink-500">To {email.toName ? `${email.toName} <${email.toEmail}>` : email.toEmail}</span>
                  </span>
                  <span className="hidden shrink-0 rounded-md bg-ink-100 px-2 py-0.5 text-xs font-medium text-ink-600 sm:block">{templateLabels[email.template] ?? email.template}</span>
                  <span className="w-28 shrink-0 text-right text-xs text-ink-500" title={format(new Date(email.createdAt), 'PPpp')}>{formatDistanceToNow(new Date(email.createdAt), { addSuffix: true })}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {data && data.total > data.pageSize && (
        <div className="mt-4 flex items-center justify-between text-sm">
          <span className="text-ink-500">{data.total} emails</span>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
            <Button size="sm" variant="secondary" disabled={page * data.pageSize >= data.total} onClick={() => setPage(page + 1)}>Next</Button>
          </div>
        </div>
      )}
      <EmailDrawer id={openId} onClose={() => setOpenId(null)} />
    </AdminPage>
  );
}

export function EmailDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const email = useQuery({ queryKey: ['admin', 'email', id], queryFn: () => api<EmailDetail>(`/admin/emails/${id}`), enabled: Boolean(id) });
  const retry = useMutation({
    mutationFn: () => api<EmailDetail>(`/admin/emails/${id}/retry`, { method: 'POST' }),
    onSuccess: (data) => {
      queryClient.setQueryData(['admin', 'email', id], data);
      queryClient.invalidateQueries({ queryKey: ['admin', 'emails'] });
      toast.success('Queued to send again');
    },
    onError: (error) => toast.error(error.message),
  });
  const data = email.data;
  return (
    <Drawer
      open={Boolean(id)}
      onClose={onClose}
      title="Email"
      footer={
        data && (data.status === 'FAILED' || data.status === 'SENT') && (
          <Button variant="secondary" className="w-full" icon={data.status === 'FAILED' ? <RotateCcw className="size-4" /> : <Send className="size-4" />} loading={retry.isPending} onClick={() => retry.mutate()}>
            {data.status === 'FAILED' ? 'Retry sending' : 'Send again'}
          </Button>
        )
      }
    >
      {!data ? (
        <Skeleton className="h-96" />
      ) : (
        <div className="space-y-4">
          <div>
            <div className="flex items-center gap-2">
              <Badge tone={statusTone[data.status]}>{data.status.toLowerCase()}</Badge>
              <span className="text-xs text-ink-500">{templateLabels[data.template] ?? data.template}</span>
            </div>
            <h3 className="mt-2 font-semibold">{data.subject}</h3>
            <dl className="mt-3 space-y-1 text-sm">
              <div className="flex gap-2"><dt className="w-20 shrink-0 text-ink-500">To</dt><dd className="truncate">{data.toName ? `${data.toName} <${data.toEmail}>` : data.toEmail}</dd></div>
              <div className="flex gap-2"><dt className="w-20 shrink-0 text-ink-500">Queued</dt><dd>{format(new Date(data.createdAt), 'MMM d, yyyy h:mm:ss a')}</dd></div>
              {data.sentAt && <div className="flex gap-2"><dt className="w-20 shrink-0 text-ink-500">Sent</dt><dd>{format(new Date(data.sentAt), 'MMM d, yyyy h:mm:ss a')} via {data.provider}</dd></div>}
              <div className="flex gap-2"><dt className="w-20 shrink-0 text-ink-500">Attempts</dt><dd>{data.attempts}</dd></div>
            </dl>
            {data.lastError && <p className="mt-3 rounded-xl bg-danger-50 p-3 text-xs text-danger-800">{data.lastError}</p>}
          </div>
          {/* Sandboxed: the email's HTML can't run scripts or reach the console's origin. */}
          <iframe title="Email preview" sandbox="" srcDoc={data.html} className="h-[560px] w-full rounded-2xl bg-white ring-1 ring-ink-200" />
        </div>
      )}
    </Drawer>
  );
}

// ---------------------------------------------------------------------------
// Legal pages
// ---------------------------------------------------------------------------

type LegalOverview = { current: (LegalDocument & { id: string }) | null; history: LegalHistoryEntry[] };

const legalMeta: Record<LegalType, { title: string; path: string }> = {
  terms: { title: 'Terms of Service', path: '/terms' },
  privacy: { title: 'Privacy Policy', path: '/privacy' },
};

export function LegalAdminPage() {
  const [type, setType] = useState<LegalType>('terms');
  useDocumentTitle('Legal pages');
  return (
    <AdminPage
      title="Legal pages"
      description="Publish new versions of the Terms of Service and Privacy Policy. Every version is kept, with the period it was in force."
      actions={<Segmented value={type} onChange={setType} options={[{ value: 'terms', label: 'Terms of Service' }, { value: 'privacy', label: 'Privacy Policy' }]} />}
    >
      <LegalEditor key={type} type={type} />
    </AdminPage>
  );
}

function LegalEditor({ type }: { type: LegalType }) {
  const queryClient = useQueryClient();
  const overview = useQuery({ queryKey: ['admin', 'legal', type], queryFn: () => api<LegalOverview>(`/admin/legal/${type}`) });
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [changeNote, setChangeNote] = useState('');
  const [mode, setMode] = useState<'write' | 'preview'>('write');
  const [confirming, setConfirming] = useState(false);
  const [viewing, setViewing] = useState<number | null>(null);
  const current = overview.data?.current;

  useEffect(() => {
    if (current) {
      setTitle(current.title);
      setContent(current.content);
    } else if (overview.data) {
      setTitle(legalMeta[type].title);
    }
  }, [current, overview.data, type]);

  const dirty = Boolean(current ? title !== current.title || content !== current.content : content.trim());
  const nextVersion = (overview.data?.history[0]?.version ?? 0) + 1;

  const publish = useMutation({
    mutationFn: () => api<LegalDocument>(`/admin/legal/${type}`, { method: 'POST', body: { title, content, changeNote } }),
    onSuccess: (document) => {
      setConfirming(false);
      setChangeNote('');
      queryClient.invalidateQueries({ queryKey: ['admin', 'legal', type] });
      queryClient.invalidateQueries({ queryKey: ['legal', type] });
      toast.success(`Version ${document.version} is now live`);
    },
    onError: (error) => toast.error(error.message),
  });

  if (overview.isPending) return <Skeleton className="h-[560px]" />;

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
      <Card className="p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <FileText className="size-5" />
            <h2 className="font-semibold">{dirty ? `Draft of version ${nextVersion}` : current ? `Version ${current.version} (live)` : 'First version'}</h2>
            {dirty && <Badge tone="amber">Unpublished changes</Badge>}
          </div>
          <div className="flex items-center gap-2">
            <a href={legalMeta[type].path} target="_blank" rel="noreferrer"><Button variant="ghost" size="sm" icon={<Eye className="size-4" />}>Public page</Button></a>
            <Segmented value={mode} onChange={setMode} options={[{ value: 'write', label: 'Write' }, { value: 'preview', label: 'Preview' }]} />
          </div>
        </div>
        <Input wrapperClassName="mt-5" label="Page title" value={title} maxLength={120} onChange={(event) => setTitle(event.target.value)} />
        <div className="mt-4">
          <span className="field-label">Content</span>
          {mode === 'write' ? (
            <textarea
              value={content}
              onChange={(event) => setContent(event.target.value)}
              spellCheck
              className="field min-h-[480px] resize-y font-mono text-[13px] leading-6"
              placeholder="Write in Markdown: ## headings, **bold**, - lists, | tables |"
            />
          ) : (
            <div className="min-h-[480px] rounded-xl p-6 ring-1 ring-ink-200">
              <h1 className="display text-4xl">{title}</h1>
              <div className="mt-6"><Markdown>{content}</Markdown></div>
            </div>
          )}
          <p className="mt-1.5 text-sm text-ink-500">Markdown supported: headings, bold, lists, links and tables.</p>
        </div>
        <div className="mt-6 flex flex-col gap-3 border-t border-ink-100 pt-6 sm:flex-row sm:items-end">
          <Input wrapperClassName="flex-1" label="What changed? (shown in the version history)" placeholder="e.g. Updated refund timing" value={changeNote} maxLength={500} onChange={(event) => setChangeNote(event.target.value)} />
          <div className="flex gap-2">
            {dirty && current && (
              <Button variant="ghost" onClick={() => { setTitle(current.title); setContent(current.content); }}>Discard</Button>
            )}
            <Button icon={<Upload className="size-4" />} disabled={!dirty || content.trim().length < 20 || title.trim().length < 3} onClick={() => setConfirming(true)}>
              Publish version {nextVersion}
            </Button>
          </div>
        </div>
      </Card>

      <Card className="h-fit p-6">
        <h2 className="flex items-center gap-2 font-semibold"><History className="size-5" /> Version history</h2>
        {!overview.data?.history.length ? (
          <p className="mt-3 text-sm text-ink-500">Nothing published yet.</p>
        ) : (
          <ol className="relative mt-5 space-y-5 border-l border-ink-200 pl-5">
            {overview.data.history.map((entry) => (
              <li key={entry.id} className="relative">
                <span className={clsx('absolute top-1 -left-[26px] size-3 rounded-full ring-4 ring-white', entry.isCurrent ? 'bg-emerald-500' : 'bg-ink-300')} />
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold">Version {entry.version}</span>
                  {entry.isCurrent && <Badge tone="green">Live</Badge>}
                </div>
                <p className="mt-0.5 text-xs text-ink-600">
                  {format(new Date(entry.effectiveFrom), 'MMM d, yyyy h:mm a')} → {entry.effectiveTo ? format(new Date(entry.effectiveTo), 'MMM d, yyyy h:mm a') : 'now'}
                </p>
                {entry.changeNote && <p className="mt-1 text-sm text-ink-700">{entry.changeNote}</p>}
                <p className="mt-1 text-xs text-ink-500">
                  {entry.publishedBy ? `Published by ${entry.publishedBy}` : 'Published by system'} · accepted on {entry.acceptedByBookings} booking{entry.acceptedByBookings === 1 ? '' : 's'}
                </p>
                <button type="button" onClick={() => setViewing(entry.version)} className="mt-1.5 text-xs font-semibold underline underline-offset-2 hover:text-ink-600">View</button>
              </li>
            ))}
          </ol>
        )}
      </Card>

      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={() => publish.mutate()}
        loading={publish.isPending}
        title={`Publish version ${nextVersion}?`}
        description={`It goes live immediately on ${legalMeta[type].path}. Guests who book from now on accept this version; earlier bookings keep the version they accepted, and the current version stays in the history.`}
        confirmLabel="Publish"
      />
      <VersionModal type={type} version={viewing} onClose={() => setViewing(null)} onUse={(document) => { setTitle(document.title); setContent(document.content); setMode('write'); setViewing(null); }} />
    </div>
  );
}

function VersionModal({ type, version, onClose, onUse }: { type: LegalType; version: number | null; onClose: () => void; onUse: (document: LegalDocument) => void }) {
  const document = useQuery({ queryKey: ['admin', 'legal', type, version], queryFn: () => api<LegalDocument>(`/admin/legal/${type}/versions/${version}`), enabled: version !== null });
  const data = document.data;
  const published = useMemo(() => (data ? format(new Date(data.publishedAt), 'MMMM d, yyyy h:mm a') : ''), [data]);
  return (
    <Modal
      open={version !== null}
      onClose={onClose}
      title={data ? `${data.title} · version ${data.version}` : 'Version'}
      size="lg"
      footer={data && (
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-ink-500">Published {published}</span>
          <Button variant="secondary" onClick={() => onUse(data)}>Edit from this version</Button>
        </div>
      )}
    >
      {data ? <Markdown>{data.content}</Markdown> : <Skeleton className="h-64" />}
    </Modal>
  );
}
