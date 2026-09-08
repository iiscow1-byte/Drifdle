import { jsx as _jsx } from "react/jsx-runtime";
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import { SessionProvider } from './lib/store.tsx';
import './styles/app.css';
const root = document.getElementById('root');
if (!root)
    throw new Error('missing #root');
createRoot(root).render(_jsx(StrictMode, { children: _jsx(SessionProvider, { children: _jsx(App, {}) }) }));
