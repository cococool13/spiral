/**
 * Identity 02 mark — two φ strokes, path data from /brand/logo/mark-compact.svg.
 * Drawn as a stroke SVG (not a CSS mask): masks drop strokes and leave a blank.
 */
const VIEWBOX = "0 0 64 64";

const PATHS = [
  "M32.32,32.41L32.19,32.54L32.01,32.64L31.78,32.67L31.53,32.62L31.28,32.48L31.08,32.25L30.95,31.93L30.92,31.54L31.04,31.14L31.30,30.75L31.72,30.44L32.26,30.27L32.90,30.28L33.55,30.52L34.16,31.01L34.61,31.74L34.83,32.67L34.72,33.71L34.23,34.77L33.34,35.70L32.08,36.35L30.52,36.58L28.81,36.27L27.13,35.32L25.71,33.73L24.80,31.55L24.62,28.95L25.37,26.15L27.16,23.50L29.98,21.37L33.70,20.15L38.03,20.21L42.55,21.83L46.69,25.13L49.84,30.09L51.36,36.40L50.68,43.55L47.41,50.79L41.39,57.20",
  "M31.68,31.59L31.81,31.46L31.99,31.36L32.22,31.33L32.47,31.38L32.72,31.52L32.92,31.75L33.05,32.07L33.08,32.46L32.96,32.86L32.70,33.25L32.28,33.56L31.74,33.73L31.10,33.72L30.45,33.48L29.84,32.99L29.39,32.26L29.17,31.33L29.28,30.29L29.77,29.23L30.66,28.30L31.92,27.65L33.48,27.42L35.19,27.73L36.87,28.68L38.29,30.27L39.20,32.45L39.38,35.05L38.63,37.85L36.84,40.50L34.02,42.63L30.30,43.85L25.97,43.79L21.45,42.17L17.31,38.87L14.16,33.91L12.64,27.60L13.32,20.45L16.59,13.21L22.61,6.80",
] as const;

export default function Mark({
  size = 24,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox={VIEWBOX}
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <g
        stroke="currentColor"
        strokeWidth="2.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {PATHS.map((d) => (
          <path key={d.slice(0, 24)} d={d} />
        ))}
      </g>
    </svg>
  );
}
