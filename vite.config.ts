import socialHandler from './api/social.js';
import campaignsHandler from './api/campaigns.js';
import feedHandler from './api/feed.js';
import newsHandler from './api/news.js';
import assetsHandler from './api/campaign-assets.js';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import accessHandler from './api/campaign-access.js';
import pinsHandler from './api/map-pins.js';
import imageHandler from './api/map-image.js';
import stateHandler from './api/map-state.js';
import pinImagesHandler from './api/pin-images.js';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  for (const key of ['CAMPAIGN_IMORTAIS_PLAYER_PASSWORD', 'CAMPAIGN_IMORTAIS_ADMIN_PASSWORD', 'SESSION_SECRET', 'DATABASE_URL', 'CRON_SECRET']) {
    if (env[key]) process.env[key] = env[key];
  }
  return {
    plugins: [react(), {
      name: 'local-campaign-api',
      configureServer(server) {
        server.middlewares.use('/api/social', (req,res) => { void socialHandler(req,res); });
        server.middlewares.use('/api/news', (req,res) => { void newsHandler(req,res); });
        server.middlewares.use('/api/feed', (req,res) => { void feedHandler(req,res); });
        server.middlewares.use('/api/campaigns', (req,res) => { void campaignsHandler(req,res); });
        server.middlewares.use('/api/campaign-assets', (req,res) => { void assetsHandler(req,res); });
        server.middlewares.use('/api/pin-images', (req, res) => { void pinImagesHandler(req, res); });
        server.middlewares.use('/api/map-state', (req, res) => { void stateHandler(req, res); });
        server.middlewares.use('/api/map-pins', (req, res) => { void pinsHandler(req, res); });
        server.middlewares.use('/api/map-image', (req, res) => { void imageHandler(req, res); });
        server.middlewares.use('/api/campaign-access', (req, res) => {
          void accessHandler(req, res);
        });
      },
    }],
  };
});
