import { validateWorkerLiveConfiguration } from './live-startup-config';

export function enforceLiveStartupConfiguration(input: {
  mode: string;
  executionEnabled: boolean;
  signerConfigured: boolean;
  hummingbotConfigured: boolean;
}): { mode: string; allowed: boolean; reasons: string[] } {
  const result = validateWorkerLiveConfiguration(input);
  if (!result.allowed) {
    return { mode: input.mode === 'LIVE' ? 'DRY_RUN' : input.mode, allowed: false, reasons: result.reasons };
  }
  return { mode: input.mode, allowed: true, reasons: [] };
}
