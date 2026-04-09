import React from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import { bootstrapAtlas } from './store/useAtlasStore';

// Wire up auth listener + IDB hydration before first render
bootstrapAtlas();

const root = document.getElementById('root');
if (!root) throw new Error('Root element #root not found');

createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
