/**
 * "My Keys" page — list of stored API keys + delete + validate actions.
 *
 * SECURITY: this view NEVER shows plaintext. Each row is identified only
 * by its provider; the only data shown is the server-returned metadata
 * (`hasKey`, `isValid`, `validatedAt`).
 */

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AddKeyModal,
  PROVIDERS,
  useKeyVaultStore,
  type StoredKeyMeta,
} from './index';

function providerLabel(id: string): string {
  return PROVIDERS.find((p) => p.id === id)?.label ?? id;
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export function MyKeysPage(): JSX.Element {
  const fetchKeys = useKeyVaultStore((s) => s.fetchKeys);
  const removeKey = useKeyVaultStore((s) => s.removeKey);
  const validateKey = useKeyVaultStore((s) => s.validateKey);
  const keys = useKeyVaultStore((s) => s.keys);
  const isLoading = useKeyVaultStore((s) => s.isLoading);
  const isSubmitting = useKeyVaultStore((s) => s.isSubmitting);
  const isValidating = useKeyVaultStore((s) => s.isValidating);
  const error = useKeyVaultStore((s) => s.error);
  const validation = useKeyVaultStore((s) => s.validation);
  const [isModalOpen, setModalOpen] = useState(false);

  // Refresh on mount so navigating in from elsewhere always shows fresh data.
  useEffect(() => {
    void fetchKeys();
  }, [fetchKeys]);

  const sortedKeys = useMemo(
    () => [...keys].sort((a, b) => providerLabel(a.provider).localeCompare(providerLabel(b.provider))),
    [keys],
  );

  async function handleDelete(meta: StoredKeyMeta): Promise<void> {
    const ok = window.confirm(
      `Delete the API key for ${providerLabel(meta.provider)}? ` +
        'This cannot be undone and you will need to re-add it.',
    );
    if (!ok) return;
    try {
      await removeKey(meta.provider);
    } catch (err) {
      // Error is already on the store; nothing else to do here.
      void err;
    }
  }

  async function handleValidate(meta: StoredKeyMeta): Promise<void> {
    await validateKey(meta.provider);
  }

  return (
    <section aria-labelledby="my-keys-heading">
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-4)' }}>
        <div>
          <h1 id="my-keys-heading" style={{ margin: 0 }}>
            My API keys
          </h1>
          <p style={{ margin: 0, color: 'var(--color-text-muted)' }}>
            Bring your own AI provider key. Encrypted on this device before upload.
          </p>
        </div>
        <button type="button" className="btn" onClick={() => setModalOpen(true)}>
          Add API key
        </button>
      </header>

      {error && (
        <div
          role="alert"
          style={{
            background: 'rgba(220, 38, 38, 0.1)',
            color: 'var(--color-danger)',
            padding: 'var(--space-2) var(--space-3)',
            borderRadius: 'var(--radius-sm)',
            marginBottom: 'var(--space-3)',
          }}
        >
          {error}
        </div>
      )}

      {isLoading && sortedKeys.length === 0 ? (
        <p>Loading…</p>
      ) : sortedKeys.length === 0 ? (
        <div
          style={{
            border: '1px dashed var(--color-border)',
            borderRadius: 'var(--radius-md)',
            padding: 'var(--space-6)',
            textAlign: 'center',
            color: 'var(--color-text-muted)',
          }}
        >
          <p>No API keys yet.</p>
          <p style={{ fontSize: 'var(--fs-sm)' }}>
            Add one to start receiving AI voiceovers at tourist spots. You can also configure keys later from{' '}
            <Link to="/settings">Settings</Link>.
          </p>
        </div>
      ) : (
        <table
          aria-label="Stored API keys"
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-md)',
            overflow: 'hidden',
          }}
        >
          <thead>
            <tr style={{ background: 'var(--color-surface-alt)', textAlign: 'left' }}>
              <th style={{ padding: 'var(--space-2) var(--space-3)' }}>Provider</th>
              <th style={{ padding: 'var(--space-2) var(--space-3)' }}>Status</th>
              <th style={{ padding: 'var(--space-2) var(--space-3)' }}>Validated</th>
              <th style={{ padding: 'var(--space-2) var(--space-3)' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {sortedKeys.map((meta) => {
              const v = validation[meta.provider];
              const statusLabel = v?.status ?? 'unknown';
              const reason = v?.reason ?? null;
              return (
                <tr key={meta.provider} style={{ borderTop: '1px solid var(--color-border)' }}>
                  <td style={{ padding: 'var(--space-2) var(--space-3)' }}>{providerLabel(meta.provider)}</td>
                  <td style={{ padding: 'var(--space-2) var(--space-3)' }}>
                    <StatusBadge isValid={meta.isValid} status={statusLabel} reason={reason} />
                  </td>
                  <td style={{ padding: 'var(--space-2) var(--space-3)' }}>{formatDate(meta.validatedAt)}</td>
                  <td style={{ padding: 'var(--space-2) var(--space-3)', display: 'flex', gap: 'var(--space-2)' }}>
                    <button
                      type="button"
                      className="btn btn--ghost"
                      onClick={() => handleValidate(meta)}
                      disabled={isValidating || isSubmitting}
                      aria-label={`Validate ${providerLabel(meta.provider)} key`}
                    >
                      Validate
                    </button>
                    <button
                      type="button"
                      className="btn btn--ghost"
                      onClick={() => handleDelete(meta)}
                      disabled={isSubmitting}
                      style={{ color: 'var(--color-danger)' }}
                      aria-label={`Delete ${providerLabel(meta.provider)} key`}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <AddKeyModal key={isModalOpen ? 'open' : 'closed'} isOpen={isModalOpen} onClose={() => setModalOpen(false)} />
    </section>
  );
}

function StatusBadge({
  isValid,
  status,
  reason,
}: {
  isValid: boolean;
  status: 'unknown' | 'valid' | 'invalid';
  reason: string | null;
}): JSX.Element {
  const label = isValid ? 'Stored' : 'Stored (server says invalid)';
  const tone =
    status === 'valid'
      ? 'var(--color-success)'
      : status === 'invalid'
        ? 'var(--color-danger)'
        : 'var(--color-text-muted)';
  return (
    <span title={reason ?? undefined} style={{ color: tone, fontWeight: 500 }}>
      {label}
    </span>
  );
}