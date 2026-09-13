import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import {registerServiceWorker} from './lib/pwa';
import {startPerfReport} from './lib/perfMarks';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Opt-in boot-waterfall summary (?perf=1); see lib/perfMarks.ts.
startPerfReport();

// Makes the app installable (Chrome's Install, iOS Add to Home Screen).
registerServiceWorker();
