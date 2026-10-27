/** Line icons drawn for the glass toolbar: 24px grid, 1.5 stroke, round caps. */
const PATHS = {
  lock: (
    <>
      <rect x="4.5" y="10.5" width="15" height="10" rx="2.2" />
      <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
    </>
  ),
  tag: (
    <>
      <path d="M3.5 12.4V4.6a1.1 1.1 0 0 1 1.1-1.1h7.8l8.2 8.2a1.1 1.1 0 0 1 0 1.5l-7.2 7.2a1.1 1.1 0 0 1-1.5 0z" />
      <circle cx="8.2" cy="8.2" r="1.3" />
    </>
  ),
  image: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2.6" />
      <circle cx="9" cy="10" r="1.6" />
      <path d="m4 17.5 5-4.6 3.6 3.2 3-2.6 4.4 4" />
    </>
  ),
  doc: (
    <>
      <path d="M6.5 3.5h7.6l4.4 4.4v11.6a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1v-15a1 1 0 0 1 1-1z" />
      <path d="M14 3.7V8h4.3M8.6 12.6h6.8M8.6 16h6.8" />
    </>
  ),
  plus: <path d="M12 4.5v15M4.5 12h15" />,
  down: <path d="M12 4.5v11M7 11l5 5 5-5M5 19.5h14" />,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
} as const;

export type IconName = keyof typeof PATHS;

export default function Icon({ name }: { name: IconName }) {
  return (
    <svg className="ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {PATHS[name]}
    </svg>
  );
}
