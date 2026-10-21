import { useDemo } from '../../app/context';
import { SCENARIOS } from '../../scenarios';
import type { ScenarioId } from '../../scenarios/types';
import { Segmented } from '../controls';
import { Book, GitHub, Keyboard, Logo, Package } from '../icons';

const REPO = 'https://github.com/KarlGorgoglione/event-timeline';
const NPM = 'https://www.npmjs.com/package/@event-timeline/react';
// The API reference ships beside the demo on Pages; the dev server has none.
const API = import.meta.env.DEV
  ? 'https://karlgorgoglione.github.io/event-timeline/api/'
  : `${import.meta.env.BASE_URL}api/`;

const VIEWS = [
  { value: 'simple', label: 'Simple' },
  { value: 'advanced', label: 'Advanced' },
];

export function TopBar() {
  const { state, dispatch, version, openShortcuts } = useDemo();
  return (
    <header className="topbar">
      <a className="brand" href={REPO} aria-label="event-timeline on GitHub">
        <Logo />
        <span className="brand__name">event-timeline</span>
        {version !== '' && <span className="pill pill--muted">v{version}</span>}
      </a>

      <nav className="scenarios" aria-label="Scenarios">
        {SCENARIOS.map((s) => (
          <button
            key={s.id}
            type="button"
            className="scenarios__tab"
            aria-pressed={s.id === state.scenario}
            title={s.tagline}
            onClick={() => dispatch({ type: 'scenario', id: s.id })}
          >
            {s.short}
          </button>
        ))}
      </nav>
      <select
        className="input select scenarios__select"
        aria-label="Scenario"
        value={state.scenario}
        onChange={(e) =>
          dispatch({ type: 'scenario', id: e.target.value as ScenarioId })
        }
      >
        {SCENARIOS.map((s) => (
          <option key={s.id} value={s.id}>
            {s.title}
          </option>
        ))}
      </select>

      <div className="topbar__end">
        <Segmented
          label="View"
          value={state.view}
          options={VIEWS}
          onChange={(v) =>
            dispatch({ type: 'view', view: v as 'simple' | 'advanced' })
          }
        />
        <button
          type="button"
          className="icon-btn hide-narrow"
          onClick={openShortcuts}
          title="Keyboard shortcuts (?)"
          aria-label="Keyboard shortcuts"
        >
          <Keyboard />
        </button>
        <a
          className="icon-btn hide-narrow"
          href={API}
          title="API reference"
          aria-label="API reference"
        >
          <Book />
        </a>
        <a
          className="icon-btn hide-narrow"
          href={NPM}
          title="npm"
          aria-label="npm package"
        >
          <Package />
        </a>
        <a
          className="icon-btn"
          href={REPO}
          title="GitHub"
          aria-label="GitHub repository"
        >
          <GitHub />
        </a>
      </div>
    </header>
  );
}
