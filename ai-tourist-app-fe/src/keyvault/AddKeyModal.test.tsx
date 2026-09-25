import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AddKeyModal } from './AddKeyModal';

// vi.mock factories hoist to the top of the file. We must reference only
// `vi.hoisted` values inside them.
const mocks = vi.hoisted(() => ({
  addKey: vi.fn(),
  clearError: vi.fn(),
  validateHeldKey: vi.fn(),
  isSubmitting: false,
  isValidating: false,
}));

vi.mock('./store', () => {
  const addKeyFn = (...args: unknown[]) => mocks.addKey(...args);
  const clearErrorFn = (...args: unknown[]) => mocks.clearError(...args);
  return {
    useKeyVaultStore: Object.assign(
      (selector: (s: {
        isSubmitting: boolean;
        isValidating: boolean;
        addKey: (...args: unknown[]) => unknown;
        clearError: () => void;
      }) => unknown) =>
        selector({
          isSubmitting: mocks.isSubmitting,
          isValidating: mocks.isValidating,
          addKey: addKeyFn,
          clearError: clearErrorFn,
        }),
      {
        getState: () => ({
          addKey: addKeyFn,
          clearError: clearErrorFn,
        }),
      },
    ),
    addKeyAndHold: vi.fn(),
    validateHeldKey: (...args: unknown[]) => mocks.validateHeldKey(...args),
  };
});

beforeEach(() => {
  mocks.addKey.mockReset();
  mocks.clearError.mockReset();
  mocks.validateHeldKey.mockReset();
  mocks.isSubmitting = false;
  mocks.isValidating = false;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('AddKeyModal', () => {
  it('renders nothing when closed', () => {
    const { container } = render(<AddKeyModal isOpen={false} onClose={() => {}} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders provider, key and passphrase fields when open', () => {
    render(<AddKeyModal isOpen onClose={() => {}} />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /provider/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/^API key/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Vault passphrase/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save key/i })).toBeInTheDocument();
  });

  it('masks the API key input (type=password)', () => {
    render(<AddKeyModal isOpen onClose={() => {}} />);
    const keyInput = screen.getByLabelText(/^API key/i);
    expect((keyInput as HTMLInputElement).type).toBe('password');
  });

  it('disables the submit button until both key and passphrase are long enough', () => {
    render(<AddKeyModal isOpen onClose={() => {}} />);
    const submit = screen.getByRole('button', { name: /save key/i });
    const apiInput = screen.getByLabelText(/^API key/i) as HTMLInputElement;
    const passInput = screen.getByLabelText(/Vault passphrase/i) as HTMLInputElement;

    expect(submit).toBeDisabled();

    act(() => {
      fireEvent.change(apiInput, { target: { value: 'sk-test' } });
    });
    expect(apiInput.value).toBe('sk-test');
    expect(submit).toBeDisabled();

    act(() => {
      fireEvent.change(passInput, { target: { value: 'short' } });
    });
    expect(passInput.value).toBe('short');
    expect(submit).toBeDisabled();

    act(() => {
      fireEvent.change(passInput, { target: { value: 'shortlongenough' } });
    });
    expect(passInput.value).toBe('shortlongenough');
    expect(submit).not.toBeDisabled();
  });

  it('closes when Cancel is clicked', () => {
    const onClose = vi.fn();
    render(<AddKeyModal isOpen onClose={onClose} />);
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('invokes addKey with the form values and calls onAdded on success', async () => {
    const onAdded = vi.fn();
    const onClose = vi.fn();
    mocks.addKey.mockResolvedValueOnce({
      id: '00000000-0000-0000-0000-000000000001',
      provider: 'openai',
      hasKey: true,
      isValid: true,
      validatedAt: new Date().toISOString(),
    });
    mocks.validateHeldKey.mockResolvedValueOnce({ status: 'valid', reason: null });

    render(<AddKeyModal isOpen onClose={onClose} onAdded={onAdded} />);

    act(() => {
      fireEvent.change(screen.getByRole('combobox', { name: /provider/i }), {
        target: { value: 'anthropic' },
      });
      fireEvent.change(screen.getByLabelText(/^API key/i), {
        target: { value: 'sk-ant-test-1234567890' },
      });
      fireEvent.change(screen.getByLabelText(/Vault passphrase/i), {
        target: { value: 'correcthorse' },
      });
    });
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /save key/i }));
    });

    await waitFor(() =>
      expect(mocks.addKey).toHaveBeenCalledWith({
        provider: 'anthropic',
        plaintext: 'sk-ant-test-1234567890',
        passphrase: 'correcthorse',
      }),
    );
    await waitFor(() =>
      expect(mocks.validateHeldKey).toHaveBeenCalledWith('anthropic', 'sk-ant-test-1234567890'),
    );
    expect(onAdded).toHaveBeenCalledTimes(1);
  });

  it('surfaces an error message when addKey throws', async () => {
    mocks.addKey.mockRejectedValueOnce(new Error('upload failed'));

    render(<AddKeyModal isOpen onClose={() => {}} />);
    act(() => {
      fireEvent.change(screen.getByLabelText(/^API key/i), { target: { value: 'sk-test' } });
      fireEvent.change(screen.getByLabelText(/Vault passphrase/i), {
        target: { value: 'correcthorse' },
      });
    });
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /save key/i }));
    });

    expect(await screen.findByRole('alert')).toHaveTextContent(/upload failed/);
  });
});