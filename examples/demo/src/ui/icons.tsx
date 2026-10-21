// Stroke icons (16 px, currentColor), drawn for the demo so it needs no icon
// library.

import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Icon({ size = 16, children, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const ZoomIn = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="7" cy="7" r="4.5" />
    <path d="M10.5 10.5 14 14M5 7h4M7 5v4" />
  </Icon>
);
export const ZoomOut = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="7" cy="7" r="4.5" />
    <path d="M10.5 10.5 14 14M5 7h4" />
  </Icon>
);
export const Fit = (p: IconProps) => (
  <Icon {...p}>
    <path d="M2 5.5V2h3.5M10.5 2H14v3.5M14 10.5V14h-3.5M5.5 14H2v-3.5" />
  </Icon>
);
export const Clear = (p: IconProps) => (
  <Icon {...p}>
    <path d="m4 4 8 8M12 4l-8 8" />
  </Icon>
);
export const Expand = (p: IconProps) => (
  <Icon {...p}>
    <path d="M9.5 2H14v4.5M6.5 14H2V9.5M14 2 9 7M2 14l5-5" />
  </Icon>
);
export const Shrink = (p: IconProps) => (
  <Icon {...p}>
    <path d="M13.5 7H9V2.5M2.5 9H7v4.5M9 7l5-5M7 9l-5 5" />
  </Icon>
);
export const Search = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="7" cy="7" r="4.5" />
    <path d="M10.5 10.5 14 14" />
  </Icon>
);
export const Keyboard = (p: IconProps) => (
  <Icon {...p}>
    <rect x="1.5" y="3.5" width="13" height="9" rx="1.5" />
    <path d="M4 6.5h.01M6.5 6.5h.01M9 6.5h.01M11.5 6.5h.01M5 9.5h6" />
  </Icon>
);
export const Book = (p: IconProps) => (
  <Icon {...p}>
    <path d="M2.5 3a1 1 0 0 1 1-1H7a1 1 0 0 1 1 1v11a1.5 1.5 0 0 0-1.5-1.5h-4zM13.5 3a1 1 0 0 0-1-1H9a1 1 0 0 0-1 1v11a1.5 1.5 0 0 1 1.5-1.5h4z" />
  </Icon>
);
export const GitHub = (p: IconProps) => (
  <Icon {...p} strokeWidth={0} fill="currentColor">
    <path d="M8 .5a7.5 7.5 0 0 0-2.37 14.62c.37.07.5-.16.5-.36v-1.27c-2.08.45-2.52-1-2.52-1-.34-.87-.83-1.1-.83-1.1-.68-.46.05-.45.05-.45.75.05 1.15.77 1.15.77.67 1.14 1.75.81 2.18.62.07-.48.26-.81.47-1-1.66-.19-3.41-.83-3.41-3.7 0-.82.29-1.49.77-2.01-.08-.19-.33-.95.07-1.98 0 0 .63-.2 2.06.77a7.1 7.1 0 0 1 3.75 0c1.43-.97 2.06-.77 2.06-.77.4 1.03.15 1.79.07 1.98.48.52.77 1.19.77 2.01 0 2.88-1.76 3.51-3.43 3.7.27.23.51.69.51 1.39v2.06c0 .2.13.44.51.36A7.5 7.5 0 0 0 8 .5Z" />
  </Icon>
);
export const Package = (p: IconProps) => (
  <Icon {...p}>
    <path d="M8 1.5 14 4.75v6.5L8 14.5 2 11.25v-6.5zM2 4.75 8 8l6-3.25M8 8v6.5" />
  </Icon>
);
export const Sliders = (p: IconProps) => (
  <Icon {...p}>
    <path d="M2 4h7M12 4h2M2 12h2M7 12h7M2 8h3M8 8h6" />
    <circle cx="10.5" cy="4" r="1.5" />
    <circle cx="5.5" cy="12" r="1.5" />
    <circle cx="6.5" cy="8" r="1.5" />
  </Icon>
);
export const Reset = (p: IconProps) => (
  <Icon {...p}>
    <path d="M2.5 8a5.5 5.5 0 1 0 1.6-3.9L2.5 5.7M2.5 2.5v3.2h3.2" />
  </Icon>
);
export const Copy = (p: IconProps) => (
  <Icon {...p}>
    <rect x="5" y="5" width="9" height="9" rx="1.5" />
    <path d="M11 5V3.5A1.5 1.5 0 0 0 9.5 2h-6A1.5 1.5 0 0 0 2 3.5v6A1.5 1.5 0 0 0 3.5 11H5" />
  </Icon>
);
export const Check = (p: IconProps) => (
  <Icon {...p}>
    <path d="m3 8.5 3 3 7-7" />
  </Icon>
);
export const Link = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6.5 9.5a3 3 0 0 0 4.24 0l2.5-2.5a3 3 0 0 0-4.24-4.24L8 3.75M9.5 6.5a3 3 0 0 0-4.24 0l-2.5 2.5a3 3 0 0 0 4.24 4.24l1-1" />
  </Icon>
);
export const Play = (p: IconProps) => (
  <Icon {...p} fill="currentColor">
    <path d="M4.5 2.75v10.5L13 8z" />
  </Icon>
);
export const Pause = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 3v10M11 3v10" strokeWidth={2.5} />
  </Icon>
);
export const Target = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="8" cy="8" r="5.5" />
    <circle cx="8" cy="8" r="2" />
  </Icon>
);
export const ArrowRight = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 8h10M9 4l4 4-4 4" />
  </Icon>
);
export const Close = Clear;
export const Panel = (p: IconProps) => (
  <Icon {...p}>
    <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" />
    <path d="M10 2.5v11" />
  </Icon>
);
export const Trash = (p: IconProps) => (
  <Icon {...p}>
    <path d="M2.5 4h11M6 4V2.5h4V4M4 4l.7 9.5h6.6L12 4" />
  </Icon>
);
export const Plus = (p: IconProps) => (
  <Icon {...p}>
    <path d="M8 3v10M3 8h10" />
  </Icon>
);
export const Sparkle = (p: IconProps) => (
  <Icon {...p}>
    <path d="M8 1.5 9.4 6.6 14.5 8 9.4 9.4 8 14.5 6.6 9.4 1.5 8l5.1-1.4z" />
  </Icon>
);

/** The event-timeline mark: three lanes and an arrow between them. */
export function Logo({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <rect width="24" height="24" rx="6" fill="var(--accent)" />
      <g stroke="var(--accent-ink)" strokeWidth="1.8" strokeLinecap="round">
        <path d="M5 7h14M5 12h6M5 17h14" opacity="0.55" />
        <path d="M14.5 7v8" />
      </g>
      <circle cx="14.5" cy="7" r="1.8" fill="var(--accent-ink)" />
      <path d="M11.8 14.2h5.4L14.5 18z" fill="var(--accent-ink)" />
    </svg>
  );
}
