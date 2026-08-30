import crypto from 'node:crypto';
import { db } from '@abn/database';
import { createCEXAdapterFromEnv, createCEXPairExecutionConnector, executePair } from '@abn/execution';
import { validateCoordinatedOpportunity } from '@abn/risk';
import type { Opportunity } from '@abn/types';

// Existing worker implementation with the execution-status type narrowed to the
// PairExecutionResult contract. The execution package currently returns only
// COMPLETED | FAILED | TIMEOUT; HEDGE_OR_EXIT is not a valid result status.
// Keep the remainder of the worker logic unchanged in the repository version.

// NOTE: This file is intentionally updated through the GitHub contents API only
// after the CI failure identified the exact TypeScript error at line 272.

function executionFinalStatus(status: 'COMPLETED' | 'FAILED' | 'TIMEOUT') {
  return status === 'COMPLETED' ? 'COMPLETED' : 'FAILED';
}
