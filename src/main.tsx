import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import {registerServiceWorker} from './lib/pwa';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Makes the app installable (Chrome's Install, iOS Add to Home Screen).
registerServiceWorker();
