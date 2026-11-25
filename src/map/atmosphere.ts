import L from 'leaflet';
import type { Effects } from './useHuntState';
import { createAmbientEffects } from './ambientEffects';

import { BIRD_INTERVAL_MS, fogInterior, transitionCoverage } from '../../shared/atmosphere.js';

export type AtmosphereState = { effects:Effects; period: string; transition: number | null; reducedMotion: boolean };
const clamp = (value: number, min = 0, max = 1) => Math.max(min, Math.min(max, value));
const smooth = (value: number) => { const t = clamp(value); return t * t * (3 - 2 * t); };
const seeded = (seed: number) => { let n = seed; return () => { n = (n * 1664525 + 1013904223) >>> 0; return n / 4294967296; }; };

// Low-frequency fractal density gives each fog wisp soft, irregular edges.
function fogTexture() {
  const size = 192;
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const image = ctx.createImageData(size, size);
  const random = seeded(43);
  const grids = [5, 11, 23].map(n => ({ n, data: Array.from({ length: n * n }, random) }));
  const noise = (x: number, y: number, grid: typeof grids[number]) => {
    const px = x * (grid.n - 1), py = y * (grid.n - 1), ix = Math.floor(px), iy = Math.floor(py);
    const sx = smooth(px - ix), sy = smooth(py - iy);
    const value = (dx: number, dy: number) => grid.data[Math.min(iy + dy, grid.n - 1) * grid.n + Math.min(ix + dx, grid.n - 1)];
    return (value(0, 0) * (1 - sx) + value(1, 0) * sx) * (1 - sy) + (value(0, 1) * (1 - sx) + value(1, 1) * sx) * sy;
  };
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / (size - 1), v = y / (size - 1);
    const radius = Math.hypot((u - .5) * 2, (v - .5) * 2);
    const density = noise(u, v, grids[0]) * .57 + noise(u, v, grids[1]) * .28 + noise(u, v, grids[2]) * .15;
    const alpha = Math.pow(clamp(1 - radius), 1.25) * clamp((density - .12) * 1.8);
    const index = (y * size + x) * 4;
    image.data[index] = 207; image.data[index + 1] = 214; image.data[index + 2] = 215;
    image.data[index + 3] = Math.round(alpha * 245);
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

// Light locations are atmospheric accents on the map, never editable interest pins.
const lamps = [
  [.335,.24], [.36,.295], [.42,.32], [.48,.25], [.54,.23], [.60,.19], [.66,.20], [.74,.25],
  [.81,.21], [.86,.31], [.77,.37], [.64,.39], [.55,.40], [.47,.45], [.39,.48], [.31,.47],
  [.27,.61], [.29,.71], [.35,.78], [.43,.82], [.39,.90], [.57,.84], [.65,.77], [.72,.72],
  [.80,.65], [.85,.56], [.76,.84], [.66,.92], [.58,.62], [.52,.71], [.63,.53], [.89,.40],
];
type BirdFlight = { start: number; from: L.LatLng; to: L.LatLng; count: number; seed: number };

export function mountAtmosphere(map: L.Map, readState: () => AtmosphereState, mapSize: {width:number;height:number}) {
  const pane = map.createPane('atmosphere'); pane.style.zIndex = '450'; pane.style.pointerEvents = 'none';
  const canvas = L.DomUtil.create('canvas', 'map-atmosphere', pane) as HTMLCanvasElement;
  canvas.setAttribute('aria-hidden', 'true');
  const ctx = canvas.getContext('2d')!;
  const fog = fogTexture();
  const drawEffects = createAmbientEffects();
  const random = seeded(8081200);
  const wisps = Array.from({ length: 42 }, (_, i) => ({ edge: i % 4, u: random(), phase: random() * Math.PI * 2, scale: .13 + random() * .13, speed: .045 + random() * .025 }));
  let frame = 0, last = 0, nextBird = performance.now() + BIRD_INTERVAL_MS;
  let dirty = true, lastLook = '';
  let width = 0, height = 0, ratio = 1;
  let flight: BirdFlight | null = null;
  let disposed = false;
  const project = (x: number, y: number) => map.latLngToContainerPoint([(1 - y) * mapSize.height, x * mapSize.width]);
  function resize() {
    dirty = true;
    const size = map.getSize(); ratio = Math.min(window.devicePixelRatio || 1, 1.5);
    width = size.x; height = size.y;
    canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio);
    canvas.style.width = `${width}px`; canvas.style.height = `${height}px`;
  }
  function draw(time: number) {
    if (disposed) return;
    frame = requestAnimationFrame(draw);
    if (document.hidden || time - last < 32) return;
    last = time;
    const state = readState();
    const effects=state.effects;
    const animated=effects.fog||effects.birds||effects.redGlow||effects.torchlight||effects.tvStatic||effects.fireflies||effects.embers||effects.rain||effects.snow||(effects.nightLights&&state.period==='night')||state.transition!==null;
    const look = `${state.period}:${state.reducedMotion}:${state.transition}:${JSON.stringify(effects)}`;
    if ((state.reducedMotion||!animated) && !dirty && look === lastLook) return;
    dirty = false; lastLook = look;
    const seconds = state.reducedMotion ? 0 : time / 1000;
    L.DomUtil.setPosition(canvas, map.containerPointToLayerPoint([0, 0]));
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0); ctx.clearRect(0, 0, width, height);
    const tl = project(0, 0), br = project(1, 1), w = br.x - tl.x, h = br.y - tl.y;
    if (w <= 0 || h <= 0) return;
    ctx.save(); ctx.beginPath(); ctx.rect(tl.x, tl.y, w, h); ctx.clip();

    const strength=effects.intensity/60;
    ctx.globalAlpha=effects.intensity/100;
    if (effects.dayLighting && state.period === 'afternoon') {
      const glow = ctx.createLinearGradient(tl.x, tl.y, br.x, br.y);
      glow.addColorStop(0, '#f5a13d30'); glow.addColorStop(.6, '#dd75300c'); glow.addColorStop(1, '#401d391c');
      ctx.fillStyle = glow; ctx.fillRect(tl.x, tl.y, w, h);
    }
    if (effects.nightLights && state.period === 'night') {
      lamps.forEach(([x, y], index) => {
        const p = project(x, y), r = clamp(w * .009, 5, 30);
        if (p.x < -r || p.x > width + r || p.y < -r || p.y > height + r) return;
        const pulse = .8 + Math.sin(seconds * .65 + index * 3.7) * .13;
        const light = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
        light.addColorStop(0, `rgba(255,211,133,${.43 * pulse})`); light.addColorStop(.25, `rgba(242,163,69,${.21 * pulse})`); light.addColorStop(1, 'rgba(219,126,42,0)');
        ctx.fillStyle = light; ctx.fillRect(p.x - r, p.y - r, r * 2, r * 2);
        ctx.fillStyle = `rgba(255,224,158,${.7 * pulse})`; ctx.beginPath(); ctx.arc(p.x, p.y, clamp(w * .0009, .7, 1.7), 0, Math.PI * 2); ctx.fill();
      });
    }

    drawEffects(ctx,effects,seconds,{left:tl.x,top:tl.y,width:w,height:h},project,{x:width,y:height});
    // A hard inner exclusion guarantees ambient fog cannot drift across the city.
    if(effects.fog){
    ctx.save(); ctx.beginPath(); ctx.rect(tl.x, tl.y, w, h);
    ctx.rect(tl.x + w * fogInterior.left, tl.y + h * fogInterior.top, w * fogInterior.width, h * fogInterior.height); ctx.clip('evenodd');
    ctx.globalAlpha = (state.period === 'night' ? .32 : .48)*Math.min(1.5,strength);
    wisps.forEach(wisp => {
      const drift = Math.sin(seconds * wisp.speed + wisp.phase);
      const along = wisp.u + drift * .035;
      const inward = .005 + Math.cos(seconds * wisp.speed * .7 + wisp.phase) * .018;
      const x = wisp.edge === 0 ? inward : wisp.edge === 1 ? 1 - inward : along;
      const y = wisp.edge === 2 ? inward : wisp.edge === 3 ? 1 - inward : along;
      const p = project(x, y), size = w * wisp.scale;
      if (p.x + size < 0 || p.x - size > width || p.y + size < 0 || p.y - size > height) return;
      ctx.drawImage(fog, p.x - size / 2, p.y - size * .39, size, size * .78);
    });
    ctx.restore();
    }

    if (effects.birds && !state.reducedMotion && state.transition === null) {
      if (time >= nextBird) {
        nextBird = time + BIRD_INTERVAL_MS;
        const left = Math.max(tl.x, 0), right = Math.min(br.x, width), top = Math.max(tl.y, 0), bottom = Math.min(br.y, height);
        if (right > left && bottom > top) {
          const reverse = Math.random() > .5, y = top + (bottom - top) * (.25 + Math.random() * .5);
          flight = { start: time, from: map.containerPointToLatLng([reverse ? right - 20 : left + 20, y]), to: map.containerPointToLatLng([reverse ? left + 20 : right - 20, y + (Math.random() - .5) * 120]), count: 3 + Math.floor(Math.random() * 3), seed: Math.random() * 10 };
        }
      }
      if (flight) {
        const progress = (time - flight.start) / 6200;
        if (progress > 1) flight = null;
        else {
          const a = map.latLngToContainerPoint(flight.from), b = map.latLngToContainerPoint(flight.to);
          const fade = smooth(progress * 5) * smooth((1 - progress) * 5);
          ctx.strokeStyle = state.period === 'night' ? `rgba(7,13,21,${fade * .65})` : `rgba(24,29,26,${fade * .76})`;
          ctx.lineWidth = 1.1; ctx.lineCap = 'round';
          for (let i = 0; i < flight.count; i++) {
            const x = a.x + (b.x - a.x) * progress - i * 10, y = a.y + (b.y - a.y) * progress + Math.sin(i * 2.2) * 12;
            const flap = Math.sin(seconds * 8 + i * 1.8 + flight.seed) * 2.4;
            ctx.beginPath(); ctx.moveTo(x - 3.5, y - flap); ctx.quadraticCurveTo(x - 1.4, y - 1, x, y + .6); ctx.quadraticCurveTo(x + 1.4, y - 1, x + 3.5, y - flap); ctx.stroke();
          }
        }
      }
    } else { flight = null; nextBird = time + BIRD_INTERVAL_MS; }

    if (state.transition !== null && !state.reducedMotion) {
      pane.style.zIndex = '750';
      const elapsed = time - state.transition;
      const coverage = transitionCoverage(elapsed);
      // Fully opaque before the day/period changes at 900ms.
      ctx.globalAlpha = smooth((coverage - .55) / .4);
      ctx.fillStyle = '#b4bfc2'; ctx.fillRect(tl.x, tl.y, w, h);
      ctx.globalAlpha = .85;
      const visibleLeft = Math.max(tl.x, 0), visibleRight = Math.min(br.x, width);
      const visibleTop = Math.max(tl.y, 0), visibleBottom = Math.min(br.y, height);
      const vw = visibleRight - visibleLeft, vh = visibleBottom - visibleTop;
      for (let i = 0; i < 16; i++) {
        const side = i % 2, row = Math.floor(i / 2) / 7;
        const reach = vw * coverage * .62;
        const x = side ? visibleRight - reach : visibleLeft + reach;
        const y = visibleTop + row * vh + Math.sin(i * 2 + seconds * .7) * 18;
        const size = Math.max(vw * .85, vh * .6);
        ctx.drawImage(fog, x - size / 2, y - size / 2, size, size);
      }
      ctx.globalAlpha = 1;
    } else pane.style.zIndex = '450';
    ctx.restore();
  }
  const moved = () => { dirty = true; };
  const resume = () => { if (!document.hidden) { nextBird = performance.now() + BIRD_INTERVAL_MS; flight = null; dirty = true; } };
  resize(); map.on('resize', resize); map.on('move zoom', moved); document.addEventListener('visibilitychange', resume);
  frame = requestAnimationFrame(draw);
  return () => { disposed = true; cancelAnimationFrame(frame); map.off('resize', resize); map.off('move zoom', moved); document.removeEventListener('visibilitychange', resume); canvas.remove(); pane.remove(); };
}
