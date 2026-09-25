import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AppRouter } from './core/router';
import { bootstrapAuth } from './auth/store';
import './theme.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element #root not found in document.');
}

// Fire-and-forget: bootstrapAuth refreshes stored tokens (if any) and
// verifies them against /auth/me so a hard reload keeps the user signed
// in. The store's `isBootstrapping` flips to false on completion.
void bootstrapAuth();

createRoot(rootElement).render(
  <StrictMode>
    <BrowserRouter
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <AppRouter />
    </BrowserRouter>
  </StrictMode>,
);
