import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import { ChevronLeft, ChevronRight, Grid3X3, ImageOff, Play, X } from 'lucide-react';
import { useLockBodyScroll } from '../lib/hooks';
import type { Media } from '../lib/types';

function MediaThumb({ media, className, eager }: { media: Media; className?: string; eager?: boolean }) {
  if (media.kind === 'VIDEO') {
    return (
      <div className={clsx('relative bg-ink-900', className)}>
        <video src={`${media.originalUrl}#t=0.5`} preload="metadata" muted playsInline className="h-full w-full object-cover" />
        <span className="absolute inset-0 flex items-center justify-center">
          <span className="flex size-14 items-center justify-center rounded-full bg-white/90 shadow-lg backdrop-blur">
            <Play className="ml-0.5 size-6 fill-ink-900" />
          </span>
        </span>
      </div>
    );
  }
  return <img src={media.url} alt={media.caption} loading={eager ? 'eager' : 'lazy'} className={clsx('object-cover', className)} />;
}

/** Hero grid on the listing page: one large tile and up to four small ones. */
export function GalleryGrid({ media, onOpen }: { media: Media[]; onOpen: (index?: number) => void }) {
  if (!media.length) {
    return (
      <div className="flex aspect-[2/1] items-center justify-center rounded-3xl bg-ink-100 text-ink-400">
        <ImageOff className="size-10" />
      </div>
    );
  }
  const tiles = media.slice(0, 5);
  return (
    <div className="relative">
      <div className={clsx('grid h-[280px] gap-2 overflow-hidden rounded-3xl sm:h-[420px] lg:h-[480px]', tiles.length >= 5 ? 'sm:grid-cols-4 sm:grid-rows-2' : tiles.length >= 3 ? 'sm:grid-cols-3 sm:grid-rows-2' : 'sm:grid-cols-2')}>
        {tiles.map((item, index) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onOpen(index)}
            className={clsx(
              'group relative overflow-hidden bg-ink-100',
              index === 0 ? 'sm:col-span-2 sm:row-span-2' : 'hidden sm:block',
              tiles.length < 5 && tiles.length >= 3 && index === 0 && 'sm:col-span-2',
            )}
          >
            <MediaThumb media={item} eager={index === 0} className="h-full w-full transition duration-500 group-hover:scale-[1.03] group-hover:brightness-90" />
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={() => onOpen()}
        className="absolute right-4 bottom-4 flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-semibold shadow-ring ring-1 ring-ink-900 transition hover:bg-ink-50 active:scale-95"
      >
        <Grid3X3 className="size-4" />
        Show all {media.length > 1 ? `${media.length} ` : ''}photos
      </button>
    </div>
  );
}

/** Full-screen photo tour (scrolling grid) with a lightbox on top. */
export function GalleryModal({ media, open, startIndex, onClose, title }: { media: Media[]; open: boolean; startIndex: number | null; onClose: () => void; title: string }) {
  const [lightbox, setLightbox] = useState<number | null>(null);
  useLockBodyScroll(open);

  useEffect(() => {
    if (open) setLightbox(startIndex);
  }, [open, startIndex]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (lightbox !== null) setLightbox(null);
        else onClose();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, lightbox, onClose]);

  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 animate-fade-in overflow-y-auto bg-white">
      <div className="sticky top-0 z-10 flex h-16 items-center justify-between bg-white/95 px-4 backdrop-blur md:px-8">
        <button type="button" onClick={onClose} className="flex size-10 items-center justify-center rounded-full hover:bg-ink-100" aria-label="Close photos">
          <ChevronLeft className="size-5" />
        </button>
        <span className="truncate px-4 text-sm font-semibold">{title}</span>
        <span className="w-10" />
      </div>
      <div className="mx-auto max-w-3xl columns-1 gap-2 px-4 pb-16 sm:columns-2">
        {media.map((item, index) => (
          <button key={item.id} type="button" onClick={() => setLightbox(index)} className="mb-2 block w-full overflow-hidden rounded-lg">
            <MediaThumb
              media={item}
              className={clsx('w-full transition hover:brightness-90', item.kind === 'VIDEO' && 'aspect-video')}
            />
            {item.caption && <span className="block py-1.5 text-left text-sm text-ink-600">{item.caption}</span>}
          </button>
        ))}
      </div>
      {lightbox !== null && <Lightbox media={media} index={lightbox} onIndex={setLightbox} onClose={() => setLightbox(null)} />}
    </div>,
    document.body,
  );
}

function Lightbox({ media, index, onIndex, onClose }: { media: Media[]; index: number; onIndex: (index: number) => void; onClose: () => void }) {
  const item = media[index];
  const go = useCallback((delta: number) => onIndex((index + delta + media.length) % media.length), [index, media.length, onIndex]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'ArrowRight') go(1);
      if (event.key === 'ArrowLeft') go(-1);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [go]);

  // Preload neighbours so arrowing feels instant.
  useEffect(() => {
    for (const neighbour of [media[(index + 1) % media.length], media[(index - 1 + media.length) % media.length]]) {
      if (neighbour?.kind === 'IMAGE') new Image().src = neighbour.url;
    }
  }, [index, media]);

  return (
    <div className="fixed inset-0 z-[60] flex animate-fade-in flex-col bg-black text-white">
      <div className="flex h-16 shrink-0 items-center justify-between px-4 md:px-8">
        <button type="button" onClick={onClose} className="flex items-center gap-2 rounded-full px-3 py-2 text-sm font-semibold hover:bg-white/10">
          <X className="size-5" /> Close
        </button>
        <span className="text-sm text-white/80 tabular-nums">
          {index + 1} / {media.length}
        </span>
        <span className="w-20" />
      </div>
      <div className="relative flex min-h-0 flex-1 items-center justify-center px-4 md:px-24">
        {item.kind === 'VIDEO' ? (
          <video key={item.id} src={item.originalUrl} controls autoPlay playsInline className="max-h-full max-w-full rounded-lg" />
        ) : (
          <img key={item.id} src={item.url} alt={item.caption} className="max-h-full max-w-full animate-fade-in object-contain select-none" />
        )}
        {media.length > 1 && (
          <>
            <button type="button" aria-label="Previous" onClick={() => go(-1)} className="absolute left-4 flex size-12 items-center justify-center rounded-full border border-white/30 transition hover:bg-white/10 md:left-8">
              <ChevronLeft className="size-6" />
            </button>
            <button type="button" aria-label="Next" onClick={() => go(1)} className="absolute right-4 flex size-12 items-center justify-center rounded-full border border-white/30 transition hover:bg-white/10 md:right-8">
              <ChevronRight className="size-6" />
            </button>
          </>
        )}
      </div>
      <div className="flex h-16 shrink-0 items-center justify-center px-4 text-center text-sm text-white/80">{item.caption}</div>
    </div>
  );
}
