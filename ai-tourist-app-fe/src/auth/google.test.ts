import { describe, expect, it } from 'vitest';
import {
  isGoogleAuthConfigured,
  readGoogleAuthConfig,
  signInWithGoogle,
} from './google';

describe('google auth (stub)', () => {
  it('reads the VITE_GOOGLE_CLIENT_ID env var', () => {
    const cfg = readGoogleAuthConfig();
    // We don't assert a specific value — the env may or may not be set
    // depending on the test runner. We just confirm the helper returns
    // null when unset, or a config object when set.
    if (cfg === null) {
      expect(isGoogleAuthConfigured()).toBe(false);
    } else {
      expect(isGoogleAuthConfigured()).toBe(true);
      expect(cfg.clientId).toBeTypeOf('string');
    }
  });

  it('signInWithGoogle throws because the feature is scaffolded only', async () => {
    await expect(signInWithGoogle('fake-id-token')).rejects.toThrow(
      /scaffolded but not wired up/i,
    );
  });
});
