export const campaignId = 'a-ultima-valsa-dos-imortais';
export const mapSize = { width: 1200, height: 808 };
export const pinCategories = [
  { id: 'places', label: 'Locais', icon: 'landmark', color: '#d6bd8e' },
  { id: 'hunts', label: 'Atividades de Caça', icon: 'target', color: '#c88265' },
  { id: 'memories', label: 'Memórias', icon: 'book', color: '#a997cb' },
  { id: 'allies', label: 'Aliados', icon: 'users', color: '#82af98' },
  { id: 'enemies', label: 'Inimigos', icon: 'skull', color: '#cf7777' },
  { id: 'territories', label: 'Territórios', icon: 'flag', color: '#7fabc0' },
  { id: 'map-pages', label: 'Páginas de mapa', icon: 'book', color: '#d6bd8e' },
];
import { customSymbols } from './custom-symbols.js';
export const pinIcons = ['pin', 'landmark', 'target', 'book', 'users', 'skull', 'flag', 'key', ...customSymbols.map(symbol=>symbol.id)];
export const pinShapes = ['marker', 'circle', 'diamond'];
export const pinColors = ['#d6bd8e', '#c88265', '#a997cb', '#82af98', '#cf7777', '#7fabc0', '#e9e3d6', '#d495b4'];
