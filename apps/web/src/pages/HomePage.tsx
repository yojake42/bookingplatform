import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, ArrowUpRight, Star } from 'lucide-react';
import { api } from '../lib/api';
import { plural, rating } from '../lib/format';
import { useDocumentTitle } from '../lib/hooks';
import { padBounds, serializeSearch } from '../lib/search';
import type { Destination, SearchResponse } from '../lib/types';
import { Footer, PublicHeader } from '../components/layout';
import { ListingCard, ListingCardSkeleton, placeShort } from '../components/ListingCard';
import { SentenceSearch } from '../components/SearchBar';
import { Skeleton } from '../components/ui';

const steps = [
  { title: 'Choose a home', text: 'Every home in the collection is managed by our own team, so what you see is what you get.' },
  { title: 'Hold your dates', text: 'Your nights are held the moment you check out, then confirmed as soon as payment goes through.' },
  { title: 'Arrive and settle in', text: 'The exact address and arrival details land in your inbox, with a reminder a few days before.' },
];

export function HomePage() {
  const navigate = useNavigate();
  useDocumentTitle('Homes worth the journey');
  const collection = useQuery({
    queryKey: ['search', { sort: 'rating' }],
    queryFn: () => api<SearchResponse>('/public/listings', { query: { sort: 'rating' } }),
  });
  const destinations = useQuery({
    queryKey: ['destinations', ''],
    queryFn: () => api<Destination[]>('/public/listings/destinations', { query: { q: '' } }),
  });

  const listings = collection.data?.items ?? [];
  const featured = listings.find((listing) => listing.images.length) ?? null;
  const selection = listings.slice(0, 6);

  return (
    <div className="flex min-h-dvh flex-col">
      <PublicHeader />

      <main className="flex-1">
        {/* Hero */}
        <section className="mx-auto grid max-w-[1360px] items-center gap-12 px-5 pt-12 pb-20 md:px-10 lg:grid-cols-[1.15fr_0.85fr] lg:pt-20">
          <div className="relative z-10 animate-rise">
            <p className="eyebrow flex items-center gap-3">
              <span className="h-px w-8 bg-brass" />
              {collection.data ? `A collection of ${plural(collection.data.total, 'home')}` : 'A collection of homes'}
            </p>
            <h1 className="display mt-6 text-[52px] leading-[1.02] font-normal text-pine-900 sm:text-[76px]">
              Homes worth
              <br />
              <em className="font-light text-brass">the journey.</em>
            </h1>
            <p className="mt-6 max-w-lg text-[17px] leading-relaxed text-ink-600">
              Cabins in the pines, houses by the water, lofts in the middle of everything. A short list of places we know well and look after ourselves.
            </p>
            <div className="mt-10 rounded-2xl border border-ink-200 bg-white/70 p-6 sm:p-8">
              <SentenceSearch onSearch={(value) => navigate(`/stays?${serializeSearch(value)}`)} />
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-[460px] animate-fade-in [animation-delay:150ms]">
            {featured ? (
              <Link to={`/listings/${featured.id}`} className="group block">
                <div className="arch relative aspect-[4/5] overflow-hidden bg-sand shadow-float">
                  <img src={featured.images[0].url.replace('/thumb.webp', '/large.webp')} alt={featured.title} className="h-full w-full object-cover transition-transform duration-[1.2s] group-hover:scale-[1.04]" />
                </div>
                <div className="absolute -bottom-8 -left-4 max-w-[78%] rounded-xl bg-paper p-4 shadow-float ring-1 ring-ink-200 sm:-left-10">
                  <p className="eyebrow">Featured · {placeShort(featured)}</p>
                  <p className="display mt-1 text-xl leading-snug group-hover:text-pine-700">{featured.title}</p>
                  {featured.ratingAverage != null && (
                    <p className="mt-1.5 flex items-center gap-1 text-[13px] text-ink-600">
                      <Star className="size-3.5 fill-brass text-brass" /> {rating(featured.ratingAverage)} from {plural(featured.ratingCount, 'stay')}
                    </p>
                  )}
                </div>
              </Link>
            ) : (
              <Skeleton className="arch aspect-[4/5]" />
            )}
          </div>
        </section>

        {/* Selection */}
        <section className="border-t border-ink-200 bg-white/60">
          <div className="mx-auto max-w-[1360px] px-5 py-20 md:px-10">
            <div className="flex flex-wrap items-end justify-between gap-6">
              <div>
                <p className="eyebrow">The collection</p>
                <h2 className="display mt-2 text-[40px] leading-tight">Highest rated <em className="font-light text-ink-500">by recent guests</em></h2>
              </div>
              <Link to="/stays" className="group flex items-center gap-2 text-[13px] font-bold tracking-[0.08em] text-pine-800 uppercase">
                See every home on the map <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
              </Link>
            </div>
            <div className="mt-12 grid grid-cols-1 gap-x-8 gap-y-14 sm:grid-cols-2 lg:grid-cols-3">
              {collection.isPending
                ? Array.from({ length: 3 }, (_, index) => <ListingCardSkeleton key={index} />)
                : selection.map((listing) => <ListingCard key={listing.id} listing={listing} />)}
            </div>
          </div>
        </section>

        {/* How it works */}
        <section className="mx-auto max-w-[1360px] px-5 py-20 md:px-10">
          <div className="rule-ornament" />
          <div className="mt-16 grid gap-12 md:grid-cols-3">
            {steps.map((step, index) => (
              <div key={step.title}>
                <span className="display text-[56px] leading-none font-light text-brass">0{index + 1}</span>
                <h3 className="display mt-4 text-2xl">{step.title}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-ink-600">{step.text}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Destinations index */}
        {destinations.data && destinations.data.length > 0 && (
          <section className="bg-sand">
            <div className="mx-auto grid max-w-[1360px] gap-12 px-5 py-20 md:px-10 lg:grid-cols-[0.8fr_1.2fr]">
              <div>
                <p className="eyebrow">Where we are</p>
                <h2 className="display mt-2 text-[40px] leading-tight">From the coast <em className="font-light text-ink-500">to the mountains</em></h2>
                <p className="mt-4 max-w-sm text-[15px] leading-relaxed text-ink-600">Pick a place to see its homes on the map, or browse the whole collection.</p>
              </div>
              <ul className="divide-y divide-ink-300 border-y border-ink-300">
                {destinations.data.map((destination) => (
                  <li key={destination.label}>
                    <button
                      type="button"
                      onClick={() => navigate(`/stays?${serializeSearch({ place: destination.label, bounds: destination.bounds ? padBounds(destination.bounds, 0.15) : null, q: destination.bounds ? '' : destination.label })}`)}
                      className="group flex w-full items-baseline justify-between gap-4 py-4 text-left"
                    >
                      <span className="display text-2xl transition-colors group-hover:text-pine-700 sm:text-[28px]">
                        {destination.city || destination.region}
                        <span className="ml-3 text-base font-light text-ink-500">{[destination.region, destination.country].filter((part) => part && part !== destination.city).join(', ')}</span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2 text-[13px] font-bold text-ink-500 group-hover:text-pine-700">
                        {plural(destination.count, 'home')} <ArrowUpRight className="size-4" />
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}
      </main>

      <Footer />
    </div>
  );
}
