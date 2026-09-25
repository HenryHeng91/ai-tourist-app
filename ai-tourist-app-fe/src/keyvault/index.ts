/**
 * Public surface of the key vault module.
 * Re-exports the API, store, crypto helpers, types, and UI components.
 */

export * from './types';
export * from './crypto';
export * from './api';
export * from './validate';
export * from './saltStore';
export * from './keyHolder';
export * from './store';
export { AddKeyModal } from './AddKeyModal';
export { MyKeysPage } from './MyKeysPage';
export { useKeyVaultStore, addKeyAndHold, validateHeldKey } from './store';
export type { KeyVaultState, ProviderValidationState, AddKeyInput, ValidationStatus } from './store';