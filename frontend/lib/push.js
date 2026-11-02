import { api } from './api';

const urlBase64ToUint8Array = (b64) => {
  const padded = (b64 + '='.repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
};

export function pushSupport() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) return 'unsupported';
  if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) return 'unconfigured';
  return Notification.permission; // 'default' | 'granted' | 'denied'
}

/** Asks permission, subscribes through the service worker, and registers the subscription with the API. */
export async function enablePush() {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission;
  const reg = await navigator.serviceWorker.ready;
  const sub =
    (await reg.pushManager.getSubscription()) ||
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY),
    }));
  await api('/push/subscribe', { method: 'POST', body: sub.toJSON() });
  return 'granted';
}
