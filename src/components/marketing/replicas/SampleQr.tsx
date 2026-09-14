/**
 * A static, decorative QR-code-shaped SVG for the replica screens — never a
 * real, scannable code. No `qrcode` dependency: the module grid is a fixed
 * pattern computed once at module load with a deterministic PRNG, not from
 * any real child or guardian data.
 */

const SIZE = 21;
const MODULE = 6;

function seededModules(): boolean[][] {
  let seed = 42;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return (seed / 0x7fffffff) > 0.5;
  };

  const grid: boolean[][] = Array.from({ length: SIZE }, () => Array(SIZE).fill(false));
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      grid[y][x] = rand();
    }
  }
  return grid;
}

const MODULES = seededModules();

/** True inside any of the three finder-pattern corners, which a real QR code
 * always carries and this replica draws explicitly rather than from the PRNG. */
function inFinder(x: number, y: number): boolean {
  const corners = [
    [0, 0],
    [SIZE - 7, 0],
    [0, SIZE - 7],
  ];
  return corners.some(([cx, cy]) => x >= cx && x < cx + 7 && y >= cy && y < cy + 7);
}

function Finder({ x, y }: { x: number; y: number }) {
  const s = MODULE;
  return (
    <g transform={`translate(${x * s} ${y * s})`}>
      <rect width={7 * s} height={7 * s} fill="currentColor" />
      <rect x={s} y={s} width={5 * s} height={5 * s} className="fill-white dark:fill-gray-950" />
      <rect x={2 * s} y={2 * s} width={3 * s} height={3 * s} fill="currentColor" />
    </g>
  );
}

export function SampleQr({ className = "h-full w-full text-gray-900 dark:text-white" }: { className?: string }) {
  const px = SIZE * MODULE;

  return (
    <svg viewBox={`0 0 ${px} ${px}`} role="img" aria-label="Sample QR code" className={className}>
      <rect width={px} height={px} className="fill-white dark:fill-gray-950" />
      {MODULES.map((row, y) =>
        row.map(
          (on, x) =>
            on &&
            !inFinder(x, y) && (
              <rect key={`${x}-${y}`} x={x * MODULE} y={y * MODULE} width={MODULE} height={MODULE} fill="currentColor" />
            ),
        ),
      )}
      <Finder x={0} y={0} />
      <Finder x={SIZE - 7} y={0} />
      <Finder x={0} y={SIZE - 7} />
    </svg>
  );
}
