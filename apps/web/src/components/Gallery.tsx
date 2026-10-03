import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import { ChevronLeft, ChevronRight, ImageOff, Images, Play, X } from 'lucide-react';
import { useLockBodyScroll } from '../lib/hooks';
import type { Media } from '../lib/types';

function MediaThumb({ media, className, eager }: { media: Media; className?: string; eager?: boolean }) {
  if (media.kind === 'VIDEO') {
    return (
      <div className={clsx('relative bg-ink-900', className)}>
        <video src={`${media.originalUrl}#t=0.5`} preload="metadata" muted playsInline className="h-full w-full object-cover" />
        <span className="absolute inset-0 flex items-center justify-center">
          <span className="flex size-14 items-center justify-center rounded-full bg-paper/90 shadow-lg backdrop-blur">
            <Play className="ml-0.5 size-6 fill-ink-900" />
          </span>
        </span>
      </div>
    );
  }
  return <img src={media.url} alt={media.caption} loading={eager ? 'eager' : 'lazy'} className={clsx('object-cover', className)} />;
}

/**
 * Listing hero: one cinematic photo with the home's title set over it, and a filmstrip of the
 * next photos beneath. (Deliberately not a mosaic.)
 */
export function HeroGallery({ media, onOpen, children }: { media: Media[]; onOpen: (index?: number) => void; children: ReactNode }) {
  const [first, ...rest] = media;
  const strip = rest.slice(0, 5);
  return (
    <div>
      <div className="relative overflow-hidden rounded-2xl bg-pine-900">
        {first ? (
          <button type="button" onClick={() => onOpen(0)} className="group block w-full" aria-label="Open photo gallery">
            <MediaThumb media={first} eager className="aspect-[4/3] w-full opacity-95 transition duration-700 group-hover:scale-[1.015] sm:aspect-[21/9]" />
          </button>
        ) : (
          <div className="flex aspect-[21/9] items-center justify-center text-paper/40">
            <ImageOff className="size-10" />
          </div>
        )}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-pine-900/90 via-pine-900/25 to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 p-5 text-paper sm:p-10">{children}</div>
        {media.length > 1 && (
          <button
            type="button"
            onClick={() => onOpen()}
            className="absolute top-4 right-4 flex items-center gap-2 rounded-md bg-paper/95 px-3 py-2 text-[12px] font-bold tracking-wide text-ink-900 uppercase shadow-sm transition hover:bg-white"
          >
            <Images className="size-4" />
            Gallery · {media.length}
          </button>
        )}
      </div>
      {strip.length > 0 && (
        <div className="scrollbar-none mt-3 flex gap-3 overflow-x-auto">
          {strip.map((item, index) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onOpen(index + 1)}
              className="group relative aspect-[3/2] w-40 shrink-0 overflow-hidden rounded-lg bg-sand sm:w-auto sm:flex-1"
            >
              <MediaThumb media={item} className="h-full w-full transition duration-500 group-hover:scale-105" />
              {index === strip.length - 1 && media.length > strip.length + 1 && (
                <span className="absolute inset-0 flex items-center justify-center bg-pine-900/60 text-sm font-bold text-paper">+{media.length - strip.length - 1} more</span>
              )}
            </button>
          ))}
        </div>
      )}
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
    <div className="fixed inset-0 z-50 animate-fade-in overflow-y-auto bg-paper">
      <div className="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-ink-200 bg-paper/95 px-4 backdrop-blur md:px-8">
        <button type="button" onClick={onClose} className="flex size-10 items-center justify-center rounded-lg border border-ink-300 hover:border-ink-900" aria-label="Close photos">
          <ChevronLeft className="size-5" />
        </button>
        <span className="display truncate px-4 text-lg">{title}</span>
        <span className="w-10" />
      </div>
      <div className="mx-auto max-w-5xl columns-1 gap-4 px-4 pt-6 pb-16 sm:columns-2 lg:columns-3">
        {media.map((item, index) => (
          <button key={item.id} type="button" onClick={() => setLightbox(index)} className="mb-4 block w-full overflow-hidden rounded-lg">
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
    <div className="fixed inset-0 z-[60] flex animate-fade-in flex-col bg-[#0f1f1a] text-paper">
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
            <button type="button" aria-label="Previous" onClick={() => go(-1)} className="absolute left-4 flex size-12 items-center justify-center rounded-lg border border-paper/25 transition hover:bg-paper/10 md:left-8">
              <ChevronLeft className="size-6" />
            </button>
            <button type="button" aria-label="Next" onClick={() => go(1)} className="absolute right-4 flex size-12 items-center justify-center rounded-lg border border-paper/25 transition hover:bg-paper/10 md:right-8">
              <ChevronRight className="size-6" />
            </button>
          </>
        )}
      </div>
      <div className="flex h-16 shrink-0 items-center justify-center px-4 text-center text-sm text-white/80">{item.caption}</div>
    </div>
  );
}
