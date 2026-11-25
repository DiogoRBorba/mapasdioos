export const COVER_MS = 900;
export const TRANSITION_MS = 2400;
export const BIRD_INTERVAL_MS = 15000;
export const fogInterior = { left: .13, top: .105, width: .74, height: .79 };
export const sameMoment = (a, b) => a.day === b.day && a.period === b.period && (a.header?.dateText||'') === (b.header?.dateText||'');
const smooth = value => { const t = Math.max(0, Math.min(1, value)); return t * t * (3 - 2 * t); };
export function transitionCoverage(elapsed) {
  return elapsed < COVER_MS ? smooth(elapsed / 780) : elapsed < 1150 ? 1 : 1 - smooth((elapsed - 1150) / (TRANSITION_MS - 1150));
}
