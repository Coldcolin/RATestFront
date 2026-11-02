'use client';

import { useEffect } from 'react';

// Production only: in `next dev` the cached shell would serve stale code during development.
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV === 'production' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch((err) => console.error('SW registration failed', err));
    }
  }, []);
  return null;
}
