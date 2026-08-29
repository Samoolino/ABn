import { enforceLiveStartupConfiguration } from './live-startup-integration';
import { signerRefConfigured } from '@abn/signer';

const requestedMode = process.env.TRADING_MODE || process.env.RUNTIME_MODE || 'STOPPED';
const executionEnabled = process.env.EXECUTION_ENABLED === 'true';

const startup = enforceLiveStartupConfiguration({
  mode: requestedMode,
  executionEnabled,
  signerConfigured: signerRefConfigured(),
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
