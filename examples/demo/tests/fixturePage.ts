import { expect, type Page } from '@playwright/test';
import type { E2EApi } from '../src/e2e';

// The e2e fixture page (src/e2e.tsx): specs set it up by URL and drive it
// through `window.__e2e` (in `page.evaluate`), never through the demo's
// panel, so reworking the demo can't break them (audit T-10).

declare global {
  interface Window {
    __e2e?: E2EApi;
  }
}

export interface FixtureParams {
  renderer?: 'auto' | 'canvas2d' | 'webgl';
  dataset?: 'default' | 'aml' | 'synthetic10k' | 'synthetic50k';
}

/** Open the fixture page and wait until the timeline and its API are up. */
export async function openFixture(
  page: Page,
  { renderer = 'canvas2d', dataset = 'default' }: FixtureParams = {},
): Promise<void> {
  await page.goto(`/e2e.html?renderer=${renderer}&dataset=${dataset}`);
  await expect(page.getByTestId('timeline-root')).toBeVisible();
  await page.waitForFunction(() => window.__e2e !== undefined);
}
