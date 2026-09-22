/**
 * Key validator unit tests — uses a fake fetch to avoid real network calls.
 */
import { validateKeyWithProvider } from '../keyvault/keyValidator';

function makeFetch(status: number): jest.Mock {
  return jest.fn().mockResolvedValue({
    status,
    ok: status >= 200 && status < 300,
  });
}

describe('validateKeyWithProvider', () => {
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