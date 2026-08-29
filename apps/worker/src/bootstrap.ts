import { enforceLiveStartupConfiguration } from './live-startup-integration';
import { signerRefConfigured } from '@abn/signer';

const requestedMode = process.env.TRADING_MODE || process.env.RUNTIME_MODE || 'STOPPED';
const executionEnabled = process.env.EXECUTION_ENABLED === 'true';
const hummingbotConfigured = Boolean(
  process.env.HUMMINGBOT_BASE_URL &&
  (process.env.HUMMINGBOT_API_KEY ||
    (process.env.HUMMINGBOT_USERNAME && process.env.HUMMINGBOT_PASSWORD)),
);

const startup = enforceLiveStartupConfiguration({
  mode: requestedMode,
  executionEnabled,
  signerConfigured: signerRefConfigured(),
  hummingbotConfigured,
});

console.log(JSON.stringify({
  event: 'worker_bootstrap',
  requestedMode,
  effectiveMode: startup.mode,
  allowed: startup.allowed,
  reasons: startup.reasons,
}));

if (!startup.allowed && requestedMode === 'LIVE') {
  process.env.TRADING_MODE = 'DRY_RUN';
  process.env.RUNTIME_MODE = 'DRY_RUN';
  process.env.EXECUTION_ENABLED = 'false';
}

await import('./index.js');
