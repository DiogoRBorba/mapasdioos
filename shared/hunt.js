import { defaultEffects, defaultHeader, validateEffects, validateHeader } from './effects.js';
export const huntPeriods = [
  { id: 'morning', label: 'Manhã' },
  { id: 'afternoon', label: 'Tarde' },
  { id: 'night', label: 'Noite' },
];
export const initialHuntState = { day: 1, period: 'afternoon', revision: 0, updatedAt: null, effects:defaultEffects, header:defaultHeader };

export function validateHuntState(body) {
  if (!body || typeof body!=='object') throw new Error('Configuração inválida.');
  const moment = Object.hasOwn(body,'day') || Object.hasOwn(body,'period');
  if (moment && (!Number.isSafeInteger(body.day) || body.day < 1)) throw new Error('Informe um dia inteiro a partir de 1.');
  if (moment && !huntPeriods.some(period => period.id === body.period)) throw new Error('Escolha Manhã, Tarde ou Noite.');
  if (!Number.isSafeInteger(body.revision) || body.revision < 0) throw new Error('Versão do período inválida.');
  if(!moment && !Object.hasOwn(body,'effects') && !Object.hasOwn(body,'header'))throw new Error('Escolha uma alteração para publicar.');
  return { ...(moment?{day:body.day,period:body.period}:{}), revision:body.revision, ...(Object.hasOwn(body,'effects')?{effects:validateEffects(body.effects)}:{}), ...(Object.hasOwn(body,'header')?{header:validateHeader(body.header)}:{}) };
}
