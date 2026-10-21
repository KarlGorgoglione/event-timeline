import { useMemo, useState } from 'react';
import { useDemo } from '../../app/context';
import {
  HOOK_SECTION,
  OPTION_SECTIONS,
  THEME_SECTIONS,
} from '../../schema/fields';
import { DENSITIES, type Density } from '../../themes/density';
import { PRESETS, type PresetId } from '../../themes/presets';
import { FieldRow, Segmented, Select } from '../controls';
import { Card } from '../shared/Card';
import { SelectionCard } from '../shared/SelectionCard';
import { ScenarioPanel } from '../panels/ScenarioPanel';
import { FieldSection } from './FieldEditor';
import { DiagnosticsList } from './DiagnosticsList';
import { EventLog } from './EventLog';
import { ExportPanel } from './ExportPanel';
import { Search } from '../icons';

type Tab = 'theme' | 'behaviour' | 'data' | 'export';

const TABS: ReadonlyArray<{ id: Tab; label: string }> = [
  { id: 'theme', label: 'Theme' },
  { id: 'behaviour', label: 'Behaviour' },
  { id: 'data', label: 'Data & API' },
  { id: 'export', label: 'Export' },
];

const TAB_KEY = 'etd-advanced-tab';

function initialTab(): Tab {
  try {
    const saved = localStorage.getItem(TAB_KEY);
    if (TABS.some((t) => t.id === saved)) return saved as Tab;
  } catch {
    // Storage unavailable: start on the theme.
  }
  return 'theme';
}

const ALL_SECTIONS = [...THEME_SECTIONS, ...OPTION_SECTIONS, HOOK_SECTION];

export function AdvancedView() {
  const { state, dispatch } = useDemo();
  const [tab, setTabState] = useState<Tab>(initialTab);
  const [query, setQuery] = useState('');
  const setTab = (t: Tab) => {
    setTabState(t);
    try {
      localStorage.setItem(TAB_KEY, t);
    } catch {
      // Not remembered; harmless.
    }
  };

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q === '') return null;
    return ALL_SECTIONS.map((section) => ({
      section,
      fields: section.fields.filter((f) =>
        `${f.label} ${f.path} ${f.hint} ${section.title}`
          .toLowerCase()
          .includes(q),
      ),
    })).filter((m) => m.fields.length > 0);
  }, [query]);

  return (
    <div className="advanced">
      <div className="advanced__head">
        <label className="filter">
          <Search className="filter__icon" />
          <input
            type="search"
            className="input filter__input"
            placeholder="Filter 80 settings (e.g. dash, font, zoom)"
            aria-label="Filter settings"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        {matches === null && (
          <div className="tabs" role="tablist" aria-label="Settings">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                className="tabs__tab"
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div
        className="inspector__body"
        role={matches === null ? 'tabpanel' : undefined}
      >
        {matches !== null ? (
          matches.length === 0 ? (
            <p className="muted">No setting matches “{query}”.</p>
          ) : (
            matches.map((m) => (
              <FieldSection
                key={m.section.id}
                section={m.section}
                fields={m.fields}
                forceOpen
              />
            ))
          )
        ) : tab === 'theme' ? (
          <>
            <Card title="Base look" eyebrow="A preset, then your edits on top">
              <div className="fields">
                <FieldRow
                  label="Preset"
                  hint="Applying a preset discards theme edits."
                >
                  <Select
                    label="Preset"
                    value={state.preset}
                    options={PRESETS.map((p) => ({
                      value: p.id,
                      label: p.name,
                    }))}
                    onChange={(id) =>
                      dispatch({ type: 'preset', id: id as PresetId })
                    }
                  />
                </FieldRow>
                <FieldRow label="Density">
                  <Segmented
                    label="Density"
                    size="sm"
                    value={state.density}
                    options={DENSITIES}
                    onChange={(d) =>
                      dispatch({ type: 'density', density: d as Density })
                    }
                  />
                </FieldRow>
              </div>
            </Card>
            {THEME_SECTIONS.map((s, i) => (
              <FieldSection key={s.id} section={s} defaultOpen={i === 0} />
            ))}
          </>
        ) : tab === 'behaviour' ? (
          <>
            {OPTION_SECTIONS.map((s, i) => (
              <FieldSection key={s.id} section={s} defaultOpen={i === 0} />
            ))}
            <FieldSection section={HOOK_SECTION} defaultOpen />
          </>
        ) : tab === 'data' ? (
          <>
            <ScenarioPanel />
            <SelectionCard actions />
            <Card
              title="Diagnostics"
              eyebrow="onDiagnostic: lenient validation"
            >
              <DiagnosticsList empty="Nothing reported for this dataset. Try the Playground's broken sample." />
            </Card>
            <EventLog />
          </>
        ) : (
          <ExportPanel />
        )}
      </div>
    </div>
  );
}
