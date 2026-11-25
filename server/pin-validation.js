import { pinCategories, pinIcons, pinShapes } from '../shared/map.js';
import { MAX_PIN_IMAGES } from '../shared/pin-images.js';
import { validateTerritory, territoryCenter } from '../shared/territories.js';

export const validId = id => typeof id === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(id);
export function validatePin(input) {
  if (!input || typeof input !== 'object') throw new Error('Informe os dados do pin.');
  if (typeof input.title !== 'string' || !input.title.trim() || input.title.trim().length > 120) throw new Error('O título deve ter entre 1 e 120 caracteres.');
  if (input.description !== undefined && (typeof input.description !== 'string' || input.description.length > 4000)) throw new Error('A descrição deve ter no máximo 4.000 caracteres.');
  if (!pinCategories.some(category => category.id === input.category)) throw new Error('Escolha uma categoria válida.');
  if (!pinIcons.includes(input.icon) || !pinShapes.includes(input.shape)) throw new Error('Escolha um símbolo e um formato válidos.');
  if (typeof input.color !== 'string' || !/^#[a-f0-9]{6}$/i.test(input.color)) throw new Error('Escolha uma cor válida.');
  if (![input.x, input.y].every(value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1)) throw new Error('Escolha uma posição dentro do mapa.');
  const images = input.images ?? [];
  if (!Array.isArray(images) || images.length > MAX_PIN_IMAGES || images.some(image => !image || !validId(image.id)) || new Set(images.map(image => image.id)).size !== images.length) throw new Error(`Escolha até ${MAX_PIN_IMAGES} imagens diferentes.`);
  let vertices;
  if(input.vertices !== undefined) {
    if(!['territories','map-pages'].includes(input.category))throw new Error('Somente territórios e páginas de mapa podem ter um contorno.');
    vertices=validateTerritory(input.vertices);
  }
  if(input.category==='map-pages' && (!vertices || !(input.targetMapId==='main'||validId(input.targetMapId))))throw new Error('Desenhe uma área e escolha o mapa de destino.');
  return { title: input.title.trim(), description: input.description?.trim() || '', category: input.category, icon: input.icon, shape: input.shape, color: input.color.toLowerCase(), x: input.x, y: input.y, ...(vertices?{vertices,...territoryCenter(vertices)}:{}), ...(input.category==='map-pages'?{targetMapId:input.targetMapId}:{}), images: images.map(image => ({ id: image.id })) };
}
