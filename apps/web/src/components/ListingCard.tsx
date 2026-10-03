import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { ChevronLeft, ChevronRight, ImageOff, Star } from 'lucide-react';
import { money, plural, rating } from '../lib/format';
import type { ListingCard as Listing } from '../lib/types';

export function ListingCard({ listing, linkSearch = '', highlighted, onHover }: { listing: Listing; linkSearch?: string; highlighted?: boolean; onHover?: (id: string | null) => void }) {
  const scroller = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const count = listing.images.length;

  const go = (event: React.MouseEvent, delta: number) => {
    event.preventDefault();
    event.stopPropagation();
    const element = scroller.current;
    if (!element) return;
    const next = Math.max(0, Math.min(count - 1, index + delta));
    element.scrollTo({ left: next * element.clientWidth, behavior: 'smooth' });
  };

  return (
    <Link
      to={`/listings/${listing.id}${linkSearch}`}
      onMouseEnter={() => onHover?.(listing.id)}
      onMouseLeave={() => onHover?.(null)}
      className="group block animate-fade-in"
    >
      <div
        className={clsx(
          'relative aspect-[20/19] overflow-hidden rounded-2xl bg-ink-100 transition-shadow duration-200',
          highlighted && 'ring-2 ring-ink-900 ring-offset-2',
        )}
      >
        {count ? (
          <div
            ref={scroller}
            onScroll={(event) => setIndex(Math.round(event.currentTarget.scrollLeft / event.currentTarget.clientWidth))}
            className="scrollbar-none flex h-full snap-x snap-mandatory overflow-x-auto"
          >
            {listing.images.map((image, imageIndex) => (
              <img
                key={image.id}
                src={image.url}
                alt={imageIndex === 0 ? listing.title : ''}
                loading={imageIndex === 0 ? 'eager' : 'lazy'}
                draggable={false}
                className="h-full w-full shrink-0 snap-center object-cover transition-transform duration-500 group-hover:scale-[1.02]"
              />
            ))}
          </div>
        ) : (
          <div className="flex h-full items-center justify-center text-ink-300">
            <ImageOff className="size-8" />
          </div>
        )}

        {count > 1 && (
          <>
            <button
              type="button"
              aria-label="Previous photo"
              onClick={(event) => go(event, -1)}
              className={clsx(
                'absolute top-1/2 left-3 flex size-8 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 shadow-md transition hover:scale-105 hover:bg-white',
                'opacity-0 group-hover:opacity-100',
                index === 0 && 'invisible',
              )}
            >
              <ChevronLeft className="size-4" />
            </button>
            <button
              type="button"
              aria-label="Next photo"
              onClick={(event) => go(event, 1)}
              className={clsx(
                'absolute top-1/2 right-3 flex size-8 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 shadow-md transition hover:scale-105 hover:bg-white',
                'opacity-0 group-hover:opacity-100',
                index === count - 1 && 'invisible',
              )}
            >
              <ChevronRight className="size-4" />
            </button>
            <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center gap-1.5">
              {listing.images.map((image, dotIndex) => (
                <span
                  key={image.id}
                  className={clsx('size-1.5 rounded-full bg-white transition-opacity duration-200', dotIndex === index ? 'opacity-100' : 'opacity-55')}
                />
              ))}
            </div>
          </>
        )}

        {listing.ratingCount >= 3 && (listing.ratingAverage ?? 0) >= 4.85 && (
          <span className="absolute top-3 left-3 rounded-full bg-white/95 px-3 py-1 text-xs font-semibold shadow-sm">Guest favorite</span>
        )}
      </div>

      <div className="mt-3 flex items-start justify-between gap-3">
        <h3 className="min-w-0 truncate text-[15px] font-semibold text-ink-900">
          {listing.propertyType} in {listing.city || listing.region}
        </h3>
        {listing.ratingAverage != null && (
          <span className="flex shrink-0 items-center gap-1 text-[15px]">
            <Star className="size-3.5 fill-ink-900" />
            {rating(listing.ratingAverage)}
            <span className="text-ink-500">({listing.ratingCount})</span>
          </span>
        )}
      </div>
      <p className="truncate text-[15px] text-ink-500">{listing.title}</p>
      <p className="text-[15px] text-ink-500">
        {plural(listing.bedrooms, 'bedroom')} · {plural(listing.maxGuests, 'guest')}
      </p>
      <p className="mt-1 text-[15px]">
        {listing.stayTotal != null ? (
          <>
            <span className="font-semibold">{money(listing.stayTotal, listing.currency)}</span>
            <span className="text-ink-500"> total · {plural(listing.stayNights ?? 0, 'night')}</span>
          </>
        ) : (
          <>
            <span className="font-semibold">{money(listing.nightlyPrice, listing.currency)}</span>
            <span className="text-ink-700"> night</span>
          </>
        )}
      </p>
    </Link>
  );
}

export function ListingCardSkeleton() {
  return (
    <div>
      <div className="skeleton aspect-[20/19] rounded-2xl" />
      <div className="skeleton mt-3 h-4 w-3/4 rounded-md" />
      <div className="skeleton mt-2 h-4 w-1/2 rounded-md" />
      <div className="skeleton mt-2 h-4 w-1/3 rounded-md" />
    </div>
  );
}
