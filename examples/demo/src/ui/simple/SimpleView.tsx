import { useDemo } from '../../app/context';
import { Card } from '../shared/Card';
import { SelectionCard } from '../shared/SelectionCard';
import { ScenarioPanel } from '../panels/ScenarioPanel';
import { Legend } from './Legend';
import { ThemeGallery } from './ThemeGallery';
import { QuickControls } from './QuickControls';
import { ArrowRight, Sparkle } from '../icons';

export function SimpleView() {
  const { scenario, dispatch } = useDemo();
  return (
    <div className="inspector__body">
      <Card eyebrow={scenario.tagline} title={scenario.title} className="story">
        <p className="story__summary">{scenario.summary}</p>
        <h3 className="subhead">
          <Sparkle size={13} /> Try this
        </h3>
        <ul className="story__try">
          {scenario.tryThis.map((tip) => (
            <li key={tip}>{tip}</li>
          ))}
        </ul>
      </Card>
      <ScenarioPanel />
      <SelectionCard />
      <Legend />
      <ThemeGallery />
      <QuickControls />
      <button
        type="button"
        className="btn btn--ghost btn--block"
        onClick={() => dispatch({ type: 'view', view: 'advanced' })}
      >
        Every theme key and option in Advanced <ArrowRight size={14} />
      </button>
    </div>
  );
}
