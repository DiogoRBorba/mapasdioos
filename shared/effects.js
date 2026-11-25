export const effectOptions = [
  { id:'fog', name:'Nuvens nas bordas', detail:'Névoa lenta ao redor do mapa, sem atravessar o centro.', group:'Ambiente' },
  { id:'birds', name:'Pássaros', detail:'Pequenos bandos atravessam o mapa a cada 15 segundos.', group:'Ambiente' },
  { id:'rain', name:'Chuva fina', detail:'Traços suaves para ruas melancólicas e tempestades distantes.', group:'Ambiente' },
  { id:'snow', name:'Neve', detail:'Flocos leves para invernos, montanhas e reinos gelados.', group:'Ambiente' },
  { id:'dayLighting', name:'Iluminação do período', detail:'Tons de manhã, entardecer e noite sobre o mapa.', group:'Luz e mistério' },
  { id:'nightLights', name:'Luzes noturnas', detail:'Pequenos pontos de luz acendem durante a noite.', group:'Luz e mistério' },
  { id:'redGlow', name:'Luz vermelha sinistra', detail:'Uma presença rubra pulsa lentamente nas bordas.', group:'Luz e mistério' },
  { id:'torchlight', name:'Luz de tochas', detail:'Brilho âmbar irregular, como fogo fora de cena.', group:'Luz e mistério' },
  { id:'embers', name:'Brasas ao vento', detail:'Faíscas discretas para ruínas, forjas e dark fantasy.', group:'Partículas e textura' },
  { id:'fireflies', name:'Vagalumes arcanos', detail:'Luzes verdes e douradas para bosques e lugares mágicos.', group:'Partículas e textura' },
  { id:'tvStatic', name:'TV antiga', detail:'Granulação e linhas de varredura suaves, sem flashes.', group:'Partículas e textura' },
  { id:'transitionFog', name:'Transição de névoa', detail:'Cobre e revela o mapa quando a data ou o período mudam.', group:'Transições' },
];
export const defaultEffects = Object.freeze({fog:true,birds:true,rain:false,snow:false,dayLighting:true,nightLights:true,redGlow:false,torchlight:false,embers:false,fireflies:false,tvStatic:false,transitionFog:true,intensity:60});
export const defaultHeader = Object.freeze({label:'Dia da caça',dayLabel:'Dia',dateText:''});
export function normalizeEffects(value){return {...defaultEffects,...value};}
export function normalizeHeader(value){return {...defaultHeader,...value};}
export function validateEffects(value){
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!Object.hasOwn(defaultEffects,key)))throw new Error('Configuração de efeitos inválida.');
  for(const option of effectOptions)if(typeof value[option.id]!=='boolean')throw new Error('Escolha quais efeitos ficarão ligados.');
  if(!Number.isInteger(value.intensity)||value.intensity<10||value.intensity>100)throw new Error('A intensidade deve estar entre 10 e 100.');
  return {...value};
}
export function validateHeader(value){
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!Object.hasOwn(defaultHeader,key)))throw new Error('Cabeçalho inválido.');
  for(const [key,min,max] of [['label',1,60],['dayLabel',1,24],['dateText',0,80]])if(typeof value[key]!=='string'||value[key].trim().length<min||value[key].length>max)throw new Error('Revise o título e a data do cabeçalho.');
  return Object.fromEntries(Object.entries(value).map(([key,text])=>[key,text.trim()]));
}
