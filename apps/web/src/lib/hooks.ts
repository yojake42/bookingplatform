import { useEffect, useRef, useState } from 'react';

export function useDebounced<T>(value: T, delay = 250) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

/** Calls `handler` on pointer-down outside of the referenced element. */
export function useClickOutside<T extends HTMLElement>(handler: () => void, active = true) {
  const ref = useRef<T>(null);
  const saved = useRef(handler);
  saved.current = handler;
  useEffect(() => {
    if (!active) return;
    const listener = (event: PointerEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) saved.current();
    };
    document.addEventListener('pointerdown', listener);
    return () => document.removeEventListener('pointerdown', listener);
  }, [active]);
  return ref;
}

export function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const media = window.matchMedia(query);
    const update = () => setMatches(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, [query]);
  return matches;
}

/** Locks body scroll while mounted (modals, drawers). */
export function useLockBodyScroll(active = true) {
  useEffect(() => {
    if (!active) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [active]);
}

export function useDocumentTitle(title: string | undefined) {
  useEffect(() => {
    if (title) document.title = `${title} · Haven`;
  }, [title]);
}
