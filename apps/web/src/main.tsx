import { SessionQueryProvider } from './components/auth/SessionQueryProvider';
import { MotionConfig } from 'motion/react';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './routes/router';
import './styles/index.css';

// One factory so a cache key is never typed twice (rules.md §6).
export const queryKeys = {
  health: () => ['health'] as const,
  campaigns: () => ['campaigns'] as const,
} as const;

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root element #root is missing from index.html');
}

createRoot(container).render(
  <StrictMode>
    <SessionQueryProvider>
      <MotionConfig reducedMotion="user">
        <App />
      </MotionConfig>
    </SessionQueryProvider>
  </StrictMode>,
);
