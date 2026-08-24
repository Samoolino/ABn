export interface HummingbotConfig { baseUrl: string; apiKey?: string; timeoutMs?: number }
export interface HummingbotClient { health():Promise<boolean>; markets():Promise<unknown>; orderBook(symbol:string):Promise<unknown>; execute(payload:Record<string,unknown>):Promise<unknown>; cancel(payload:Record<string,unknown>):Promise<unknown>; status(payload?:Record<string,unknown>):Promise<unknown> }

export function createHummingbotClient(config:HummingbotConfig):HummingbotClient {
  const base = config.baseUrl.replace(/\/$/, '');
  const timeoutMs = config.timeoutMs ?? 5000;
  async function request(path:string, init:RequestInit = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const headers = new Headers(init.headers);
      if (config.apiKey) headers.set('Authorization', `Bearer ${config.apiKey}`);
      headers.set('Content-Type', 'application/json');
      const response = await fetch(`${base}${path}`, {...init, headers, signal:controller.signal});
      if (!response.ok) throw new Error(`HUMMINGBOT_HTTP_${response.status}`);
      return response.json();
    } finally { clearTimeout(timer); }
  }
  return {
    health: async () => { try { await request('/health'); return true; } catch { return false; } },
    markets: () => request('/markets'),
    orderBook: (symbol) => request(`/order-book?symbol=${encodeURIComponent(symbol)}`),
    execute: (payload) => request('/execute', {method:'POST', body:JSON.stringify(payload)}),
    cancel: (payload) => request('/cancel', {method:'POST', body:JSON.stringify(payload)}),
    status: (payload={}) => request('/status', {method:'POST', body:JSON.stringify(payload)}),
  };
}
