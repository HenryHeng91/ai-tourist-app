/**
 * Key validator unit tests — per-provider dispatch + legacy entry point.
 * Uses a fake fetch to avoid real network calls.
 */
import {
  validateKeyForProvider,
  validateKeyWithProvider,
  isKnownProvider,
} from '../keyvault/keyValidator';

function makeFetch(status: number): jest.Mock {
  return jest.fn().mockResolvedValue({
    status,
    ok: status >= 200 && status < 300,
  });
}

// ── legacy entry point (kept for back-compat) ──────────────────────────

describe('validateKeyWithProvider (legacy OpenAI-shaped)', () => {
  it('returns isValid:true on 200', async () => {
    const res = await validateKeyWithProvider('sk-test', { fetchImpl: makeFetch(200) });
    expect(res.isValid).toBe(true);
    expect(res.reason).toBeUndefined();
  });

  it('returns isValid:false on 401', async () => {
    const res = await validateKeyWithProvider('sk-bad', { fetchImpl: makeFetch(401) });
    expect(res.isValid).toBe(false);
    expect(res.reason).toContain('unauthorized');
  });

  it('returns isValid:false on 403', async () => {
    const res = await validateKeyWithProvider('sk-bad', { fetchImpl: makeFetch(403) });
    expect(res.isValid).toBe(false);
  });

  it('returns isValid:false on unexpected status', async () => {
    const res = await validateKeyWithProvider('sk-x', { fetchImpl: makeFetch(500) });
    expect(res.isValid).toBe(false);
    expect(res.reason).toContain('500');
  });

  it('returns isValid:false on network error', async () => {
    const fetchImpl = jest.fn().mockRejectedValue(new Error('ETIMEDOUT'));
    const res = await validateKeyWithProvider('sk-x', { fetchImpl });
    expect(res.isValid).toBe(false);
    expect(res.reason).toContain('ETIMEDOUT');
  });

  it('sends the key as a Bearer token', async () => {
    const fetchImpl = makeFetch(200);
    await validateKeyWithProvider('sk-test', {
      baseUrl: 'https://api.example.com',
      validatePath: '/v1/models',
      fetchImpl,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.example.com/v1/models');
    expect(init.headers).toEqual({ Authorization: 'Bearer sk-test' });
    expect(init.method).toBe('GET');
  });
});

// ── per-provider dispatch ──────────────────────────────────────────────

describe('validateKeyForProvider', () => {
  describe('openai', () => {
    it('returns isValid:true on 200 from /v1/models', async () => {
      const f = makeFetch(200);
      const res = await validateKeyForProvider('openai', 'sk-good', { fetchImpl: f });
      expect(res.isValid).toBe(true);
      const [url, init] = f.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://api.openai.com/v1/models');
      expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sk-good');
    });

    it('returns isValid:false on 401', async () => {
      const res = await validateKeyForProvider('openai', 'sk-bad', { fetchImpl: makeFetch(401) });
      expect(res.isValid).toBe(false);
      expect(res.reason).toContain('unauthorized');
    });
  });

  describe('anthropic', () => {
    it('POST /v1/messages with x-api-key on 200', async () => {
      const f = makeFetch(200);
      const res = await validateKeyForProvider('anthropic', 'sk-ant', { fetchImpl: f });
      expect(res.isValid).toBe(true);
      const [url, init] = f.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://api.anthropic.com/v1/messages');
      expect(init.method).toBe('POST');
      const headers = init.headers as Record<string, string>;
      expect(headers['x-api-key']).toBe('sk-ant');
      expect(headers['anthropic-version']).toBe('2023-06-01');
      expect(headers['content-type']).toBe('application/json');
      const body = JSON.parse(init.body as string);
      expect(body.max_tokens).toBe(1);
      expect(body.messages).toHaveLength(1);
    });

    it('401 → isValid:false (key rejected)', async () => {
      const res = await validateKeyForProvider('anthropic', 'sk-ant', { fetchImpl: makeFetch(401) });
      expect(res.isValid).toBe(false);
      expect(res.reason).toContain('unauthorized');
    });

    it('400 → isValid:false (rejected request)', async () => {
      const res = await validateKeyForProvider('anthropic', 'sk-ant', { fetchImpl: makeFetch(400) });
      expect(res.isValid).toBe(false);
      expect(res.reason).toContain('400');
    });

    it('500 → isValid:false (server error)', async () => {
      const res = await validateKeyForProvider('anthropic', 'sk-ant', { fetchImpl: makeFetch(500) });
      expect(res.isValid).toBe(false);
      expect(res.reason).toContain('500');
    });
  });

  describe('google-genai', () => {
    it('GET /v1beta/models with x-goog-api-key on 200', async () => {
      const f = makeFetch(200);
      const res = await validateKeyForProvider('google-genai', 'AIza...', { fetchImpl: f });
      expect(res.isValid).toBe(true);
      const [url, init] = f.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/models');
      expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe('AIza...');
    });

    it('403 → isValid:false', async () => {
      const res = await validateKeyForProvider('google-genai', 'AIza', {
        fetchImpl: makeFetch(403),
      });
      expect(res.isValid).toBe(false);
    });
  });

  describe('xai', () => {
    it('GET /v1/models with Bearer on 200', async () => {
      const f = makeFetch(200);
      const res = await validateKeyForProvider('xai', 'sk-xai', { fetchImpl: f });
      expect(res.isValid).toBe(true);
      const [url, init] = f.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://api.x.ai/v1/models');
      expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sk-xai');
    });

    it('401 → isValid:false', async () => {
      const res = await validateKeyForProvider('xai', 'sk-xai', { fetchImpl: makeFetch(401) });
      expect(res.isValid).toBe(false);
    });
  });

  describe('openai-compat', () => {
    it('honors a custom base URL override', async () => {
      const f = makeFetch(200);
      const res = await validateKeyForProvider('openai-compat', 'sk-x', {
        fetchImpl: f,
        overrides: { openaiCompatBaseUrl: 'https://my-local-llm.example.com' },
      });
      expect(res.isValid).toBe(true);
      const [url] = f.mock.calls[0] as [string];
      expect(url).toBe('https://my-local-llm.example.com/v1/models');
    });
  });

  describe('unknown provider', () => {
    it('returns isValid:false without making a network call', async () => {
      const f = jest.fn();
      const res = await validateKeyForProvider('mystery-provider', 'sk-x', {
        fetchImpl: f as unknown as typeof fetch,
      });
      expect(res.isValid).toBe(false);
      expect(res.reason).toContain('unknown provider');
      expect(f).not.toHaveBeenCalled();
    });
  });

  describe('network error', () => {
    it('returns isValid:false with the error message', async () => {
      const f = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));
      const res = await validateKeyForProvider('openai', 'sk-x', {
        fetchImpl: f as unknown as typeof fetch,
      });
      expect(res.isValid).toBe(false);
      expect(res.reason).toContain('ECONNREFUSED');
    });
  });

  describe('isKnownProvider', () => {
    it('recognises the four MVP providers', () => {
      expect(isKnownProvider('openai')).toBe(true);
      expect(isKnownProvider('anthropic')).toBe(true);
      expect(isKnownProvider('google-genai')).toBe(true);
      expect(isKnownProvider('xai')).toBe(true);
      expect(isKnownProvider('openai-compat')).toBe(true);
    });

    it('rejects unknowns', () => {
      expect(isKnownProvider('nope')).toBe(false);
    });
  });
});