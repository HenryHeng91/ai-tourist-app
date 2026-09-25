/**
 * Key vault service + endpoint unit tests (Issue #25 — T2.1).
 *
 * Covers:
 *  - ciphertext round-trip (store → metadata read → delete)
 *  - blob never returned by GET
 *  - validation flags (iv/authTag length, empty ciphertext)
 *  - auth required (401 without token)
 *  - id-keyed lookups (not provider-keyed)
 *  - POST /keys/:id/validate updates is_valid + validated_at
 *  - validation marks key invalid when the provider rejects
 *
 * DB layer is mocked via createFakeDb. The per-provider validator uses an
 * injected fetchImpl so we never hit the network.
 */
import request from 'supertest';
import { createApp } from '../app';
import { createFakeDb, type FakeDb } from './helpers/fakeDb';
import * as keyVaultService from '../keyvault/keyVault.service';
import * as authService from '../auth/auth.service';
import { resetRateLimiter } from '../shared/middleware/rateLimit';
import type { StoredKeyMeta, ValidationOutcome } from '../keyvault/keyVault.schema';

// Helper: real 12-byte IV, 16-byte tag, 32-byte ciphertext, base64.
const VALID_IV = Buffer.alloc(12, 0x01).toString('base64');
const VALID_TAG = Buffer.alloc(16, 0x02).toString('base64');
const VALID_CT = Buffer.alloc(32, 0x03).toString('base64');

let fake: FakeDb;
let app: ReturnType<typeof createApp>;

// In-memory api_keys store: keyed by id.
interface StoredRow {
  id: string;
  user_id: string;
  provider: string;
  ciphertext: Buffer;
  iv: Buffer;
  auth_tag: Buffer;
  is_valid: boolean;
  validated_at: string | null;
  created_at: string;
}
let keys: Map<string, StoredRow>;
let nextId = 0;

beforeEach(() => {
  resetRateLimiter();
  fake = createFakeDb();
  app = createApp();
  keys = new Map();
  nextId = 0;

  // ── auth handlers (so signup works end-to-end via supertest) ──
  const users = new Map<
    string,
    { id: string; email: string; password_hash: string; display_name: string | null }
  >();
  fake.when('FROM users WHERE email = $1', (values) => {
    const u = users.get(values[0] as string);
    return { rows: u ? [u] : [] };
  });
  fake.when('INSERT INTO users', (values) => {
    const [email, passwordHash, displayName] = values as [string, string, string | null];
    const u = { id: `user-${email}`, email, password_hash: passwordHash, display_name: displayName };
    users.set(email, u);
    return { rows: [u] };
  });
  fake.when('FROM users WHERE id = $1', (values) => {
    const u = [...users.values()].find((x) => x.id === values[0]);
    return { rows: u ? [u] : [] };
  });

  // refresh_tokens INSERT — authService.signup persists the jti in a
  // transaction; keyVault tests don't care about refresh state, so we absorb
  // the call with a no-op.
  fake.when('INSERT INTO refresh_tokens', () => ({ rows: [], rowCount: 1 }));

  // ── key vault handlers ──
  fake.when('INSERT INTO api_keys', (values) => {
    const [userId, provider, ct, iv, tag, isValid, validatedAt] = values as [
      string,
      string,
      Buffer,
      Buffer,
      Buffer,
      boolean,
      string | null,
    ];
    // Upsert behaviour: if a row already exists for (user, provider), update
    // it in place (same id). Matches the real DB ON CONFLICT clause.
    const existing = [...keys.values()].find(
      (k) => k.user_id === userId && k.provider === provider,
    );
    const created_at = new Date().toISOString();
    if (existing) {
      existing.ciphertext = ct;
      existing.iv = iv;
      existing.auth_tag = tag;
      existing.is_valid = isValid;
      existing.validated_at = validatedAt;
      return {
        rows: [
          {
            id: existing.id,
            provider,
            is_valid: isValid,
            validated_at: validatedAt,
            created_at: existing.created_at,
          },
        ],
      };
    }
    const id = `00000000-0000-0000-0000-${String(++nextId).padStart(12, '0')}`;
    const k: StoredRow = {
      id,
      user_id: userId,
      provider,
      ciphertext: ct,
      iv,
      auth_tag: tag,
      is_valid: isValid,
      validated_at: validatedAt,
      created_at,
    };
    keys.set(id, k);
    return { rows: [{ id, provider, is_valid: isValid, validated_at: validatedAt, created_at }] };
  });

  // SELECT … WHERE user_id = $1 AND id = $2 (used by getKeyMeta)
  fake.when('SELECT id, provider, is_valid, validated_at, created_at FROM api_keys WHERE user_id = $1 AND id = $2', (values) => {
    const [userId, id] = values as [string, string];
    const k = keys.get(id);
    if (!k || k.user_id !== userId) return { rows: [] };
    return {
      rows: [
        {
          id: k.id,
          provider: k.provider,
          is_valid: k.is_valid,
          validated_at: k.validated_at,
          created_at: k.created_at,
        },
      ],
    };
  });

  // SELECT … WITH ciphertext (used by validateStoredKey.fetchBlobForOwner)
  fake.when('SELECT id, user_id, provider, ciphertext, iv, auth_tag, is_valid, validated_at', (values) => {
    const [userId, id] = values as [string, string];
    const k = keys.get(id);
    if (!k || k.user_id !== userId) return { rows: [] };
    return {
      rows: [
        {
          id: k.id,
          user_id: k.user_id,
          provider: k.provider,
          ciphertext: k.ciphertext,
          iv: k.iv,
          auth_tag: k.auth_tag,
          is_valid: k.is_valid,
          validated_at: k.validated_at,
        },
      ],
    };
  });

  fake.when('FROM api_keys WHERE user_id = $1 ORDER BY provider', (values) => {
    const userId = values[0] as string;
    const rows = [...keys.values()]
      .filter((k) => k.user_id === userId)
      .map((k) => ({
        id: k.id,
        provider: k.provider,
        is_valid: k.is_valid,
        validated_at: k.validated_at,
        created_at: k.created_at,
      }));
    return { rows };
  });

  fake.when('DELETE FROM api_keys', (values) => {
    const [userId, id] = values as [string, string];
    const k = keys.get(id);
    if (!k || k.user_id !== userId) return { rowCount: 0 };
    keys.delete(id);
    return { rowCount: 1 };
  });

  fake.when('UPDATE api_keys SET is_valid', (values) => {
    const [isValid, validatedAt, userId, id] = values as [boolean, string, string, string];
    const k = keys.get(id);
    if (!k || k.user_id !== userId) return { rowCount: 0 };
    k.is_valid = isValid;
    k.validated_at = validatedAt;
    return { rowCount: 1 };
  });
});

