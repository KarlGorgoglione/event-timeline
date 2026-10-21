// Find an element or a labelled event and jump to it: `scrollToElement` /
// `revealEvent` plus `select` (§12 handle).

import { useId, useMemo, useState } from 'react';
import { useDemo } from '../../app/context';
import { Search as SearchIcon } from '../icons';

interface Hit {
  kind: 'element' | 'event';
  id: string;
  label: string;
  detail: string;
}

const MAX = 8;

export function Search() {
  const { data, handle, scenario } = useDemo();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  const listId = useId();

  const index = useMemo(() => {
    const labels = new Map(data.elements.map((e) => [e.id, e.label ?? e.id]));
    const elements: Hit[] = data.elements.map((e) => ({
      kind: 'element',
      id: e.id,
      label: e.label ?? e.id,
      detail: 'element',
    }));
    const events: Hit[] = data.events
      .filter((e) => e.label !== undefined)
      .slice(0, 5000)
      .map((e) => ({
        kind: 'event',
        id: e.id,
        label: e.label as string,
        detail: `${labels.get(e.sourceId) ?? e.sourceId} → ${labels.get(e.targetId) ?? e.targetId} · ${scenario.formatTime(e.time)}`,
      }));
    return [...elements, ...events];
  }, [data, scenario]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q === '') return [];
    return index
      .filter(
        (h) => h.label.toLowerCase().includes(q) || h.id.toLowerCase() === q,
      )
      .slice(0, MAX);
  }, [index, query]);

  const go = (hit: Hit | undefined) => {
    const h = handle.current;
    if (!hit || !h) return;
    if (hit.kind === 'element') {
      h.scrollToElement(hit.id);
      h.select({ elements: [hit.id] });
    } else {
      h.revealEvent(hit.id);
      h.select({ events: [hit.id] });
    }
    setOpen(false);
  };

  return (
    <div
      className="search"
      data-open={(open && results.length > 0) || undefined}
    >
      <SearchIcon className="search__icon" />
      <input
        id="timeline-search"
        type="search"
        className="input search__input"
        placeholder="Find…  /"
        role="combobox"
        aria-label="Find an element or event"
        aria-expanded={open && results.length > 0}
        aria-controls={listId}
        aria-activedescendant={
          results[active] ? `${listId}-${active}` : undefined
        }
        autoComplete="off"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive((a) => Math.min(results.length - 1, a + 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((a) => Math.max(0, a - 1));
          } else if (e.key === 'Enter') {
            go(results[active]);
          } else if (e.key === 'Escape') {
            setOpen(false);
          }
        }}
      />
      <ul className="search__list" id={listId} role="listbox">
        {results.map((hit, i) => (
          <li
            key={`${hit.kind}:${hit.id}`}
            id={`${listId}-${i}`}
            role="option"
            aria-selected={i === active}
            className="search__item"
            onMouseDown={(e) => {
              e.preventDefault();
              go(hit);
            }}
            onMouseEnter={() => setActive(i)}
          >
            <span className={`search__kind search__kind--${hit.kind}`}>
              {hit.kind === 'element' ? 'Row' : 'Event'}
            </span>
            <span className="search__label">{hit.label}</span>
            <span className="search__detail">{hit.detail}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
