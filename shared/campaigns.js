export const defaultCampaignId = 'a-ultima-valsa-dos-imortais';
export const validCampaignId = value => typeof value === 'string' && /^[a-z0-9][a-z0-9-]{0,79}$/.test(value);
export const campaignApi = (path, id = defaultCampaignId) => `${path}${path.includes('?') ? '&' : '?'}campaign=${encodeURIComponent(id)}`;
export const campaignName = campaign => [campaign.title, campaign.subtitle].filter(Boolean).join(' ');
export const campaignTypes = ['map', 'social', 'shadows'];
export const campaignAvailable = campaign => !!campaign && (!!campaign.map || campaign.type === 'social');
export const seedCampaigns = [
  { id: defaultCampaignId, title: 'A Última Valsa', subtitle: 'dos Imortais', description: 'Toda história deixa marcas. Algumas, nem o tempo consegue apagar.', image: '/images/imortais-wallpaper.png', map: { width: 1200, height: 808, builtin: true }, revision: 0, number: '01' },
  ...['Strangers', 'Exandria Renascida', 'Strangers', 'L.A By Night'].map((title, index) => ({ id: `campanha-0${index + 2}`, title, subtitle: '', description: '', image: '', map: null, revision: 0, number: `0${index + 2}` })),
];
