import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './index.css';
import './mobile-ux-overrides.css';
import { TonConnectUIProvider } from '@tonconnect/ui-react';

createRoot(document.getElementById('root')).render(
  <React.StrictMode><TonConnectUIProvider manifestUrl="https://pexoriy-design.mails4dikewills.workers.dev/tonconnect-manifest.json"><App /></TonConnectUIProvider></React.StrictMode>
);