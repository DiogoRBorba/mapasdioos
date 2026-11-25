import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Campaign } from '../campaigns';
import { campaignApi } from '../CampaignContext';
import { campaignName } from '../../shared/campaigns.js';
import { pinElement } from './PinSymbol';
import type { MapControls, Pin, Point } from './types';
import { mountAtmosphere } from './atmosphere';
import type { Effects } from './useHuntState';

type Props = { mapId: string; campaign: Campaign; pins: Pin[]; selectedId?: string; draft: Pin | null; placing: boolean; drawing: Point[] | null; onVertex:(point:Point)=>void; onFinish:()=>void; effects: Effects; period: string; transition: number | null; reducedMotion: boolean; quality: 'original' | 'restored'; onPick: (point: Point) => void; onSelect: (id: string) => void; onReady: (controls: MapControls | null) => void; onZoom: (zoom: number) => void };

export default function MapCanvas(props: Props) {
  const mapSize = props.campaign.map!;
  const bounds = L.latLngBounds([0, 0], [mapSize.height,mapSize.width]);
  const pointToLatLng = (pin:Point): L.LatLngExpression => [(1-pin.y)*mapSize.height,pin.x*mapSize.width];
  const host = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const imageRef = useRef<L.ImageOverlay | null>(null);
  const qualityRef = useRef(props.quality);
  const propsRef = useRef(props); propsRef.current = props;
  const [imageState, setImageState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (!host.current) return;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const map = L.map(host.current, { crs: L.CRS.Simple, minZoom: -4, maxZoom: 3, zoomSnap: .25, zoomDelta: .5, zoomControl: false, attributionControl: false, maxBounds: bounds.pad(.35), maxBoundsViscosity: .8, wheelPxPerZoomLevel: 90, zoomAnimation: !reduceMotion, fadeAnimation: !reduceMotion });
    mapRef.current = map; layerRef.current = L.layerGroup().addTo(map);
    map.fitBounds(bounds, { padding: [24, 24], animate: false });
    const minimum = () => Math.min(map.getBoundsZoom(bounds, false, L.point(40, 40)) - .5, 0);
    map.setMinZoom(minimum());
    setImageState('loading');
    qualityRef.current = propsRef.current.quality;
    const image = L.imageOverlay(campaignApi(`/api/map-image?quality=${qualityRef.current}&revision=${reload}&map=${props.mapId}`,props.campaign.id), bounds, { alt: `Mapa de ${campaignName(props.campaign)}`, className: 'campaign-map-image', interactive: false });
    imageRef.current = image;
    image.on('load', () => setImageState('ready'));
    image.on('error', () => setImageState('error'));
    image.addTo(map);
    const stopAtmosphere = mountAtmosphere(map, () => ({ effects: propsRef.current.effects, period: propsRef.current.period, transition: propsRef.current.transition, reducedMotion: propsRef.current.reducedMotion }), mapSize);
    const controls: MapControls = {
      zoomIn: () => map.zoomIn(.5), zoomOut: () => map.zoomOut(.5),
      fit: () => map.fitBounds(bounds, { padding: [24, 24], animate: !reduceMotion }),
      focus: pin => pin.vertices?.length ? map.fitBounds(L.latLngBounds(pin.vertices.map(point=>L.latLng(pointToLatLng(point) as [number,number]))),{padding:[65,65],maxZoom:1.5,animate:!reduceMotion}) : map.setView(pointToLatLng(pin), Math.max(map.getZoom(), .5), { animate: !reduceMotion }),
    };
    propsRef.current.onReady(controls);
    const publishZoom = () => propsRef.current.onZoom(Math.round(100 * 2 ** map.getZoom()));
    map.on('zoomend', publishZoom); publishZoom();
    map.on('click', (event: L.LeafletMouseEvent) => {
      const current=propsRef.current;
      if(current.drawing!==null) {
        if(!bounds.contains(event.latlng))return;
        const first=current.drawing[0];
        if(first && map.latLngToContainerPoint(event.latlng).distanceTo(map.latLngToContainerPoint(pointToLatLng(first)))<=14){current.onFinish();return;}
        current.onVertex({x:event.latlng.lng/mapSize.width,y:1-event.latlng.lat/mapSize.height});return;
      }
      if (!propsRef.current.placing || !bounds.contains(event.latlng)) return;
      propsRef.current.onPick({ x: event.latlng.lng / mapSize.width, y: 1 - event.latlng.lat / mapSize.height });
    });
    const resize = new ResizeObserver(() => { map.invalidateSize({ pan: false }); map.setMinZoom(minimum()); });
    resize.observe(host.current);
    return () => { resize.disconnect(); stopAtmosphere(); propsRef.current.onReady(null); map.remove(); mapRef.current = null; layerRef.current = null; imageRef.current = null; };
  }, [reload]);

  useEffect(() => {
    if (imageRef.current && qualityRef.current !== props.quality) {
      qualityRef.current = props.quality; setImageState('loading');
      imageRef.current.setUrl(campaignApi(`/api/map-image?quality=${props.quality}&revision=${reload}&map=${props.mapId}`,props.campaign.id));
    }
  }, [props.quality, reload]);

  useEffect(()=>{
    const map=mapRef.current;if(!map||props.drawing===null)return;
    const points=props.drawing,group=L.layerGroup().addTo(map),color=props.draft?.color||'#7fabc0';
    const latlngs=points.map(pointToLatLng);
    if(points.length>=3)L.polygon(latlngs,{color,weight:0,fillOpacity:.07,interactive:false}).addTo(group);
    if(points.length>=2)L.polyline(latlngs,{color,weight:2.5,interactive:false}).addTo(group);
    points.forEach((point,index)=>{
      if(index===0){
        const button=document.createElement('button');button.type='button';button.className='territory-start';button.setAttribute('aria-label','Fechar território no ponto inicial');button.title='Clique para fechar o território';
        const marker=L.marker(pointToLatLng(point),{icon:L.divIcon({html:button,className:'territory-start-marker',iconSize:[28,28],iconAnchor:[14,14]}),keyboard:false,zIndexOffset:2000,bubblingMouseEvents:false}).addTo(group);
        marker.on('click',()=>propsRef.current.onFinish());
      }else L.circleMarker(pointToLatLng(point),{radius:4,color,fillColor:'#e7e1ce',fillOpacity:1,weight:2,interactive:false}).addTo(group);
    });
    const guide=L.polyline([],{color,weight:2,dashArray:'6 6',interactive:false}).addTo(group);
    const move=(event:L.LeafletMouseEvent)=>{
      if(!points.length||!bounds.contains(event.latlng)){guide.setLatLngs([]);return;}
      const first=pointToLatLng(points[0]);const near=map.latLngToContainerPoint(event.latlng).distanceTo(map.latLngToContainerPoint(first))<=14;
      guide.setLatLngs([pointToLatLng(points.at(-1)!),near?first:event.latlng]);
    };
    const hide=()=>guide.setLatLngs([]);
    const doubleClick=map.doubleClickZoom.enabled();map.doubleClickZoom.disable();map.on('mousemove',move);map.on('mouseout movestart zoomstart',hide);
    return()=>{map.off('mousemove',move);map.off('mouseout movestart zoomstart',hide);map.removeLayer(group);if(doubleClick)map.doubleClickZoom.enable();};
  },[props.drawing,props.draft?.color,reload]);

  useEffect(() => {
    const layer = layerRef.current; if (!layer) return;
    layer.clearLayers();
    const pins = props.draft ? [...props.pins.filter(pin => pin.id !== props.draft!.id), props.draft] : props.pins;
    pins.forEach(pin => {
      const isDraft = pin.id === props.draft?.id;
      const active=isDraft||props.selectedId===pin.id;
      if(pin.vertices?.length){
        const polygon=L.polygon(pin.vertices.map(pointToLatLng),{color:pin.color,weight:active?3:2,fillColor:pin.color,fillOpacity:active ? 0.2 : 0.1,bubblingMouseEvents:false,className:pin.targetMapId?'atlas-territory atlas-map-page':'atlas-territory'});
        const label=document.createElement('span');label.textContent=pin.targetMapId?`${pin.title||'Nova página'} · Abrir mapa`:pin.title||'Novo território';polygon.bindTooltip(label,{sticky:true,className:'atlas-tooltip'});
        polygon.on('click',(event:L.LeafletMouseEvent)=>{
          const current=propsRef.current;
          if(current.drawing!==null){mapRef.current?.fire('click',event);return;}
          if(current.placing){current.onPick({x:event.latlng.lng/mapSize.width,y:1-event.latlng.lat/mapSize.height});return;}
          if(!isDraft)current.onSelect(pin.id);
        });polygon.addTo(layer);
      }
      const marker = L.marker(pointToLatLng(pin), { title: pin.title || 'Posição do novo pin', alt: pin.title || 'Posição do novo pin', keyboard: true, icon: L.divIcon({ html: pinElement(pin, isDraft || props.selectedId === pin.id), className: `atlas-marker${isDraft ? ' draft-marker' : ''}`, iconSize: [36, 42], iconAnchor: pin.shape === 'marker' ? [18, 38] : [18, 18] }), zIndexOffset: isDraft || props.selectedId === pin.id ? 1000 : 0 });
      const title = document.createElement('span'); title.textContent = pin.title || 'Novo pin';
      marker.bindTooltip(title, { direction: 'top', offset: [0, -22], className: 'atlas-tooltip' });
      marker.on('click', () => { if (!propsRef.current.placing && propsRef.current.drawing===null && !isDraft) propsRef.current.onSelect(pin.id); });
      marker.addTo(layer);
    });
  }, [props.pins, props.selectedId, props.draft, reload]);

  return <div className={`map-canvas-wrap ${props.placing || props.drawing!==null ? 'is-placing' : ''}`}>
    <svg className="map-render-filters" aria-hidden="true" width="0" height="0"><defs>
      <filter id="map-detail" x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
        <feConvolveMatrix order="3" kernelMatrix="0 -0.06 0 -0.06 1.24 -0.06 0 -0.06 0" preserveAlpha="true" edgeMode="duplicate"/>
      </filter>
      <filter id="map-night" x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
        <feConvolveMatrix order="3" kernelMatrix="0 -0.06 0 -0.06 1.24 -0.06 0 -0.06 0" preserveAlpha="true" edgeMode="duplicate"/>
        <feColorMatrix type="matrix" values="0.52 0 0 0 0.015 0 0.65 0 0 0.02 0 0 0.90 0 0.04 0 0 0 1 0"/>
      </filter>
    </defs></svg>
    <div ref={host} className="map-canvas" role="region" aria-label="Mapa interativo. Arraste para navegar; use mais e menos para zoom ou as setas do teclado para mover."/>
    {imageState !== 'ready' && <div className="map-image-status" role="status">{imageState === 'loading' ? <p>Revelando os caminhos…</p> : <><p>Não foi possível carregar o mapa.</p><button className="button secondary" onClick={() => setReload(value => value + 1)}>Tentar novamente</button></>}</div>}
  </div>;
}
