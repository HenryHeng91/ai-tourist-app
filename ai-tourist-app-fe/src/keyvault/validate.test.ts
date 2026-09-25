import { describe, expect, it, vi } from 'vitest';
import { validatePlaintextKey } from './validate';

function jsonResponse(status: number, body: unknown = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('validatePlaintextKey', () => {
  it('returns isValid:true on 200', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, { data: [] })) as unknown as typeof fetch;
    const result = await validatePlaintextKey('openai', 'sk-test', { fetchImpl });
    expect(result.isValid).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it('returns isValid:false on 401 with reason', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(401)) as unknown as typeof fetch;
    const result = await validatePlaintextKey('openai', 'sk-test', { fetchImpl });
    expect(result.isValid).toBe(false);
    expect(result.reason).toMatch(/unauthorized/i);
  });

  it('returns isValid:false on 403 with reason', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(403)) as unknown as typeof fetch;
    const result = await validatePlaintextKey('openai', 'sk-test', { fetchImpl });
    expect(result.isValid).toBe(false);
  });

  it('returns isValid:false on other 4xx/5xx with status', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(500)) as unknown as typeof fetch;
    const result = await validatePlaintextKey('openai', 'sk-test', { fetchImpl });
    expect(result.isValid).toBe(false);
    expect(result.reason).toMatch(/500/);
  });

  it('returns isValid:false on network failure', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('Network down');
    }) as unknown as typeof fetch;
    const result = await validatePlaintextKey('openai', 'sk-test', { fetchImpl });
    expect(result.isValid).toBe(false);
    expect(result.reason).toMatch(/Network down/);
  });

  it('returns isValid:false for an unknown provider', async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    const result = await validatePlaintextKey('bogus', 'sk-test', { fetchImpl });
    expect(result.isValid).toBe(false);
    expect(result.reason).toMatch(/Unknown provider/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('honours overrideUrl', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200)) as unknown as typeof fetch;
    await validatePlaintextKey('openai', 'sk-test', { fetchImpl, overrideUrl: 'https://example.test/check' });
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://example.test/check',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('sends a Bearer Authorization header', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200)) as unknown as typeof fetch;
    await validatePlaintextKey('openai', 'sk-test', { fetchImpl });
    expect(fetchImpl).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer sk-test' }),
      }),
    );
  });
});