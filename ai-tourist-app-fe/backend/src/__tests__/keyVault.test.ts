/**
 * Key vault service + endpoint unit tests.
 *
 * Covers:
 *  - ciphertext round-trip (store → metadata read → delete)
 *  - blob never returned by GET
 *  - validation flags (iv/authTag length, empty ciphertext)
 *  - auth required (401 without token)
 *  - provider-scoped isolation
 *
 * DB layer is mocked via createFakeDb.
 */
import request from 'supertest';
import { createApp } from '../app';
import { createFakeDb, type FakeDb } from './helpers/fakeDb';
import * as keyVaultService from '../keyvault/keyVault.service';
import * as authService from '../auth/auth.service';
import type { StoredKeyMeta } from '../keyvault/keyVault.schema';

// Helper: real 12-byte IV, 16-byte tag, 32-byte ciphertext, base64.
const VALID_IV = Buffer.alloc(12, 0x01).toString('base64');
const VALID_TAG = Buffer.alloc(16, 0x02).toString('base64');
const VALID_CT = Buffer.alloc(32, 0x03).toString('base64');

let fake: FakeDb;
let app: ReturnType<typeof createApp>;

// In-memory api_keys store: keyed by `${userId}|${provider}`.
let keys: Map<string, { user_id: string; provider: string; is_valid: boolean; validated_at: string | null }>;

beforeEach(() => {
  fake = createFakeDb();
  app = createApp();
  keys = new Map();

  // ── auth handlers (so signup works end-to-end via supertest) ──
  const users = new Map<string, { id: string; email: string; password_hash: string; display_name: string | null }>();
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

  // ── key vault handlers ──
  fake.when('INSERT INTO api_keys', (values) => {
    const [userId, provider, _ct, _iv, _tag, isValid, validatedAt] = values as [
      string, string, Buffer, Buffer, Buffer, boolean, string | null,
    ];
    const k = { user_id: userId, provider, is_valid: isValid, validated_at: validatedAt };
    keys.set(`${userId}|${provider}`, k);
    return { rows: [{ provider, is_valid: isValid, validated_at: validatedAt }] };
  });
  fake.when('validated_at FROM api_keys WHERE user_id = $1 AND provider = $2', (values) => {
    const [userId, provider] = values as [string, string];
    const k = keys.get(`${userId}|${provider}`);
    return { rows: k ? [{ provider: k.provider, is_valid: k.is_valid, validated_at: k.validated_at }] : [] };
  });
  fake.when('FROM api_keys WHERE user_id = $1 ORDER BY provider', (values) => {
    const userId = values[0] as string;
    const rows = [...keys.values()]
      .filter((k) => k.user_id === userId)
      .map((k) => ({ provider: k.provider, is_valid: k.is_valid, validated_at: k.validated_at }));
    return { rows };
  });
  fake.when('DELETE FROM api_keys', (values) => {
    const [userId, provider] = values as [string, string];
    const key = `${userId}|${provider}`;
    if (!keys.has(key)) return { rowCount: 0 };
    keys.delete(key);
    return { rowCount: 1 };
  });
});

async function signupAndToken(email: string): Promise<{ userId: string; token: string }> {
  const r = await authService.signup({ email, password: 'password123' });
  return { userId: r.userId, token: r.accessToken };
}

describe('keyVaultService (unit)', () => {
  let userId: string;
  beforeEach(async () => {
    ({ userId } = await signupAndToken('kv@example.com'));
  });

  it('stores a key and returns metadata (never the blob)', async () => {
    const meta = await keyVaultService.putKey(userId, {
      provider: 'openai',
      ciphertext: VALID_CT,
      iv: VALID_IV,
      authTag: VALID_TAG,
    });
    expect(meta).toEqual<StoredKeyMeta>({
      provider: 'openai',
      hasKey: true,
      isValid: true,
      validatedAt: expect.any(String),
    });
    // The returned object must not contain ciphertext/iv/authTag fields.
    expect(meta).not.toHaveProperty('ciphertext');
    expect(meta).not.toHaveProperty('iv');
    expect(meta).not.toHaveProperty('authTag');
  });

  it('reads back metadata only (no blob)', async () => {
    await keyVaultService.putKey(userId, {
      provider: 'openai',
      ciphertext: VALID_CT,
      iv: VALID_IV,
      authTag: VALID_TAG,
    });
    const meta = await keyVaultService.getKeyMeta(userId, 'openai');
    expect(meta.hasKey).toBe(true);
    expect(meta.isValid).toBe(true);
    expect(meta).not.toHaveProperty('ciphertext');
  });

  it('returns hasKey:false for a missing provider', async () => {
    const meta = await keyVaultService.getKeyMeta(userId, 'anthropic');
    expect(meta).toEqual<StoredKeyMeta>({
      provider: 'anthropic',
      hasKey: false,
      isValid: false,
      validatedAt: null,
    });
  });

  it('deletes a stored key', async () => {
    await keyVaultService.putKey(userId, {
      provider: 'openai',
      ciphertext: VALID_CT,
      iv: VALID_IV,
      authTag: VALID_TAG,
    });
    await keyVaultService.deleteKey(userId, 'openai');
    const meta = await keyVaultService.getKeyMeta(userId, 'openai');
    expect(meta.hasKey).toBe(false);
  });

  it('throws NotFound when deleting a missing key', async () => {
    await expect(keyVaultService.deleteKey(userId, 'ghost')).rejects.toMatchObject({
      code: 'NOT_FOUND',
      statusCode: 404,
    });
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
    await keyVaultService.putKey(userId, {
      provider: 'openai',
      ciphertext: VALID_CT,
      iv: VALID_IV,
      authTag: VALID_TAG,
    });
    let list = await keyVaultService.listKeyMeta(userId);
    expect(list).toHaveLength(1);
    expect(list[0].provider).toBe('openai');

    await keyVaultService.deleteKey(userId, 'openai');
    list = await keyVaultService.listKeyMeta(userId);
    expect(list).toHaveLength(0);
  });
});

