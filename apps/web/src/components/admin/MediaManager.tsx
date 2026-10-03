import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react';
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, rectSortingStrategy, sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import clsx from 'clsx';
import { AlertCircle, GripVertical, ImagePlus, MoreHorizontal, Pencil, Play, RotateCcw, Star, Trash2, UploadCloud, X } from 'lucide-react';
import { toast } from 'sonner';
import { api, errorMessage } from '../../lib/api';
import { fileSize } from '../../lib/format';
import { useClickOutside } from '../../lib/hooks';
import { acceptedMediaTypes, uploadListingMedia } from '../../lib/upload';
import type { Media } from '../../lib/types';
import { Button, ConfirmDialog, Input, Modal } from '../ui';

const maxMedia = 60;
const maxImageBytes = 30 * 1024 * 1024;
const maxVideoBytes = 1024 * 1024 * 1024;
const concurrency = 3;

type QueuedUpload = {
  localId: string;
  file: File;
  previewUrl: string;
  progress: number;
  status: 'queued' | 'uploading' | 'processing' | 'error';
  error?: string;
};

// ---------------------------------------------------------------------------
// Tiles
// ---------------------------------------------------------------------------

function SortableTile({ media, index, isCover, disabled, onCaption, onDelete, onMakeCover }: {
  media: Media;
  index: number;
  isCover: boolean;
  disabled: boolean;
  onCaption: () => void;
  onDelete: () => void;
  onMakeCover: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: media.id, disabled });
  const [menu, setMenu] = useState(false);
  const menuRef = useClickOutside<HTMLDivElement>(() => setMenu(false), menu);

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={clsx(
        'group relative aspect-[4/3] overflow-hidden rounded-2xl bg-ink-100 ring-1 ring-ink-200/60 transition-shadow',
        isDragging && 'z-20 scale-[1.03] shadow-float ring-2 ring-ink-900',
        index === 0 && 'sm:col-span-2 sm:row-span-2 sm:aspect-auto',
      )}
    >
      <div className="absolute inset-0 cursor-grab touch-none active:cursor-grabbing" {...attributes} {...listeners} aria-label={`Drag to reorder ${media.fileName}`}>
        {media.kind === 'VIDEO' ? (
          <>
            <video src={`${media.originalUrl}#t=0.5`} preload="metadata" muted playsInline className="h-full w-full object-cover" />
            <span className="absolute inset-0 flex items-center justify-center">
              <span className="flex size-11 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur">
                <Play className="ml-0.5 size-5 fill-white" />
              </span>
            </span>
          </>
        ) : (
          <img src={media.thumbUrl} alt={media.caption || media.fileName} draggable={false} className="h-full w-full object-cover" />
        )}
      </div>

      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-2.5">
        {isCover ? (
          <span className="rounded-full bg-white px-2.5 py-1 text-xs font-bold shadow-sm">Cover photo</span>
        ) : (
          <span className="flex size-7 items-center justify-center rounded-full bg-black/45 text-xs font-semibold text-white backdrop-blur">{index + 1}</span>
        )}
        <div ref={menuRef} className="pointer-events-auto relative">
          <button
            type="button"
            aria-label="Photo options"
            disabled={disabled}
            onClick={() => setMenu((value) => !value)}
            className="flex size-8 items-center justify-center rounded-full bg-white/95 opacity-0 shadow-md transition group-hover:opacity-100 focus:opacity-100 data-[open=true]:opacity-100"
            data-open={menu}
          >
            <MoreHorizontal className="size-4" />
          </button>
          {menu && (
            <div className="absolute top-10 right-0 z-30 w-48 animate-pop-in overflow-hidden rounded-xl bg-white py-1.5 text-sm shadow-float ring-1 ring-black/5">
              {!isCover && media.kind === 'IMAGE' && (
                <MenuItem icon={<Star className="size-4" />} onClick={() => { setMenu(false); onMakeCover(); }}>Make cover photo</MenuItem>
              )}
              <MenuItem icon={<Pencil className="size-4" />} onClick={() => { setMenu(false); onCaption(); }}>{media.caption ? 'Edit caption' : 'Add caption'}</MenuItem>
              <MenuItem icon={<Trash2 className="size-4" />} danger onClick={() => { setMenu(false); onDelete(); }}>Delete</MenuItem>
            </div>
          )}
        </div>
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 bg-gradient-to-t from-black/55 to-transparent p-2.5 pt-8 opacity-0 transition group-hover:opacity-100">
        <span className="truncate text-xs font-medium text-white">{media.caption || media.fileName}</span>
        <GripVertical className="size-4 shrink-0 text-white/80" />
      </div>
    </div>
  );
}

