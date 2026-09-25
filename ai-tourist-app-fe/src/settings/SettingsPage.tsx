import { Link } from 'react-router-dom';
import { useKeyVaultStore } from '../keyvault';

/**
 * Settings hub. API key vault card links to the dedicated My Keys page
 * (Epic 2 / Issue 2.2). Threshold / logout land here in later sprints.
 */
export function SettingsPage(): JSX.Element {
  const keyCount = useKeyVaultStore((s) => s.keys.length);

  return (
    <section aria-labelledby="settings-heading">
      <h1 id="settings-heading">Settings</h1>
      <div
        style={{
          display: 'grid',
          gap: 'var(--space-4)',
          gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
          marginTop: 'var(--space-4)',
        }}
      >
        <Link
          to="/keys"
          style={{
            display: 'block',
            padding: 'var(--space-4)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-md)',
            background: 'var(--color-surface)',
            color: 'var(--color-text)',
          }}
          aria-label="Open API key vault"
        >
          <h2 style={{ margin: 0 }}>API key vault</h2>
          <p style={{ color: 'var(--color-text-muted)', margin: 'var(--space-2) 0 0' }}>
            {keyCount === 0
              ? 'No API keys yet. Add an OpenAI / Anthropic / Google AI / xAI key to enable AI voiceovers.'
              : `${keyCount} key${keyCount === 1 ? '' : 's'} stored on this device.`}
          </p>
        </Link>
        <div
          style={{
            padding: 'var(--space-4)',
            border: '1px dashed var(--color-border)',
            borderRadius: 'var(--radius-md)',
            color: 'var(--color-text-muted)',
          }}
        >
          <h2 style={{ margin: 0 }}>Geofence threshold</h2>
          <p style={{ margin: 'var(--space-2) 0 0' }}>Per-group 10 km default — configurable in Epic 5.</p>
        </div>
      </div>
    </section>
  );
}