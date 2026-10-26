import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { Image } from '@/api/types';
import { ChevronLeftIcon, ChevronRightIcon, CloseIcon } from '@/components/ui/icons';

interface Props {
  images: Image[];
  /** Photo shown first. */
  startIndex: number;
  title: string;
  onClose: () => void;
}

/** Full-screen photo viewer: swipe, arrow buttons or arrow keys to switch, Esc to close. */
export function PhotoViewer({ images, startIndex, title, onClose }: Props) {
  const { t } = useTranslation();
  const [index, setIndex] = useState(startIndex);
  const listRef = useRef<HTMLUListElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const total = images.length;

  const scrollTo = useCallback((target: number, behavior: ScrollBehavior) => {
    const list = listRef.current;
    // jsdom has no scrollTo; the index state still drives the counter there.
    if (list && 'scrollTo' in list) list.scrollTo({ left: target * list.clientWidth, behavior });
  }, []);
  const show = useCallback(
    (next: number) => {
      const target = Math.min(Math.max(next, 0), total - 1);
      setIndex(target);
      scrollTo(target, 'smooth');
    },
    [scrollTo, total],
  );

  // Jump to the tapped photo when the viewer opens.
  useLayoutEffect(() => {
    scrollTo(startIndex, 'instant');
  }, [scrollTo, startIndex]);

  useEffect(() => {
    closeRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      else if (event.key === 'ArrowLeft') show(index - 1);
      else if (event.key === 'ArrowRight') show(index + 1);
      else return;
      event.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [index, onClose, show]);

  const navButton =
    'absolute top-1/2 hidden size-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-black shadow-card transition disabled:opacity-0 sm:flex';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('apartment.viewer.title', { title })}
      className="fixed inset-0 z-50 flex flex-col bg-black text-white"
    >
      <div className="flex items-center justify-between px-4 pt-[calc(0.75rem+var(--safe-top))] pb-3">
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label={t('apartment.viewer.close')}
          className="flex size-10 items-center justify-center rounded-full bg-white/15 hover:bg-white/25"
        >
          <CloseIcon />
        </button>
        <span aria-live="polite" className="text-sm font-semibold tabular-nums">
          {t('apartment.viewer.counter', { index: index + 1, total })}
        </span>
        <span className="size-10" />
      </div>

      <div className="relative min-h-0 flex-1">
        <ul
          ref={listRef}
          className="flex h-full snap-x snap-mandatory overflow-x-auto overscroll-contain [&::-webkit-scrollbar]:hidden"
          style={{ scrollbarWidth: 'none' }}
          onScroll={(event) => {
            const { scrollLeft, clientWidth } = event.currentTarget;
            setIndex(Math.round(scrollLeft / Math.max(clientWidth, 1)));
          }}
        >
          {images.map((image, i) => (
            <li
              key={image.id}
              aria-hidden={i !== index}
              className="flex h-full w-full shrink-0 snap-center items-center justify-center"
            >
              <img
                src={image.url}
                alt={t('apartment.photoCount', { index: i + 1, total })}
                width={image.width}
                height={image.height}
                loading={Math.abs(i - startIndex) <= 1 ? 'eager' : 'lazy'}
                decoding="async"
                className="max-h-full max-w-full object-contain select-none"
                draggable={false}
              />
            </li>
          ))}
        </ul>
        {total > 1 && (
          <>
            <button
              type="button"
              onClick={() => {
                show(index - 1);
              }}
              disabled={index === 0}
              aria-label={t('apartment.viewer.previous')}
              className={`${navButton} left-4`}
            >
              <ChevronLeftIcon />
            </button>
            <button
              type="button"
              onClick={() => {
                show(index + 1);
              }}
              disabled={index === total - 1}
              aria-label={t('apartment.viewer.next')}
              className={`${navButton} right-4`}
            >
              <ChevronRightIcon />
            </button>
          </>
        )}
      </div>

      {total > 1 && (
        <div
          className="flex justify-center-safe gap-2 overflow-x-auto px-4 pt-3 pb-[calc(0.75rem+var(--safe-bottom))] [&::-webkit-scrollbar]:hidden"
          style={{ scrollbarWidth: 'none' }}
        >
          {images.map((image, i) => (
            <button
              key={image.id}
              type="button"
              onClick={() => {
                show(i);
              }}
              aria-label={t('apartment.photoCount', { index: i + 1, total })}
              aria-current={i === index}
              className={`size-12 shrink-0 overflow-hidden rounded-lg transition ${
                i === index ? 'ring-2 ring-white' : 'opacity-50 hover:opacity-80'
              }`}
            >
              <img src={image.thumb_url} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
