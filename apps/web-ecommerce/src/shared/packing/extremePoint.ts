import { orientations, type Dimensions, type PackUnit, type Placement } from './geometry';
import { collides, fitsInside, stackLoads, supportRatio, verifyPlacements, type StackRules } from './verify';

type Point = readonly [number, number, number];

// a < b comparing element by element.
const lexLess = (a: readonly number[], b: readonly number[]) => {
  const i = a.findIndex((value, index) => value !== b[index]);
  return i >= 0 && a[i] < b[i];
};
const unitVolume = (unit: PackUnit) => unit.lengthCm * unit.widthCm * unit.heightCm;
const inside = (point: Point, p: Placement) =>
  point[0] >= p.x &&
  point[0] < p.x + p.lengthCm &&
  point[1] >= p.y &&
  point[1] < p.y + p.widthCm &&
  point[2] >= p.z &&
  point[2] < p.z + p.heightCm;

// Moves a point towards 0 along one axis until it meets the face of a placed unit (or the wall).
const project = (point: Point, axis: 0 | 1 | 2, placed: readonly Placement[]): Point => {
  const [a, b] = ([0, 1, 2] as const).filter((other) => other !== axis);
  const start = (p: Placement) => [p.x, p.y, p.z];
  const size = (p: Placement) => [p.lengthCm, p.widthCm, p.heightCm];
  let stop = 0;
  for (const p of placed) {
    const s = start(p),
      d = size(p);
    const end = s[axis] + d[axis];
    if (end > point[axis]) continue;
    if (point[a] >= s[a] && point[a] < s[a] + d[a] && point[b] >= s[b] && point[b] < s[b] + d[b])
      stop = Math.max(stop, end);
  }
  const next = [...point] as [number, number, number];
  next[axis] = stop;
  return next;
};

// The extreme points a newly placed unit creates (Crainic, Perboli & Tadei 2008): its three far corners, each also
// projected back along the other two axes onto the nearest face, so the next unit is pushed into corners.
const newPoints = (p: Placement, placed: readonly Placement[]): Point[] => {
  const corners: Point[] = [
    [p.x + p.lengthCm, p.y, p.z],
    [p.x, p.y + p.widthCm, p.z],
    [p.x, p.y, p.z + p.heightCm],
  ];
  const points: Point[] = [];
  corners.forEach((corner, axis) => {
    points.push(corner);
    for (const other of [0, 1, 2] as const) if (other !== axis) points.push(project(corner, other, placed));
  });
  return points;
};

// Packs units into one carton's usable space with the Extreme-Point heuristic, or returns null when they do not fit.
// Units go largest first; each takes the extreme point and allowed orientation that keeps the packed block smallest
// (then lowest, then furthest back), as long as it fits, overlaps nothing, is supported and crushes no fragile unit.
// Deterministic for the same input. The result is verified before it is returned.
export function packCarton(units: readonly PackUnit[], space: Dimensions, rules: StackRules): Placement[] | null {
  const order = [...units].sort(
    (a, b) =>
      unitVolume(b) - unitVolume(a) ||
      Math.max(b.lengthCm, b.widthCm, b.heightCm) - Math.max(a.lengthCm, a.widthCm, a.heightCm) ||
      a.key.localeCompare(b.key),
  );
  const weights = new Map(units.map((unit) => [unit.key, unit.weightGram]));
  const fragile = new Set(units.filter((unit) => unit.fragile).map((unit) => unit.key));
  const placed: Placement[] = [];
  let points: Point[] = [[0, 0, 0]];
  for (const unit of order) {
    let best: { placement: Placement; merit: number[] } | null = null;
    for (const point of points)
      for (const [lengthCm, widthCm, heightCm] of orientations(unit)) {
        const placement: Placement = {
          key: unit.key,
          x: point[0],
          y: point[1],
          z: point[2],
          lengthCm,
          widthCm,
          heightCm,
        };
        if (!fitsInside(placement, space) || collides(placement, placed)) continue;
        if (supportRatio(placement, placed) < rules.minSupportRatio) continue;
        const next = [...placed, placement];
        if (placement.z > 0) {
          const loads = stackLoads(next, weights);
          if ([...fragile].some((key) => (loads.get(key) ?? 0) > rules.maxStackLoadGram)) continue;
        }
        const extent = (axis: 'x' | 'y' | 'z', size: 'lengthCm' | 'widthCm' | 'heightCm') =>
          Math.max(...next.map((p) => p[axis] + p[size]));
        const merit = [
          extent('x', 'lengthCm') * extent('y', 'widthCm') * extent('z', 'heightCm'),
          placement.z + heightCm,
          placement.y,
          placement.x,
        ];
        if (!best || lexLess(merit, best.merit)) best = { placement, merit };
      }
    if (!best) return null;
    placed.push(best.placement);
    const seen = new Set<string>();
    points = [...points, ...newPoints(best.placement, placed)].filter((point) => {
      const key = point.join(',');
      if (seen.has(key) || placed.some((p) => inside(point, p))) return false;
      seen.add(key);
      return point[0] < space[0] && point[1] < space[1] && point[2] < space[2];
    });
  }
  return verifyPlacements(placed, units, space, rules) === null ? placed : null;
}
