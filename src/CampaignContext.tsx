import { createContext, useContext } from 'react';
import { defaultCampaignId, campaignApi } from '../shared/campaigns.js';
export const CampaignContext = createContext(defaultCampaignId);
export const useCampaignId = () => useContext(CampaignContext);
export { campaignApi };
