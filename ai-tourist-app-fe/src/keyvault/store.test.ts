import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateSalt, saltToBase64 } from './crypto';

// Mock the api module so the store exercises a stable surface.
const putKey = vi.fn();
const deleteKey = vi.fn();
const listKeys = vi.fn();
const getKey = vi.fn();

vi.mock('./api', () => ({
  putKey: (...args: unknown[]) => putKey(...args),
  deleteKey: (...args: unknown[]) => deleteKey(...args),
  listKeys: (...args: unknown[]) => listKeys(...args),
  getKey: (...args: unknown[]) => getKey(...args),
}));

// Localstorage is provided by jsdom — clear between tests so the salt
// store starts from a clean slate.
import { wipeUserKeyVaultState } from './saltStore';
import { useKeyVaultStore } from './store';

beforeEach(() => {
  putKey.mockReset();
  deleteKey.mockReset();
  listKeys.mockReset();
  getKey.mockReset();
  wipeUserKeyVaultState('self');
  // Reset store to a known state.
  useKeyVaultStore.setState({
    keys: [],
    selectedProvider: null,
    isLoading: false,
    isSubmitting: false,
    isValidating: false,
    validation: {},
    error: null,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useKeyVaultStore.fetchKeys', () => {
  it('populates keys from the API', async () => {
    listKeys.mockResolvedValueOnce([
      { provider: 'openai', hasKey: true, isValid: true, validatedAt: '2026-01-01T00:00:00Z' },
    ]);
    await useKeyVaultStore.getState().fetchKeys();
    expect(useKeyVaultStore.getState().keys).toHaveLength(1);
    expect(useKeyVaultStore.getState().isLoading).toBe(false);
  });

  it('surfaces an error', async () => {
    listKeys.mockRejectedValueOnce(new Error('network down'));
    await useKeyVaultStore.getState().fetchKeys();
    expect(useKeyVaultStore.getState().error).toMatch(/network down/);
  });
});

describe('useKeyVaultStore.addKey', () => {
  it('encrypts the plaintext locally and uploads the blob', async () => {
    putKey.mockResolvedValueOnce({
      provider: 'openai',
      hasKey: true,
      isValid: true,
      validatedAt: new Date().toISOString(),
    });
    listKeys.mockResolvedValueOnce([
      { provider: 'openai', hasKey: true, isValid: true, validatedAt: new Date().toISOString() },
    ]);
    await useKeyVaultStore.getState().addKey({
      provider: 'openai',
      plaintext: 'sk-test',
      passphrase: 'correct-horse',
    });
    expect(putKey).toHaveBeenCalledTimes(1);
    const payload = putKey.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload.provider).toBe('openai');
    expect(typeof payload.ciphertext).toBe('string');
    expect(typeof payload.iv).toBe('string');
    expect(typeof payload.authTag).toBe('string');
    // SECURITY: the payload must NOT contain plaintext.
    expect(payload).not.toHaveProperty('plaintext');
    expect(payload).not.toHaveProperty('apiKey');
  });

  it('throws for an unsupported provider', async () => {
    await expect(
      useKeyVaultStore.getState().addKey({
        provider: 'bogus',
        plaintext: 'sk-test',
        passphrase: 'correct-horse',
      }),
    ).rejects.toThrow(/Unsupported provider/);
    expect(putKey).not.toHaveBeenCalled();
  });

  it('persists the salt on first add so subsequent unlocks derive the same KEK', async () => {
    putKey.mockResolvedValueOnce({
      provider: 'openai',
      hasKey: true,
      isValid: true,
      validatedAt: new Date().toISOString(),
    });
    listKeys.mockResolvedValueOnce([]);
    await useKeyVaultStore.getState().addKey({
      provider: 'openai',
      plaintext: 'sk-test',
      passphrase: 'correct-horse',
    });
    const salt = window.localStorage.getItem('ai-tourist-app.keyVault.salt.self');
    expect(salt).not.toBeNull();
    expect(saltToBase64(generateSalt())).not.toEqual(salt);
  });

  it('surfaces upload errors', async () => {
    putKey.mockRejectedValueOnce(new Error('server down'));
    await expect(
      useKeyVaultStore.getState().addKey({
        provider: 'openai',
        plaintext: 'sk-test',
        passphrase: 'correct-horse',
      }),
    ).rejects.toThrow(/server down/);
    expect(useKeyVaultStore.getState().error).toMatch(/server down/);
  });
});

describe('useKeyVaultStore.removeKey', () => {
  it('calls the API and refreshes the list', async () => {
    deleteKey.mockResolvedValueOnce(undefined);
    listKeys.mockResolvedValueOnce([]);
    useKeyVaultStore.setState({
      keys: [
        { provider: 'openai', hasKey: true, isValid: true, validatedAt: '2026-01-01T00:00:00Z' },
      ],
      validation: { openai: { status: 'valid', reason: null } },
    });
    await useKeyVaultStore.getState().removeKey('openai');
    expect(deleteKey).toHaveBeenCalledWith('openai');
    expect(useKeyVaultStore.getState().keys).toEqual([]);
    // Validation entry for the deleted provider is cleared.
    expect(useKeyVaultStore.getState().validation.openai).toBeUndefined();
  });

  it('surfaces delete errors', async () => {
    deleteKey.mockRejectedValueOnce(new Error('boom'));
    await expect(useKeyVaultStore.getState().removeKey('openai')).rejects.toThrow(/boom/);
  });
});

describe('useKeyVaultStore.validateKey', () => {
  it('marks a stored, valid key as valid', async () => {
    getKey.mockResolvedValueOnce({
      provider: 'openai',
      hasKey: true,
      isValid: true,
      validatedAt: new Date().toISOString(),
    });
    const result = await useKeyVaultStore.getState().validateKey('openai');
    expect(result.status).toBe('valid');
  });

  it('marks a stored, invalid key as invalid with reason', async () => {
    getKey.mockResolvedValueOnce({
      provider: 'openai',
      hasKey: true,
      isValid: false,
      validatedAt: null,
    });
    const result = await useKeyVaultStore.getState().validateKey('openai');
    expect(result.status).toBe('invalid');
  });

  it('reports invalid when no key is stored', async () => {
    getKey.mockResolvedValueOnce({
      provider: 'openai',
      hasKey: false,
      isValid: false,
      validatedAt: null,
    });
    const result = await useKeyVaultStore.getState().validateKey('openai');
    expect(result.status).toBe('invalid');
    expect(result.reason).toMatch(/No key stored/);
  });

  it('reports invalid for an unknown provider', async () => {
    const result = await useKeyVaultStore.getState().validateKey('bogus');
    expect(result.status).toBe('invalid');
  });
});

describe('useKeyVaultStore.lockAll', () => {
  it('is callable and does not throw', () => {
    expect(() => useKeyVaultStore.getState().lockAll()).not.toThrow();
  });
});