import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { MyKeysPage } from './MyKeysPage';

const mocks = vi.hoisted(() => ({
  fetchKeys: vi.fn(),
  removeKey: vi.fn(),
  validateKey: vi.fn(),
  keys: [] as Array<{
    id: string;
    provider: string;
    hasKey: boolean;
    isValid: boolean;
    validatedAt: string | null;
  }>,
  isLoading: false,
  isSubmitting: false,
  isValidating: false,
  error: null as string | null,
  validation: {} as Record<string, { status: 'unknown' | 'valid' | 'invalid'; reason: string | null }>,
  clearError: vi.fn(),
  isSubmittingFlag: false,
  isValidatingFlag: false,
}));

vi.mock('./store', () => ({
  useKeyVaultStore: Object.assign(
    (selector: (s: typeof mocks) => unknown) => selector(mocks),
    { getState: () => mocks },
  ),
}));

const ID_OPENAI = '00000000-0000-0000-0000-000000000001';
const ID_ANTHROPIC = '00000000-0000-0000-0000-000000000002';

beforeEach(() => {
  mocks.fetchKeys.mockReset();
  mocks.removeKey.mockReset();
  mocks.validateKey.mockReset();
  mocks.keys = [];
  mocks.isLoading = false;
  mocks.isSubmitting = false;
  mocks.isValidating = false;
  mocks.error = null;
  mocks.validation = {};
  // Default happy path: fetchKeys resolves.
  mocks.fetchKeys.mockResolvedValue(undefined);
  mocks.removeKey.mockResolvedValue(undefined);
  mocks.validateKey.mockResolvedValue({ status: 'valid', reason: null });
});

afterEach(() => {
  vi.restoreAllMocks();
  // confirm dialog is global; restore default confirm behaviour.
  window.confirm = () => true;
});

describe('MyKeysPage', () => {
  it('calls fetchKeys on mount', async () => {
    render(
      <MemoryRouter>
        <MyKeysPage />
      </MemoryRouter>,
    );
    await waitFor(() => expect(mocks.fetchKeys).toHaveBeenCalledTimes(1));
  });

  it('shows an empty state when there are no keys', async () => {
    render(
      <MemoryRouter>
        <MyKeysPage />
      </MemoryRouter>,
    );
    expect(await screen.findByText(/No API keys yet/i)).toBeInTheDocument();
  });

  it('lists stored keys by provider label', async () => {
    mocks.keys = [
      { id: ID_OPENAI, provider: 'openai', hasKey: true, isValid: true, validatedAt: '2026-01-01T00:00:00Z' },
      { id: ID_ANTHROPIC, provider: 'anthropic', hasKey: true, isValid: true, validatedAt: '2026-02-01T00:00:00Z' },
    ];
    render(
      <MemoryRouter>
        <MyKeysPage />
      </MemoryRouter>,
    );
    expect(await screen.findByText('OpenAI')).toBeInTheDocument();
    expect(screen.getByText('Anthropic')).toBeInTheDocument();
  });

  it('shows a loading indicator while fetching', () => {
    mocks.isLoading = true;
    render(
      <MemoryRouter>
        <MyKeysPage />
      </MemoryRouter>,
    );
    expect(screen.getByText(/Loading/)).toBeInTheDocument();
  });

  it('renders an error banner when the store has an error', () => {
    mocks.error = 'Could not load keys';
    render(
      <MemoryRouter>
        <MyKeysPage />
      </MemoryRouter>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent(/Could not load keys/);
  });

  it('opens the AddKeyModal when "Add API key" is clicked', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <MyKeysPage />
      </MemoryRouter>,
    );
    await user.click(screen.getByRole('button', { name: /add api key/i }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('triggers validateKey with the row id when the row Validate button is clicked', async () => {
    const user = userEvent.setup();
    mocks.keys = [
      { id: ID_OPENAI, provider: 'openai', hasKey: true, isValid: true, validatedAt: '2026-01-01T00:00:00Z' },
    ];
    render(
      <MemoryRouter>
        <MyKeysPage />
      </MemoryRouter>,
    );
    await user.click(screen.getByRole('button', { name: /Validate OpenAI/i }));
    // Backend is addressed by UUID id, NOT provider.
    await waitFor(() => expect(mocks.validateKey).toHaveBeenCalledWith(ID_OPENAI));
  });

  it('triggers removeKey with the row id when Delete is confirmed', async () => {
    const user = userEvent.setup();
    mocks.keys = [
      { id: ID_OPENAI, provider: 'openai', hasKey: true, isValid: true, validatedAt: '2026-01-01T00:00:00Z' },
    ];
    window.confirm = vi.fn(() => true);
    render(
      <MemoryRouter>
        <MyKeysPage />
      </MemoryRouter>,
    );
    await user.click(screen.getByRole('button', { name: /Delete OpenAI/i }));
    // Backend is addressed by UUID id, NOT provider.
    await waitFor(() => expect(mocks.removeKey).toHaveBeenCalledWith(ID_OPENAI));
  });

  it('does NOT trigger removeKey when confirm is cancelled', async () => {
    const user = userEvent.setup();
    mocks.keys = [
      { id: ID_OPENAI, provider: 'openai', hasKey: true, isValid: true, validatedAt: '2026-01-01T00:00:00Z' },
    ];
    window.confirm = vi.fn(() => false);
    render(
      <MemoryRouter>
        <MyKeysPage />
      </MemoryRouter>,
    );
    await user.click(screen.getByRole('button', { name: /Delete OpenAI/i }));
    expect(mocks.removeKey).not.toHaveBeenCalled();
  });
});