import { useEffect, useRef, useState } from 'react';
import type { HuntState } from './useHuntState';
import { COVER_MS, TRANSITION_MS, sameMoment } from '../../shared/atmosphere.js';

// New approvals received during a transition are coalesced at the covered frame.
export default function useMapTransition(actual: HuntState | null, reducedMotion: boolean) {
  const [presented, setPresented] = useState<HuntState | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const latest = useRef(actual); latest.current = actual;
  useEffect(() => {
    if (!actual) return;
    if (!presented || reducedMotion || !actual.effects.transitionFog) { setPresented(actual); setStartedAt(null); return; }
    if (startedAt !== null) return;
    if (sameMoment(presented, actual)) { if (presented !== actual) setPresented(actual); return; }
    setStartedAt(performance.now());
  }, [actual, presented, startedAt, reducedMotion]);
  useEffect(() => {
    if (startedAt === null) return;
    const covered = window.setTimeout(() => setPresented(latest.current), COVER_MS);
    const finished = window.setTimeout(() => setStartedAt(null), TRANSITION_MS);
    return () => { clearTimeout(covered); clearTimeout(finished); };
  }, [startedAt]);
  return { presented, startedAt };
}
