import { StrictMode } from 'react'
import './index.css'
import App from './App.tsx'
import ReactGA from "react-ga4";

ReactGA.initialize("G-7DB083YC02");

// Dynamically import react-dom to keep it off the initial JS bundle
// for slightly faster initial parse/download in some cases.
async function mount() {
  const rootEl = document.getElementById('root');
  if (!rootEl) return;
  const { createRoot } = await import('react-dom/client');
  createRoot(rootEl).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void mount();