function MenuItem({ icon, children, onClick, danger }: { icon: React.ReactNode; children: React.ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button type="button" onClick={onClick} className={clsx('flex w-full items-center gap-2.5 px-3.5 py-2 text-left transition hover:bg-ink-50', danger && 'text-brand-700')}>
      {icon}
      {children}
    </button>
  );
}

function UploadTile({ upload, onRetry, onDismiss }: { upload: QueuedUpload; onRetry: () => void; onDismiss: () => void }) {
  const isVideo = upload.file.type.startsWith('video/');
  return (
    <div className="relative aspect-[4/3] animate-pop-in overflow-hidden rounded-2xl bg-ink-100 ring-1 ring-ink-200/60">
      {isVideo ? (
        <video src={upload.previewUrl} muted className="h-full w-full object-cover opacity-60" />
      ) : (
        <img src={upload.previewUrl} alt="" className={clsx('h-full w-full object-cover transition', upload.status === 'error' ? 'opacity-40 grayscale' : 'opacity-60')} />
      )}
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center">
        {upload.status === 'error' ? (
          <>
            <AlertCircle className="size-6 text-brand-600" />
            <p className="line-clamp-2 text-xs font-medium text-ink-900">{upload.error}</p>
            <div className="flex gap-1.5">
              <Button size="sm" variant="secondary" icon={<RotateCcw className="size-3.5" />} onClick={onRetry}>Retry</Button>
              <Button size="sm" variant="ghost" icon={<X className="size-3.5" />} onClick={onDismiss} aria-label="Dismiss" />
            </div>
          </>
        ) : (
          <>
            <span className="rounded-full bg-white/95 px-3 py-1 text-xs font-semibold shadow-sm">
              {upload.status === 'queued' ? 'Waiting…' : upload.status === 'processing' ? 'Processing…' : `${Math.round(upload.progress * 100)}%`}
            </span>
            <span className="max-w-full truncate text-[11px] font-medium text-ink-800">{upload.file.name} · {fileSize(upload.file.size)}</span>
          </>
        )}
      </div>
      {upload.status !== 'error' && (
        <div className="absolute inset-x-3 bottom-3 h-1.5 overflow-hidden rounded-full bg-white/70">
          <div
            className={clsx('h-full rounded-full bg-ink-900 transition-[width] duration-300', upload.status === 'processing' && 'animate-pulse')}
            style={{ width: `${upload.status === 'processing' ? 100 : Math.max(4, upload.progress * 100)}%` }}
          />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Manager
// ---------------------------------------------------------------------------

export function MediaManager({ listingId, media, onChange }: { listingId: string; media: Media[]; onChange: (media: Media[]) => void }) {
  const [order, setOrder] = useState<Media[]>(media);
  const [queue, setQueue] = useState<QueuedUpload[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [captionFor, setCaptionFor] = useState<Media | null>(null);
  const [caption, setCaption] = useState('');
  const [deleting, setDeleting] = useState<Media | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  const mediaRef = useRef(media);
  mediaRef.current = media;
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  useEffect(() => setOrder(media.filter((item) => item.status === 'READY')), [media]);

  const remaining = maxMedia - order.length - queue.filter((upload) => upload.status !== 'error').length;
  const coverId = order.find((item) => item.kind === 'IMAGE')?.id;

  const patchUpload = (localId: string, patch: Partial<QueuedUpload>) =>
    setQueue((current) => current.map((upload) => (upload.localId === localId ? { ...upload, ...patch } : upload)));

  const runUpload = useCallback(
    async (upload: QueuedUpload) => {
      patchUpload(upload.localId, { status: 'uploading', progress: 0, error: undefined });
      try {
        const ready = await uploadListingMedia(listingId, upload.file, (progress) =>
          patchUpload(upload.localId, { progress, status: progress >= 1 ? 'processing' : 'uploading' }),
        );
        URL.revokeObjectURL(upload.previewUrl);
        setQueue((current) => current.filter((item) => item.localId !== upload.localId));
        onChange([...mediaRef.current, ready]);
      } catch (error) {
        patchUpload(upload.localId, { status: 'error', error: errorMessage(error, 'Upload failed.') });
      }
    },
    [listingId, onChange],
  );

  // Simple worker pool: keep `concurrency` uploads in flight.
  useEffect(() => {
    const active = queue.filter((upload) => upload.status === 'uploading' || upload.status === 'processing').length;
    const next = queue.filter((upload) => upload.status === 'queued').slice(0, Math.max(0, concurrency - active));
    next.forEach((upload) => void runUpload(upload));
  }, [queue, runUpload]);

  const addFiles = (fileList: FileList | File[]) => {
    const files = Array.from(fileList);
    const rejected: string[] = [];
    const accepted = files.filter((file) => {
      if (!acceptedMediaTypes.includes(file.type)) {
        rejected.push(`${file.name}: unsupported type`);
        return false;
      }
      if (file.size > (file.type.startsWith('video/') ? maxVideoBytes : maxImageBytes)) {
        rejected.push(`${file.name}: too large`);
        return false;
      }
      return true;
    });
    const room = accepted.slice(0, Math.max(0, remaining));
    if (accepted.length > room.length) rejected.push(`${accepted.length - room.length} file(s) over the ${maxMedia}-item limit`);
    if (rejected.length) toast.error(`Some files were skipped`, { description: rejected.slice(0, 4).join('\n') });
    if (!room.length) return;
    setQueue((current) => [
      ...current,
      ...room.map((file) => ({ localId: crypto.randomUUID(), file, previewUrl: URL.createObjectURL(file), progress: 0, status: 'queued' as const })),
    ]);
  };

  const persistOrder = async (next: Media[], previous: Media[]) => {
    setOrder(next);
    setBusy(true);
    try {
      const saved = await api<Media[]>(`/admin/listings/${listingId}/media/order`, { method: 'PATCH', body: { mediaIds: next.map((item) => item.id) } });
      onChange(saved);
    } catch (error) {
      setOrder(previous);
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = order.findIndex((item) => item.id === active.id);
    const to = order.findIndex((item) => item.id === over.id);
    if (from < 0 || to < 0) return;
    void persistOrder(arrayMove(order, from, to), order);
  };

  const remove = async (item: Media) => {
    setBusy(true);
    try {
      await api(`/admin/media/${item.id}`, { method: 'DELETE' });
      onChange(mediaRef.current.filter((existing) => existing.id !== item.id));
      toast.success('Deleted');
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
      setDeleting(null);
    }
  };

  const saveCaption = async () => {
    if (!captionFor) return;
    try {
      const updated = await api<Media>(`/admin/media/${captionFor.id}`, { method: 'PATCH', body: { caption } });
      onChange(mediaRef.current.map((item) => (item.id === updated.id ? updated : item)));
      setCaptionFor(null);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const hasFiles = (event: DragEvent) => Array.from(event.dataTransfer.types).includes('Files');

  return (
    <div
      className="relative"
      onDragEnter={(event) => {
        if (!hasFiles(event)) return;
        event.preventDefault();
        dragDepth.current += 1;
        setDragOver(true);
      }}
      onDragOver={(event) => hasFiles(event) && event.preventDefault()}
      onDragLeave={(event) => {
        if (!hasFiles(event)) return;
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (!dragDepth.current) setDragOver(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        dragDepth.current = 0;
        setDragOver(false);
        if (event.dataTransfer.files.length) addFiles(event.dataTransfer.files);
      }}
    >
      {dragOver && (
        <div className="pointer-events-none absolute -inset-3 z-40 flex animate-fade-in items-center justify-center rounded-3xl border-2 border-dashed border-ink-900 bg-white/85 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-2 text-center">
            <UploadCloud className="size-10 animate-bounce" />
            <span className="text-lg font-semibold">Drop to upload</span>
            <span className="text-sm text-ink-500">Photos and videos</span>
          </div>
        </div>
      )}

      <input
        ref={fileInput}
        type="file"
        multiple
        accept={acceptedMediaTypes.join(',')}
        className="hidden"
        onChange={(event) => {
          if (event.target.files?.length) addFiles(event.target.files);
          event.target.value = '';
        }}
      />

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-500">
          {order.length} of {maxMedia} · Drag to reorder. The first photo is the cover shown in search results.
        </p>
        <Button variant="secondary" icon={<ImagePlus className="size-4" />} disabled={remaining <= 0} onClick={() => fileInput.current?.click()}>
          Add photos & videos
        </Button>
      </div>

      {order.length === 0 && queue.length === 0 ? (
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          className="flex w-full flex-col items-center justify-center gap-3 rounded-3xl border-2 border-dashed border-ink-200 px-6 py-16 text-center transition hover:border-ink-400 hover:bg-ink-50"
        >
          <span className="flex size-14 items-center justify-center rounded-2xl bg-ink-100"><UploadCloud className="size-7" /></span>
          <span className="text-lg font-semibold">Drag your photos and videos here</span>
          <span className="text-sm text-ink-500">or click to browse · JPEG, PNG, WebP, AVIF up to 30 MB · MP4, WebM, MOV up to 1 GB</span>
        </button>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={order.map((item) => item.id)} strategy={rectSortingStrategy}>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {order.map((item, index) => (
                <SortableTile
                  key={item.id}
                  media={item}
                  index={index}
                  isCover={item.id === coverId}
                  disabled={busy}
                  onCaption={() => {
                    setCaption(item.caption);
                    setCaptionFor(item);
                  }}
                  onDelete={() => setDeleting(item)}
                  onMakeCover={() => void persistOrder([item, ...order.filter((other) => other.id !== item.id)], order)}
                />
              ))}
              {queue.map((upload) => (
                <UploadTile
                  key={upload.localId}
                  upload={upload}
                  onRetry={() => patchUpload(upload.localId, { status: 'queued', progress: 0, error: undefined })}
                  onDismiss={() => {
                    URL.revokeObjectURL(upload.previewUrl);
                    setQueue((current) => current.filter((item) => item.localId !== upload.localId));
                  }}
                />
              ))}
              {remaining > 0 && (
                <button
                  type="button"
                  onClick={() => fileInput.current?.click()}
                  className="flex aspect-[4/3] flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-ink-200 text-sm font-medium text-ink-500 transition hover:border-ink-400 hover:bg-ink-50 hover:text-ink-900"
                >
                  <ImagePlus className="size-6" />
                  Add more
                </button>
              )}
            </div>
          </SortableContext>
        </DndContext>
      )}

      <Modal
        open={captionFor !== null}
        onClose={() => setCaptionFor(null)}
        title="Caption"
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setCaptionFor(null)}>Cancel</Button>
            <Button onClick={() => void saveCaption()}>Save</Button>
          </div>
        }
      >
        {captionFor && captionFor.kind === 'IMAGE' && <img src={captionFor.thumbUrl} alt="" className="mb-4 aspect-video w-full rounded-xl object-cover" />}
        <Input label="Caption" placeholder="e.g. Primary bedroom with lake view" value={caption} maxLength={300} onChange={(event) => setCaption(event.target.value)} autoFocus />
      </Modal>

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && void remove(deleting)}
        title={`Delete this ${deleting?.kind === 'VIDEO' ? 'video' : 'photo'}?`}
        description="It will be removed from the listing and from storage."
        confirmLabel="Delete"
        destructive
        loading={busy}
      />
    </div>
  );
}
