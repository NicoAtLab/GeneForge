import type { CSSProperties } from 'react';

type IconProps = { name: string; size?: number; className?: string; style?: CSSProperties };

const paths: Record<string, React.ReactNode> = {
  gel: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M7 7h2m3 2h2m3-2h1M7 12h2m3 3h2m3-3h1M7 17h2" />
    </>
  ),
  spark: (
    <>
      <path d="m12 3 2.8 6.2L21 12l-6.2 2.8L12 21l-2.8-6.2L3 12l6.2-2.8Z" />
      <path d="M20 2v4m-2-2h4" />
    </>
  ),
  dashboard: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </>
  ),
  folder: <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />,
  dna: (
    <>
      <path d="M7 3c0 9 10 9 10 18M17 3C17 12 7 12 7 21" />
      <path d="M8 6h8M9 9h6M9 15h6M8 18h8" />
    </>
  ),
  flask: (
    <>
      <path d="M9 3h6M10 3v6l-6 10a1.3 1.3 0 0 0 1.1 2h13.8a1.3 1.3 0 0 0 1.1-2L14 9V3M7.5 15h9" />
      <path d="M10 18h.01M14 17h.01" />
    </>
  ),
  library: (
    <>
      <path d="M4 4v16M8 4v16M12 4v16M16 4l4 16" />
      <path d="M3 7h6M3 17h6M11 7h2M11 17h2M16.7 7l2-.5" />
    </>
  ),
  settings: (
    <>
      <path d="m9.5 3-.7 2.2-2 .9-2.1-.5-2.1 3.6 1.5 1.7v2.3l-1.5 1.6 2.1 3.7 2.2-.5 1.9 1 .7 2h4.2l.7-2 2-1 2.1.5 2.1-3.7-1.5-1.6v-2.3l1.5-1.7-2.1-3.6-2.1.5-2-.9-.7-2.2Z" />
      <circle cx="11.6" cy="12" r="3" />
    </>
  ),
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m16 16 5 5" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  'arrow-right': <path d="M4 12h16m-6-6 6 6-6 6" />,
  'arrow-left': <path d="M20 12H4m6-6-6 6 6 6" />,
  'chevron-right': <path d="m9 5 7 7-7 7" />,
  'chevron-down': <path d="m5 9 7 7 7-7" />,
  upload: (
    <>
      <path d="M12 16V3m-5 5 5-5 5 5M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" />
    </>
  ),
  download: (
    <>
      <path d="M12 3v13m-5-5 5 5 5-5M4 17v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  star: <path d="m12 3 2.8 5.8 6.4.9-4.6 4.5 1.1 6.4-5.7-3-5.7 3 1.1-6.4-4.6-4.5 6.4-.9Z" />,
  more: (
    <>
      <circle cx="5" cy="12" r="1" />
      <circle cx="12" cy="12" r="1" />
      <circle cx="19" cy="12" r="1" />
    </>
  ),
  check: <path d="m5 12 4 4L19 6" />,
  x: <path d="m6 6 12 12M18 6 6 18" />,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  menu: <path d="M4 6h16M4 12h16M4 18h16" />,
  copy: (
    <>
      <rect x="8" y="8" width="12" height="13" rx="2" />
      <path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" />
    </>
  ),
  save: (
    <>
      <path d="M20 21H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h13l4 4v13a1 1 0 0 1-1 1Z" />
      <path d="M7 3v6h10V3M7 21v-8h10v8" />
    </>
  ),
  undo: (
    <>
      <path d="M3 10h10a7 7 0 0 1 7 7v2M3 10l5-5m-5 5 5 5" />
    </>
  ),
  redo: (
    <>
      <path d="M21 10H11a7 7 0 0 0-7 7v2M21 10l-5-5m5 5-5 5" />
    </>
  ),
  trash: (
    <>
      <path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7" />
    </>
  ),
  edit: (
    <>
      <path d="m16 3 5 5-12 12-6 1 1-6Z M13 6l5 5" />
    </>
  ),
  archive: (
    <>
      <rect x="3" y="3" width="18" height="5" rx="1" />
      <path d="M5 8v13h14V8M10 12h4" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2m-3-9-1.5 1.5M6.5 17.5 5 19M5 5l1.5 1.5m11 11L19 19" />
    </>
  ),
  moon: <path d="M20.9 13a9 9 0 0 1-9.9-9.9A9 9 0 1 0 20.9 13Z" />,
  monitor: (
    <>
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3 3 7v5c0 5 9 10 9 10s9-5 9-10V7Z" />
      <path d="m8 12 3 3 5-6" />
    </>
  ),
  file: (
    <>
      <path d="M14 2H5a1 1 0 0 0-1 1v18a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V8ZM14 2v6h6M8 13h8M8 17h6" />
    </>
  ),
  external: (
    <>
      <path d="M14 3h7v7m0-7L10 14M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5" />
    </>
  ),
  filter: <path d="M3 4h18l-7 8v7l-4 2v-9Z" />,
  refresh: (
    <>
      <path d="M20 10a8 8 0 0 0-13.6-5.6L3 8m0-5v5h5M4 14a8 8 0 0 0 13.6 5.6L21 16m0 5v-5h-5" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v6M12 7h.01" />
    </>
  ),
};

export function Icon({ name, size = 20, className = '', style }: IconProps) {
  return (
    <svg
      className={`icon ${className}`}
      style={style}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name] ?? paths.file}
    </svg>
  );
}

export default Icon;