describe('POST/GET/DELETE /me/keys (supertest)', () => {
  let token: string;
  beforeEach(async () => {
    ({ token } = await signupAndToken('kv-api@example.com'));
  });

  it('rejects requests without auth (401)', async () => {
    await request(app).get('/me/keys').expect(401);
    await request(app).post('/me/keys').send({}).expect(401);
    await request(app).delete('/me/keys/openai').expect(401);
  });

  it('POST /me/keys -> 200 with metadata', async () => {
    const res = await request(app)
      .post('/me/keys')
      .set('Authorization', `Bearer ${token}`)
      .send({ provider: 'openai', ciphertext: VALID_CT, iv: VALID_IV, authTag: VALID_TAG })
      .expect(200);
    expect(res.body).toEqual({
      provider: 'openai',
      hasKey: true,
      isValid: true,
      validatedAt: expect.any(String),
    });
    // SECURITY: response must never include the blob.
    expect(res.body.ciphertext).toBeUndefined();
    expect(res.body.iv).toBeUndefined();
    expect(res.body.authTag).toBeUndefined();
  });

  it('GET /me/keys -> 200 with list (metadata only)', async () => {
    await request(app)
      .post('/me/keys')
      .set('Authorization', `Bearer ${token}`)
      .send({ provider: 'openai', ciphertext: VALID_CT, iv: VALID_IV, authTag: VALID_TAG })
      .expect(200);

    const res = await request(app).get('/me/keys').set('Authorization', `Bearer ${token}`).expect(200);
    expect(res.body.keys).toHaveLength(1);
    expect(res.body.keys[0].provider).toBe('openai');
    expect(res.body.keys[0].ciphertext).toBeUndefined();
  });

  it('GET /me/keys/:provider -> 200 with metadata', async () => {
    await request(app)
      .post('/me/keys')
      .set('Authorization', `Bearer ${token}`)
      .send({ provider: 'openai', ciphertext: VALID_CT, iv: VALID_IV, authTag: VALID_TAG })
      .expect(200);

    const res = await request(app)
      .get('/me/keys/openai')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body).toEqual({
      provider: 'openai',
      hasKey: true,
      isValid: true,
      validatedAt: expect.any(String),
    });
  });

  it('DELETE /me/keys/:provider -> 204 then GET shows hasKey:false', async () => {
    await request(app)
      .post('/me/keys')
      .set('Authorization', `Bearer ${token}`)
      .send({ provider: 'openai', ciphertext: VALID_CT, iv: VALID_IV, authTag: VALID_TAG })
      .expect(200);

    await request(app).delete('/me/keys/openai').set('Authorization', `Bearer ${token}`).expect(204);

    const res = await request(app)
      .get('/me/keys/openai')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.hasKey).toBe(false);
  });

  it('DELETE /me/keys/:provider -> 404 for missing', async () => {
    await request(app).delete('/me/keys/ghost').set('Authorization', `Bearer ${token}`).expect(404);
  });

  it('POST /me/keys -> 400 on malformed blob (bad IV length)', async () => {
    await request(app)
      .post('/me/keys')
      .set('Authorization', `Bearer ${token}`)
      .send({
        provider: 'openai',
        ciphertext: VALID_CT,
        iv: Buffer.alloc(11, 0x01).toString('base64'),
        authTag: VALID_TAG,
      })
      .expect(400);
  });

  it('POST /me/keys -> 400 on non-base64 ciphertext', async () => {
    await request(app)
      .post('/me/keys')
      .set('Authorization', `Bearer ${token}`)
      .send({ provider: 'openai', ciphertext: '!!!not-base64!!!', iv: VALID_IV, authTag: VALID_TAG })
      .expect(400);
  });
});