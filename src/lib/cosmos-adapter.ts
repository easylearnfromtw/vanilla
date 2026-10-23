/** Optional Cosmos gateway. This module never uploads media unless explicitly invoked. */
export type CosmosObservation = {
  observations: string[];
  uncertainty?: string;
  model: string;
  elapsedMs?: number;
};
export type CosmosRequest = {
  mediaUrl: string;
  question: string;
  privateMode: boolean;
  enabled: boolean;
};
export type CosmosConfig = {
  endpoint: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
};
export class CosmosUnavailableError extends Error {
  constructor(message: string) { super(message); this.name = 'CosmosUnavailableError'; }
}
export async function requestCosmosObservation(
  request: CosmosRequest,
  config: CosmosConfig,
): Promise<CosmosObservation> {
  if (!request.enabled) throw new CosmosUnavailableError('Cosmos is disabled');
  if (request.privateMode) throw new CosmosUnavailableError('Private mode prohibits remote Cosmos');
  const endpoint = new URL(config.endpoint);
  if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password)
    throw new CosmosUnavailableError('Cosmos endpoint must be credential-free HTTPS');
  const media = new URL(request.mediaUrl);
  if (media.protocol !== 'https:')
    throw new CosmosUnavailableError('Only HTTPS media URLs are accepted');
  if (!request.question.trim() || request.question.length > 2000)
    throw new CosmosUnavailableError('Invalid question');
  const timeout = Math.min(Math.max(config.timeoutMs ?? 15000, 1000), 30000);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await (config.fetchImpl ?? fetch)(endpoint.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mediaUrl: media.toString(), question: request.question }),
      signal: controller.signal,
      credentials: 'omit',
      redirect: 'error',
    });
    if (!response.ok) throw new CosmosUnavailableError('Cosmos gateway unavailable');
    const payload: unknown = await response.json();
    if (!payload || typeof payload !== 'object')
      throw new CosmosUnavailableError('Malformed Cosmos response');
    const p = payload as Record<string, unknown>;
    if (!Array.isArray(p.observations) || !p.observations.every(x => typeof x === 'string') ||
        p.observations.length > 100 || typeof p.model !== 'string')
      throw new CosmosUnavailableError('Malformed Cosmos response');
    return {
      observations: p.observations as string[],
      model: p.model,
      ...(typeof p.uncertainty === 'string' ? { uncertainty: p.uncertainty } : {}),
      ...(typeof p.elapsedMs === 'number' && Number.isFinite(p.elapsedMs) ? { elapsedMs: p.elapsedMs } : {}),
    };
  } catch (error) {
    if (error instanceof CosmosUnavailableError) throw error;
    throw new CosmosUnavailableError('Cosmos request failed or timed out');
  } finally {
    clearTimeout(timer);
  }
}
