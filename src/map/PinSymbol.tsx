import type { CSSProperties } from 'react';
import type { Pin } from './types';
import { customSymbols } from '../../shared/custom-symbols.js';

const paths: Record<string, string[]> = {
  pin: ['M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z', 'M15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z'],
  landmark: ['m3 9 9-6 9 6Z', 'M4 21h16M5 12v6m7-6v6m7-6v6'],
  target: ['M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z', 'M17 12a5 5 0 1 1-10 0 5 5 0 0 1 10 0Z', 'M12 10v4m-2-2h4'],
  book: ['M12 7C9 4 5 4 2 5v15c3-1 7-1 10 2 3-3 7-3 10-2V5c-3-1-7-1-10 2Zm0 0v15'],
  users: ['M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z', 'M4 21v-2a8 6 0 0 1 16 0v2', 'M2 8a3 3 0 0 1 2 5m18-5a3 3 0 0 0-2 5'],
  skull: ['M8 21v-4a8 8 0 1 1 8 0v4Zm4-4v4', 'M9 10a1 1 0 1 1-2 0 1 1 0 0 1 2 0Zm8 0a1 1 0 1 1-2 0 1 1 0 0 1 2 0ZM12 13l-1 2h2Z'],
  flag: ['M4 22V3c5-4 10 4 16 0v12c-6 4-11-4-16 0'],
  key: ['M14 8a5 5 0 1 1-4-5 5 5 0 0 1 4 5Z', 'm11 12 10 10m-3-3 3-3m-6 0 3-3'],
};
export function SymbolIcon({ name, size = 18 }: { name: string; size?: number }) {
  const custom=customSymbols.find(symbol=>symbol.id===name);
  if(custom)return <img className="custom-pin-symbol" src={custom.src} width={size+8} height={size+8} alt="" aria-hidden="true"/>;
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{(paths[name] || paths.pin).map((d, index) => <path d={d} key={index}/>)}</svg>;
}
export function PinPreview({ pin }: { pin: Pick<Pin, 'shape' | 'color' | 'icon'> }) {
  return <span className={`map-pin pin-${pin.shape}`} style={{ '--pin-color': pin.color } as CSSProperties}><span className="pin-symbol"><SymbolIcon name={pin.icon}/></span></span>;
}
export function pinElement(pin: Pick<Pin, 'shape' | 'color' | 'icon'>, selected = false) {
  const element = document.createElement('span');
  element.className = `map-pin pin-${pin.shape}${selected ? ' pin-selected' : ''}`;
  element.style.setProperty('--pin-color', pin.color);
  const inner = document.createElement('span'); inner.className = 'pin-symbol';
  const custom=customSymbols.find(symbol=>symbol.id===pin.icon);
  if(custom){const image=document.createElement('img');image.src=custom.src;image.alt='';image.width=26;image.height=26;image.className='custom-pin-symbol';inner.appendChild(image);element.appendChild(inner);return element;}
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  for (const [name, value] of Object.entries({ width: '18', height: '18', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.6', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' })) svg.setAttribute(name, value);
  for (const d of paths[pin.icon] || paths.pin) { const path = document.createElementNS('http://www.w3.org/2000/svg', 'path'); path.setAttribute('d', d); svg.appendChild(path); }
  inner.appendChild(svg); element.appendChild(inner); return element;
}
