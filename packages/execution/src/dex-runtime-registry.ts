export interface CanonicalToken {
  network: string;
  chainId: number;
  symbol: string;
  address: string;
}

export interface NetworkRuntime {
  network: string;
  chainId: number;
  rpcUrl: string;
}

export interface DexRuntimeRegistry {
  networks: Record<string, NetworkRuntime>;
  tokens: Record<string, CanonicalToken>;
}

function key(network: string, symbol: string): string {
  return network.trim().toLowerCase() + ':' + symbol.trim().toUpperCase();
}

export function createDexRuntimeRegistry(input: { networks: NetworkRuntime[]; tokens: CanonicalToken[] }): DexRuntimeRegistry {
  const networks: Record<string, NetworkRuntime> = {};
  const tokens: Record<string, CanonicalToken> = {};
  for (const network of input.networks) {
    if (!network.network || !Number.isInteger(network.chainId) || network.chainId <= 0 || !network.rpcUrl) throw new Error('DEX_NETWORK_REGISTRY_INVALID');
    const id = network.network.toLowerCase();
    if (networks[id]) throw new Error('DEX_NETWORK_REGISTRY_DUPLICATE');
    networks[id] = { ...network, network: id };
  }
  for (const token of input.tokens) {
    if (!networks[token.network.toLowerCase()]) throw new Error('DEX_TOKEN_NETWORK_UNKNOWN');
    if (!token.symbol || !token.address || !Number.isInteger(token.chainId) || token.chainId <= 0) throw new Error('DEX_TOKEN_REGISTRY_INVALID');
    const k = key(token.network, token.symbol);
    if (tokens[k]) throw new Error('DEX_TOKEN_REGISTRY_DUPLICATE');
    tokens[k] = { ...token, network: token.network.toLowerCase(), symbol: token.symbol.toUpperCase() };
  }
  return { networks, tokens };
}

export function rpcUrlFor(registry: DexRuntimeRegistry, network: string): string | undefined {
  return registry.networks[network.toLowerCase()]?.rpcUrl;
}

export function tokenAddressFor(registry: DexRuntimeRegistry, network: string, symbol: string): string | undefined {
  return registry.tokens[key(network, symbol)]?.address;
}
