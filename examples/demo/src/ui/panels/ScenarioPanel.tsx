import { useDemo } from '../../app/context';
import { TourSpotlights } from './TourSpotlights';
import { PatternTour } from './PatternTour';
import { IncidentMilestones } from './IncidentMilestones';
import { LogisticsRegions } from './LogisticsRegions';
import { LiveControls } from './LiveControls';
import { ScaleControls } from './ScaleControls';
import { DataEditor } from './DataEditor';

/** The interactive card that belongs to the current scenario. */
export function ScenarioPanel() {
  const { scenario } = useDemo();
  switch (scenario.id) {
    case 'tour':
      return <TourSpotlights />;
    case 'aml':
      return <PatternTour />;
    case 'incident':
      return <IncidentMilestones />;
    case 'logistics':
      return <LogisticsRegions />;
    case 'live':
      return <LiveControls />;
    case 'scale':
      return <ScaleControls />;
    case 'playground':
      return <DataEditor />;
  }
}
