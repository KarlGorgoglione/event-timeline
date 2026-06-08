import type { ReactNode } from 'react';

/**
 * A collapsible group of fields. Built on native `<details>/<summary>` so the
 * open/closed state, keyboard support, and accessibility come for free with
 * zero JS — the chevron is rotated purely in CSS via `details[open]`.
 */
export interface SectionProps {
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
}

export function Section({
  title,
  defaultOpen = false,
  children,
}: SectionProps) {
  return (
    <details className="etd-section" open={defaultOpen}>
      <summary className="etd-section__summary">
        <span className="etd-section__chevron" aria-hidden>
          ▸
        </span>
        {title}
      </summary>
      <div className="etd-section__body">{children}</div>
    </details>
  );
}
