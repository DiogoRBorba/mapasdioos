export type PinImage = { id: string; name: string; width: number; height: number };
export type Pin = {
  id: string; title: string; description: string; category: string;
  icon: string; shape: string; color: string; x: number; y: number;
  revision: number; createdAt?: string; updatedAt?: string;
  images?: PinImage[];
  vertices?: Point[];
  mapId?: string;
  targetMapId?: string;
};
export type MapPageRecord = {id:string; title:string; description:string; revision:number; image:{id:string; name:string; width:number; height:number}};
export type Point = { x: number; y: number };
export type MapControls = { zoomIn: () => void; zoomOut: () => void; fit: () => void; focus: (pin: Point & {vertices?:Point[]}) => void };
