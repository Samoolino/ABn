import { Contract, JsonRpcProvider, getAddress } from 'ethers';
import type { DexOnChainSource } from './dex-readiness';
import type { DexRuntimeRegistry } from './dex-runtime-registry';

const ERC20_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address,address) view returns (uint256)',
  'function decimals() view returns (uint8)',
];

export function createRpcDexOnChainSource(input: {
  registry: DexRuntimeRegistry;
  ownerForNetwork: (network: string) => string;
}): DexOnChainSource {
  const providers = new Map<string, JsonRpcProvider>();

  function provider(network: string): JsonRpcProvider {
    const id = network.trim().toLowerCase();
    const existing = providers.get(id);
    if (existing) return existing;
    const runtime = input.registry.networks[id];
    if (!runtime?.rpcUrl) throw new Error('DEX_RPC_URL_REQUIRED');
    const created = new JsonRpcProvider(runtime.rpcUrl, runtime.chainId, { staticNetwork: true });
    providers.set(id, created);
    return created;
  }

  async function token(network: string, asset: string): Promise<{ contract: Contract; decimals: number }> {
    const runtime = input.registry.networks[network.trim().toLowerCase()];
    const entry = input.registry.tokens[network.trim().toLowerCase() + ':' + asset.trim().toUpperCase()];
    if (!runtime) throw new Error('DEX_NETWORK_REGISTRY_UNKNOWN');
    if (!entry) throw new Error('DEX_TOKEN_ADDRESS_REQUIRED');
    if (entry.chainId !== runtime.chainId) throw new Error('DEX_TOKEN_CHAIN_MISMATCH');
    const address = getAddress(entry.address);
    const contract = new Contract(address, ERC20_ABI, provider(runtime.network));
    const decimals = Number(await contract.decimals());
    if (!Number.isInteger(decimals) || decimals < 0 || decimals > 255) throw new Error('DEX_TOKEN_DECIMALS_INVALID');
    return { contract, decimals };
  }

  function toNumber(value: bigint, decimals: number): number {
    const divisor = 10 ** decimals;
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || !Number.isFinite(divisor) || !Number.isSafeInteger(numeric)) {
      throw new Error('DEX_BALANCE_PRECISION_UNSAFE');
    }
    return numeric / divisor;
  }

  return {
    async getBalance({ network, asset }) {
      const owner = input.ownerForNetwork(network);
      if (!owner) throw new Error('DEX_OWNER_REQUIRED');
      const { contract, decimals } = await token(network, asset);
      return toNumber(await contract.balanceOf(getAddress(owner)), decimals);
    },
    async getAllowance({ network, asset, owner, spender }) {
      if (!owner || !spender) throw new Error('DEX_ALLOWANCE_PARTIES_REQUIRED');
      const { contract, decimals } = await token(network, asset);
      return toNumber(await contract.allowance(getAddress(owner), getAddress(spender)), decimals);
    },
  };
}
