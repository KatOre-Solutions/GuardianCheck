/** A small inline-SVG attendance trend line for the admin replica. Fictional, fixed values. */
const POINTS = [18, 24, 22, 31, 28, 36, 42];

export function Sparkline({ className = "text-primary" }: { className?: string }) {
  const w = 160;
  const h = 40;
  const max = Math.max(...POINTS);
  const min = Math.min(...POINTS);
  const range = max - min || 1;
  const step = w / (POINTS.length - 1);

  const path = POINTS.map((v, i) => {
    const x = i * step;
    const y = h - ((v - min) / range) * (h - 6) - 3;
    return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");

  const lastX = (POINTS.length - 1) * step;
  const lastY = h - ((POINTS[POINTS.length - 1] - min) / range) * (h - 6) - 3;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Attendance trend, rising over the last seven services" className={`w-full h-10 ${className}`}>
      <path d={path} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lastX} cy={lastY} r={3} fill="currentColor" />
    </svg>
  );
}
