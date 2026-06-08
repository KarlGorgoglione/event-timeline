import type { DemoConfig } from '../config';
import type { Bind } from '../useDemoConfig';

/** Shared props for every section view: the current config + the path binder. */
export interface SectionViewProps {
  config: DemoConfig;
  bind: Bind;
}
