import { campaignApi } from '../CampaignContext';
import { useCallback, useEffect, useRef, useState } from 'react';

export type Effects = { fog:boolean; birds:boolean; rain:boolean; snow:boolean; dayLighting:boolean; nightLights:boolean; redGlow:boolean; torchlight:boolean; embers:boolean; fireflies:boolean; tvStatic:boolean; transitionFog:boolean; intensity:number };
export type MapHeader = {label:string;dayLabel:string;dateText:string};
export type HuntState = { day: number; period: string; revision: number; updatedAt: string | null; effects:Effects; header:MapHeader };
export type MapStatePatch = {revision:number;day?:number;period?:string;effects?:Effects;header?:MapHeader};

export default function useHuntState(onExpired: () => void, campaignId: string) {
  const [state, setState] = useState<HuntState | null>(null);
  const [syncError, setSyncError] = useState('');
  const [publishing, setPublishing] = useState(false);
  const expired = useRef(onExpired); expired.current = onExpired;
  const current = useRef<HuntState | null>(null);
  const reading = useRef<AbortController | null>(null);
  const writing = useRef<AbortController | null>(null);
  const accept = useCallback((next: HuntState) => {
    // A slow read must never replace a newer, approved version.
    if (!current.current || next.revision > current.current.revision) {
      current.current = next;
      setState(next);
    }
    setSyncError('');
  }, []);
  const refresh = useCallback(async () => {
    if (reading.current || writing.current) return false;
    const controller = new AbortController(); reading.current = controller;
    try {
      const response = await fetch(campaignApi('/api/map-state',campaignId), { signal: controller.signal, cache: 'no-store' });
      if (response.status === 401) { expired.current(); return false; }
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      if (!controller.signal.aborted) { accept(data.state); return true; }
      return false;
    } catch (error) {
      if (!controller.signal.aborted) setSyncError(error instanceof Error && !(error instanceof TypeError) ? error.message : 'Sem conexão. O período exibido pode estar desatualizado.');
      return false;
    } finally { if (reading.current === controller) reading.current = null; }
  }, [accept,campaignId]);
  useEffect(() => {
    void refresh();
    return () => {
      reading.current?.abort(); reading.current = null;
      writing.current?.abort(); writing.current = null;
    };
  }, [refresh]);
  const publish = async (draft: MapStatePatch) => {
    if (writing.current) return false;
    const controller = new AbortController(); writing.current = controller;
    reading.current?.abort(); reading.current = null;
    setPublishing(true);
    try {
      const response = await fetch(campaignApi('/api/map-state',campaignId), { method: 'PATCH', signal: controller.signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(draft) });
      if (response.status === 401) { expired.current(); return false; }
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      if (controller.signal.aborted) return false;
      accept(data.state);
      return true;
    } finally {
      if (writing.current === controller) { writing.current = null; setPublishing(false); }
    }
  };
  return { state, syncError, publishing, publish, refresh };
}
