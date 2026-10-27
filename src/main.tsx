import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { setWorkerUrl } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';
import './styles/app.css';
import './styles/markers.css';

// Bundle the v6 worker through Vite, including its module imports.
setWorkerUrl(workerUrl);

const root = document.getElementById('root');
if (!root) throw new Error('React root element is missing.');
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