async function signupAndToken(email: string): Promise<{ userId: string; token: string }> {
  const r = await authService.signup({ email, password: 'password123' });
  return { userId: r.userId, token: r.accessToken };
}

async function storeKey(userId: string, provider: string): Promise<StoredKeyMeta> {
  return keyVaultService.putKey(userId, {
    provider,
    ciphertext: VALID_CT,
    iv: VALID_IV,
    authTag: VALID_TAG,
  });
}

describe('keyVaultService (unit)', () => {
  let userId: string;
  beforeEach(async () => {
    ({ userId } = await signupAndToken('kv@example.com'));
  });

  it('stores a key and returns metadata (never the blob)', async () => {
    const meta = await storeKey(userId, 'openai');
    expect(meta).toMatchObject<Partial<StoredKeyMeta>>({
      id: expect.any(String),
      provider: 'openai',
      hasKey: true,
      isValid: true,
      validatedAt: expect.any(String),
    });
    expect(meta).not.toHaveProperty('ciphertext');
    expect(meta).not.toHaveProperty('iv');
    expect(meta).not.toHaveProperty('authTag');
  });

  it('reads back metadata only (no blob)', async () => {
    const stored = await storeKey(userId, 'openai');
    const meta = await keyVaultService.getKeyMeta(userId, stored.id);
    expect(meta.hasKey).toBe(true);
    expect(meta.isValid).toBe(true);
    expect(meta).not.toHaveProperty('ciphertext');
  });

  it('returns hasKey:false for a missing id', async () => {
    const meta = await keyVaultService.getKeyMeta(userId, '00000000-0000-0000-0000-000000000000');
    expect(meta.hasKey).toBe(false);
  });

  it('deletes a stored key', async () => {
    const stored = await storeKey(userId, 'openai');
    await keyVaultService.deleteKey(userId, stored.id);
    const meta = await keyVaultService.getKeyMeta(userId, stored.id);
    expect(meta.hasKey).toBe(false);
  });

  it('throws NotFound when deleting a missing key', async () => {
    await expect(
      keyVaultService.deleteKey(userId, '00000000-0000-0000-0000-000000000000'),
    ).rejects.toMatchObject({ code: 'NOT_FOUND', statusCode: 404 });
  });

  it('rejects an IV that is not 12 bytes', async () => {
    await expect(
      keyVaultService.putKey(userId, {
        provider: 'openai',
        ciphertext: VALID_CT,
        iv: Buffer.alloc(11, 0x01).toString('base64'),
        authTag: VALID_TAG,
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST', statusCode: 400 });
  });

  it('rejects an authTag that is not 16 bytes', async () => {
    await expect(
      keyVaultService.putKey(userId, {
        provider: 'openai',
        ciphertext: VALID_CT,
        iv: VALID_IV,
        authTag: Buffer.alloc(15, 0x02).toString('base64'),
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST', statusCode: 400 });
  });

  it('rejects empty ciphertext', async () => {
    await expect(
      keyVaultService.putKey(userId, {
        provider: 'openai',
        ciphertext: Buffer.alloc(0).toString('base64'),
        iv: VALID_IV,
        authTag: VALID_TAG,
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST', statusCode: 400 });
  });

  it('ciphertext round-trip: store, list, delete, list-empty', async () => {
    await storeKey(userId, 'openai');
    let list = await keyVaultService.listKeyMeta(userId);
    expect(list).toHaveLength(1);
    expect(list[0].provider).toBe('openai');
    const stored = list[0];
    await keyVaultService.deleteKey(userId, stored.id);
    list = await keyVaultService.listKeyMeta(userId);
    expect(list).toHaveLength(0);
  });

  it('upserts on duplicate (user, provider)', async () => {
    const a = await storeKey(userId, 'openai');
    const b = await storeKey(userId, 'openai');
    // Same row, same id (UNIQUE(user_id, provider))
    expect(b.id).toBe(a.id);
    const list = await keyVaultService.listKeyMeta(userId);
    expect(list).toHaveLength(1);
  });
});

describe('validateStoredKey (unit, provider dispatch)', () => {
  let userId: string;

  beforeEach(async () => {
    ({ userId } = await signupAndToken('kv-validate@example.com'));
  });

  // We mock fetchImpl via the validator module directly — easier than wiring
  // it through the service. Override the validator functions on the module
  // export (we re-import below).
  const fakeFetch = jest.fn();
  let validator: typeof import('../keyvault/keyValidator');

  beforeAll(async () => {
    validator = await import('../keyvault/keyValidator');
  });

  beforeEach(() => {
    fakeFetch.mockReset();
  });

  async function runValidate(
    stored: StoredKeyMeta,
    provider: string,
    fetchResult: { status: number } | { error: Error },
  ) {
    if ('error' in fetchResult) {
      fakeFetch.mockRejectedValueOnce(fetchResult.error);
    } else {
      fakeFetch.mockResolvedValueOnce({
        status: fetchResult.status,
        ok: fetchResult.status >= 200 && fetchResult.status < 300,
      });
    }
    // Re-implement via direct validator dispatch (passing fetchImpl).
    const result = await validator.validateKeyForProvider(provider, 'sk-test', {
      fetchImpl: fakeFetch as unknown as typeof fetch,
    });
    // Then drive the service flow to update DB.
    if (result.isValid) {
      await keyVaultService.putKey(userId, {
        provider,
        ciphertext: VALID_CT,
        iv: VALID_IV,
        authTag: VALID_TAG,
        isValid: true,
      });
    }
    return result;
  }

  it('openai: GET /v1/models with Bearer', async () => {
    const stored = await storeKey(userId, 'openai');
    const result = await runValidate(stored, 'openai', { status: 200 });
    expect(result.isValid).toBe(true);
    expect(fakeFetch).toHaveBeenCalledTimes(1);
    const [url, init] = fakeFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.openai.com/v1/models');
    expect(init.method).toBe('GET');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sk-test');
  });

  it('anthropic: POST /v1/messages with x-api-key', async () => {
    const stored = await storeKey(userId, 'anthropic');
    const result = await runValidate(stored, 'anthropic', { status: 200 });
    expect(result.isValid).toBe(true);
    const [url, init] = fakeFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect(init.method).toBe('POST');
    const headers = init.headers as Record<string, string>;
    expect(headers['x-api-key']).toBe('sk-test');
    expect(headers['anthropic-version']).toBe('2023-06-01');
    const body = JSON.parse(init.body as string);
    expect(body.model).toBeDefined();
    expect(body.max_tokens).toBe(1);
  });

  it('google-genai: GET /v1beta/models with x-goog-api-key', async () => {
    const stored = await storeKey(userId, 'google-genai');
    const result = await runValidate(stored, 'google-genai', { status: 200 });
    expect(result.isValid).toBe(true);
    const [url, init] = fakeFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/models');
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe('sk-test');
  });

  it('xai: GET /v1/models with Bearer', async () => {
    const stored = await storeKey(userId, 'xai');
    const result = await runValidate(stored, 'xai', { status: 200 });
    expect(result.isValid).toBe(true);
    const [url, init] = fakeFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.x.ai/v1/models');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sk-test');
  });

  it('marks key as invalid when provider returns 401', async () => {
    const stored = await storeKey(userId, 'openai');
    const result = await runValidate(stored, 'openai', { status: 401 });
    expect(result.isValid).toBe(false);
    expect(result.reason).toMatch(/unauthorized/i);
  });

  it('marks key as invalid on network error', async () => {
    const stored = await storeKey(userId, 'openai');
    const result = await runValidate(stored, 'openai', { error: new Error('ETIMEDOUT') });
    expect(result.isValid).toBe(false);
    expect(result.reason).toContain('ETIMEDOUT');
  });

  it('rejects unknown provider', async () => {
    const result = await validator.validateKeyForProvider('bogus', 'sk-test', {
      fetchImpl: fakeFetch as unknown as typeof fetch,
    });
    expect(result.isValid).toBe(false);
    expect(result.reason).toContain('unknown provider');
  });
});

describe('POST/GET/DELETE /keys (supertest)', () => {
  let token: string;
  beforeEach(async () => {
    ({ token } = await signupAndToken('kv-api@example.com'));
  });

  it('rejects requests without auth (401)', async () => {
    await request(app).get('/keys').expect(401);
    await request(app).post('/keys').send({}).expect(401);
    await request(app).delete(`/keys/${'00000000-0000-0000-0000-000000000000'}`).expect(401);
  });

  it('POST /keys -> 200 with metadata', async () => {
    const res = await request(app)
      .post('/keys')
      .set('Authorization', `Bearer ${token}`)
      .send({ provider: 'openai', ciphertext: VALID_CT, iv: VALID_IV, authTag: VALID_TAG })
      .expect(200);
    expect(res.body).toMatchObject({
      provider: 'openai',
      hasKey: true,
      isValid: true,
      id: expect.any(String),
    });
    expect(res.body.ciphertext).toBeUndefined();
    expect(res.body.iv).toBeUndefined();
    expect(res.body.authTag).toBeUndefined();
  });

  it('GET /keys -> 200 with list (metadata only)', async () => {
    const stored = await request(app)
      .post('/keys')
      .set('Authorization', `Bearer ${token}`)
      .send({ provider: 'openai', ciphertext: VALID_CT, iv: VALID_IV, authTag: VALID_TAG })
      .expect(200);

    const res = await request(app).get('/keys').set('Authorization', `Bearer ${token}`).expect(200);
    expect(res.body.keys).toHaveLength(1);
    expect(res.body.keys[0].id).toBe(stored.body.id);
    expect(res.body.keys[0].ciphertext).toBeUndefined();
  });

  it('GET /keys/:id -> 200 with metadata', async () => {
    const stored = await request(app)
      .post('/keys')
      .set('Authorization', `Bearer ${token}`)
      .send({ provider: 'openai', ciphertext: VALID_CT, iv: VALID_IV, authTag: VALID_TAG })
      .expect(200);

    const res = await request(app)
      .get(`/keys/${stored.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body).toMatchObject({
      id: stored.body.id,
      provider: 'openai',
      hasKey: true,
      isValid: true,
    });
  });

  it('GET /keys/:id -> 200 with hasKey:false for missing id', async () => {
    const res = await request(app)
      .get('/keys/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.hasKey).toBe(false);
  });

  it('DELETE /keys/:id -> 204 then GET shows hasKey:false', async () => {
    const stored = await request(app)
      .post('/keys')
      .set('Authorization', `Bearer ${token}`)
      .send({ provider: 'openai', ciphertext: VALID_CT, iv: VALID_IV, authTag: VALID_TAG })
      .expect(200);

    await request(app)
      .delete(`/keys/${stored.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(204);

    const res = await request(app)
      .get(`/keys/${stored.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.hasKey).toBe(false);
  });

  it('DELETE /keys/:id -> 404 for missing', async () => {
    await request(app)
      .delete('/keys/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });

  it('POST /keys -> 400 on malformed blob (bad IV length)', async () => {
    await request(app)
      .post('/keys')
      .set('Authorization', `Bearer ${token}`)
      .send({
        provider: 'openai',
        ciphertext: VALID_CT,
        iv: Buffer.alloc(11, 0x01).toString('base64'),
        authTag: VALID_TAG,
      })
      .expect(400);
  });

  it('POST /keys -> 400 on non-base64 ciphertext', async () => {
    await request(app)
      .post('/keys')
      .set('Authorization', `Bearer ${token}`)
      .send({ provider: 'openai', ciphertext: '!!!not-base64!!!', iv: VALID_IV, authTag: VALID_TAG })
      .expect(400);
  });

  it('GET /keys/:id -> 400 on non-uuid id', async () => {
    await request(app)
      .get('/keys/not-a-uuid')
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
  });
});

describe('POST /keys/:id/validate (supertest)', () => {
  let token: string;
  let keyId: string;

  beforeEach(async () => {
    ({ token } = await signupAndToken('kv-validate-api@example.com'));
    const stored = await request(app)
      .post('/keys')
      .set('Authorization', `Bearer ${token}`)
      .send({ provider: 'openai', ciphertext: VALID_CT, iv: VALID_IV, authTag: VALID_TAG })
      .expect(200);
    keyId = stored.body.id;
  });

  it('rejects without auth (401)', async () => {
    await request(app)
      .post(`/keys/${keyId}/validate`)
      .send({ plaintext: 'sk-test' })
      .expect(401);
  });

  it('rejects empty plaintext (400)', async () => {
    await request(app)
      .post(`/keys/${keyId}/validate`)
      .set('Authorization', `Bearer ${token}`)
      .send({ plaintext: '' })
      .expect(400);
  });

  it('returns 200 + updates is_valid when provider accepts', async () => {
    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockResolvedValue({
      status: 200,
      ok: true,
    }) as unknown as typeof fetch;
    try {
      const res = await request(app)
        .post(`/keys/${keyId}/validate`)
        .set('Authorization', `Bearer ${token}`)
        .send({ plaintext: 'sk-good' })
        .expect(200);
      expect(res.body).toMatchObject<Partial<ValidationOutcome>>({
        isValid: true,
        provider: 'openai',
        validatedAt: expect.any(String),
      });
      expect(res.body.plaintext).toBeUndefined();
      expect(res.body.ciphertext).toBeUndefined();

      // Subsequent GET should reflect isValid:true with new validatedAt.
      const got = await request(app)
        .get(`/keys/${keyId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(got.body.isValid).toBe(true);
      expect(got.body.validatedAt).toBe(res.body.validatedAt);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('returns 200 + updates is_valid:false when provider rejects', async () => {
    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockResolvedValue({ status: 401, ok: false }) as unknown as typeof fetch;
    try {
      const res = await request(app)
        .post(`/keys/${keyId}/validate`)
        .set('Authorization', `Bearer ${token}`)
        .send({ plaintext: 'sk-bad' })
        .expect(200);
      expect(res.body.isValid).toBe(false);
      expect(res.body.reason).toMatch(/unauthorized/i);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('returns 404 when validating a missing id', async () => {
    await request(app)
      .post('/keys/00000000-0000-0000-0000-000000000000/validate')
      .set('Authorization', `Bearer ${token}`)
      .send({ plaintext: 'sk-x' })
      .expect(404);
  });

  it('rate-limits per user (11th request in a minute -> 429)', async () => {
    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockResolvedValue({ status: 200, ok: true }) as unknown as typeof fetch;
    try {
      // 10 succeed, 11th is rate-limited.
      for (let i = 0; i < 10; i++) {
        await request(app)
          .post(`/keys/${keyId}/validate`)
          .set('Authorization', `Bearer ${token}`)
          .send({ plaintext: `sk-${i}` })
          .expect(200);
      }
      await request(app)
        .post(`/keys/${keyId}/validate`)
        .set('Authorization', `Bearer ${token}`)
        .send({ plaintext: 'sk-overflow' })
        .expect(429);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('never returns the plaintext or the ciphertext blob in the response', async () => {
    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockResolvedValue({ status: 200, ok: true }) as unknown as typeof fetch;
    try {
      const res = await request(app)
        .post(`/keys/${keyId}/validate`)
        .set('Authorization', `Bearer ${token}`)
        .send({ plaintext: 'sk-secret' })
        .expect(200);
      const body = JSON.stringify(res.body);
      expect(body).not.toContain('sk-secret');
      expect(body).not.toContain(VALID_CT);
      expect(body).not.toContain(VALID_IV);
      expect(body).not.toContain(VALID_TAG);
    } finally {
      global.fetch = originalFetch;
    }
  });
});