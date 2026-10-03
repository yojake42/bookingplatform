import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { Bath, BedDouble, ChevronLeft, ChevronRight, ImageOff, Star, Users } from 'lucide-react';
import { money, plural, rating } from '../lib/format';
import type { ListingCard as Listing } from '../lib/types';

const regionAbbreviations: Record<string, string> = {
  California: 'CA', 'New York': 'NY', Washington: 'WA', Florida: 'FL', 'North Carolina': 'NC', 'South Carolina': 'SC', Wisconsin: 'WI', Colorado: 'CO', Texas: 'TX',
};

export function placeShort(listing: Pick<Listing, 'city' | 'region'>) {
  return [listing.city, regionAbbreviations[listing.region] ?? listing.region].filter(Boolean).join(', ');
}

export function isTopRated(listing: Pick<Listing, 'ratingAverage' | 'ratingCount'>) {
  return listing.ratingCount >= 3 && (listing.ratingAverage ?? 0) >= 4.85;
}

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
          'relative aspect-[20/19] overflow-hidden rounded-xl bg-sand transition-[box-shadow,transform] duration-300',
          highlighted ? 'shadow-[0_0_0_2px_var(--color-paper),0_0_0_4px_var(--color-pine-700)]' : 'group-hover:-translate-y-1',
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
                className="h-full w-full shrink-0 snap-center object-cover transition-transform duration-700 group-hover:scale-[1.03]"
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
            <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between p-3 opacity-0 transition group-hover:opacity-100">
              <button type="button" aria-label="Previous photo" onClick={(event) => go(event, -1)} className={clsx('pointer-events-auto flex size-8 items-center justify-center rounded-md bg-paper/95 text-ink-900 shadow-sm transition hover:bg-white', index === 0 && 'invisible')}>
                <ChevronLeft className="size-4" />
              </button>
              <button type="button" aria-label="Next photo" onClick={(event) => go(event, 1)} className={clsx('pointer-events-auto flex size-8 items-center justify-center rounded-md bg-paper/95 text-ink-900 shadow-sm transition hover:bg-white', index === count - 1 && 'invisible')}>
                <ChevronRight className="size-4" />
              </button>
            </div>
            <span className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-sm bg-ink-900/65 px-2 py-0.5 text-[11px] font-bold tracking-wider text-paper tabular-nums backdrop-blur-sm transition group-hover:opacity-0">
              {index + 1} / {count}
            </span>
          </>
        )}
      </div>

      <div className="px-1 pt-4">
        <div className="eyebrow flex items-center gap-2">
          <span>{listing.propertyType}</span>
          <span className="size-1 rotate-45 bg-brass" />
          <span className="truncate">{placeShort(listing)}</span>
        </div>
        <h3 className="display mt-1.5 line-clamp-2 text-[21px] leading-snug text-ink-900 transition-colors group-hover:text-pine-700">{listing.title}</h3>
        <div className="mt-2 flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[13px] text-ink-600">
          <span className="flex items-center gap-1"><Users className="size-3.5 text-ink-400" />{listing.maxGuests}</span>
          <span className="flex items-center gap-1"><BedDouble className="size-3.5 text-ink-400" />{plural(listing.bedrooms, 'bedroom')}</span>
          <span className="flex items-center gap-1"><Bath className="size-3.5 text-ink-400" />{listing.bathrooms}</span>
        </div>
        <div className="mt-3 flex items-end justify-between gap-3 border-t border-ink-200 pt-3">
          <p className="text-[14px] text-ink-600">
            {listing.stayTotal != null ? (
              <>
                <span className="text-[17px] font-bold text-ink-900">{money(listing.stayTotal, listing.currency)}</span> for {plural(listing.stayNights ?? 0, 'night')}
              </>
            ) : (
              <>
                from <span className="text-[17px] font-bold text-ink-900">{money(listing.nightlyPrice, listing.currency)}</span> / night
              </>
            )}
          </p>
          {listing.ratingAverage != null && (
            <span className="flex shrink-0 items-center gap-1 text-[13px] font-semibold">
              <Star className="size-3.5 fill-brass text-brass" />
              {rating(listing.ratingAverage)}
              <span className="font-normal text-ink-500">({listing.ratingCount})</span>
            </span>
          )}
        </div>
        {isTopRated(listing) && <p className="mt-2 text-[12px] font-semibold text-brass">Top rated by guests</p>}
      </div>
    </Link>
  );
}

export function ListingCardSkeleton() {
  return (
    <div>
      <div className="skeleton aspect-[20/19] rounded-xl" />
      <div className="skeleton mt-4 h-3 w-1/3 rounded-sm" />
      <div className="skeleton mt-3 h-5 w-3/4 rounded-sm" />
      <div className="skeleton mt-3 h-4 w-1/2 rounded-sm" />
    </div>
  );
}
