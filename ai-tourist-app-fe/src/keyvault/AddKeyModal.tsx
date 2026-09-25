/**
 * "Add API Key" modal.
 *
 * Flow:
 *   1. User picks a provider (openai | anthropic | google | xai).
 *   2. User pastes the API key (masked input, type=password).
 *   3. User enters a passphrase used to derive the per-user KEK.
 *   4. Submit → encrypt locally → POST /me/keys with the blob.
 *   5. On success → call the optional onSuccess callback and close.
 *
 * SECURITY: the plaintext key never leaves this form's local state until
 * it is encrypted by `useKeyVaultStore.addKey`. The store zeroes its
 * reference once `encrypt` has consumed it.
 */

import { useId, useRef, useState } from 'react';
import {
  PROVIDERS,
  useKeyVaultStore,
  validateHeldKey,
  type AiProviderId,
  type StoredKeyMeta,
} from './index';

export interface AddKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Optional callback fired after a successful addKey. */
  onAdded?: (meta: StoredKeyMeta) => void;
}

type Status = 'idle' | 'submitting' | 'validating' | 'done' | 'error';

interface FormState {
  provider: AiProviderId;
  apiKey: string;
  passphrase: string;
  status: Status;
  message: string | null;
}

const INITIAL: FormState = {
  provider: 'openai',
  apiKey: '',
  passphrase: '',
  status: 'idle',
  message: null,
};

export function AddKeyModal({ isOpen, onClose, onAdded }: AddKeyModalProps): JSX.Element | null {
  const [state, setState] = useState<FormState>(INITIAL);
  // Focus the API key input on mount (modal opens via key remount).
  const apiKeyInputRef = useRef<HTMLInputElement | null>(null);
  const setApiKeyInputRef = (el: HTMLInputElement | null): void => {
    apiKeyInputRef.current = el;
    if (el) el.focus();
  };
  const headingId = useId();
  const isSubmitting = useKeyVaultStore((s) => s.isSubmitting);
  const isValidating = useKeyVaultStore((s) => s.isValidating);
  const addKey = useKeyVaultStore((s) => s.addKey);

  // The modal remounts when `isOpen` transitions to true (via the `key`
  // prop in the parent), so we do not need to reset state in an effect.

  if (!isOpen) return null;

  const descriptor = PROVIDERS.find((p) => p.id === state.provider);
  const canSubmit =
    state.apiKey.trim().length > 0 &&
    state.passphrase.length >= 8 &&
    state.status !== 'submitting' &&
    !isSubmitting;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    if (!canSubmit) return;
    setState((s) => ({ ...s, status: 'submitting', message: null }));
    try {
      const meta = await addKey({
        provider: state.provider,
        plaintext: state.apiKey,
        passphrase: state.passphrase,
      });
      // Best-effort client-side validation against the provider's /models.
      setState((s) => ({ ...s, status: 'validating', message: 'Saved. Validating against provider…' }));
      const validation = await validateHeldKey(state.provider, state.apiKey);
      const isValid = validation.status === 'valid';
      setState((s) => ({
        ...s,
        status: 'done',
        message: isValid
          ? 'Key saved and validated.'
          : `Key saved, but provider rejected it: ${validation.reason ?? 'unknown reason'}.`,
      }));
      onAdded?.(meta);
      // Auto-close on success after a beat so the user can read the message.
      setTimeout(() => {
        setState(INITIAL);
        onClose();
      }, 1500);
    } catch (err) {
      setState((s) => ({
        ...s,
        status: 'error',
        message: err instanceof Error ? err.message : 'Failed to save key.',
      }));
    }
  }

  function handleBackdrop(e: React.MouseEvent<HTMLDivElement>): void {
    if (e.target === e.currentTarget && state.status !== 'submitting' && state.status !== 'validating') {
      setState(INITIAL);
      onClose();
    }
  }

  const inFlight = state.status === 'submitting' || state.status === 'validating' || isSubmitting || isValidating;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={headingId}
      onClick={handleBackdrop}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 50,
      }}
    >
      <form
        onSubmit={handleSubmit}
        style={{
          background: 'var(--color-surface)',
          color: 'var(--color-text)',
          padding: 'var(--space-6)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-lg)',
          width: 'min(420px, 90vw)',
          display: 'grid',
          gap: 'var(--space-3)',
        }}
      >
        <h2 id={headingId} style={{ margin: 0 }}>
          Add API key
        </h2>
        <p style={{ margin: 0, color: 'var(--color-text-muted)', fontSize: 'var(--fs-sm)' }}>
          Your key is encrypted in your browser with AES-256-GCM before being uploaded.
          The server stores only the ciphertext.
        </p>

        <label style={{ display: 'grid', gap: 'var(--space-1)' }}>
          <span>Provider</span>
          <select
            value={state.provider}
            onChange={(e) =>
              setState((s) => ({ ...s, provider: e.target.value as AiProviderId }))
            }
            disabled={inFlight}
            style={{ padding: 'var(--space-2)', borderRadius: 'var(--radius-sm)' }}
          >
            {PROVIDERS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>

        <label style={{ display: 'grid', gap: 'var(--space-1)' }}>
          <span>API key</span>
          <input
            ref={setApiKeyInputRef}
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={state.apiKey}
            placeholder={descriptor?.placeholder ?? 'paste your key…'}
            onChange={(e) => setState((s) => ({ ...s, apiKey: e.target.value }))}
            disabled={inFlight}
            style={{ padding: 'var(--space-2)', borderRadius: 'var(--radius-sm)' }}
            aria-describedby="api-key-help"
          />
          <small id="api-key-help" style={{ color: 'var(--color-text-muted)' }}>
            Stored only on this device unless you explicitly save it to your account.
          </small>
        </label>

        <label style={{ display: 'grid', gap: 'var(--space-1)' }}>
          <span>Vault passphrase</span>
          <input
            type="password"
            autoComplete="new-password"
            value={state.passphrase}
            onChange={(e) => setState((s) => ({ ...s, passphrase: e.target.value }))}
            disabled={inFlight}
            placeholder="min 8 characters"
            style={{ padding: 'var(--space-2)', borderRadius: 'var(--radius-sm)' }}
            aria-describedby="passphrase-help"
          />
          <small id="passphrase-help" style={{ color: 'var(--color-text-muted)' }}>
            Used to derive a per-user encryption key (PBKDF2-SHA256, 100k iterations).
          </small>
        </label>

        {state.message && (
          <div
            role={state.status === 'error' ? 'alert' : 'status'}
            style={{
              padding: 'var(--space-2) var(--space-3)',
              borderRadius: 'var(--radius-sm)',
              background:
                state.status === 'error'
                  ? 'rgba(220, 38, 38, 0.1)'
                  : 'rgba(22, 163, 74, 0.1)',
              color:
                state.status === 'error'
                  ? 'var(--color-danger)'
                  : 'var(--color-success)',
              fontSize: 'var(--fs-sm)',
            }}
          >
            {state.message}
          </div>
        )}

        <div style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'flex-end' }}>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => {
              setState(INITIAL);
              onClose();
            }}
            disabled={inFlight}
          >
            Cancel
          </button>
          <button type="submit" className="btn" disabled={!canSubmit}>
            {state.status === 'submitting'
              ? 'Encrypting…'
              : state.status === 'validating'
                ? 'Validating…'
                : 'Save key'}
          </button>
        </div>
      </form>
    </div>
  );
}