import './globals.css';
import { AuthProvider } from '@/lib/auth';
import Nav from '@/components/Nav';
import ServiceWorkerRegister from '@/components/ServiceWorkerRegister';

export const metadata = {
  title: 'Executive Portal — RiskTech & Advisory',
  description: 'Executive onboarding and vetting',
  manifest: '/manifest.json',
  icons: { icon: '/icons/icon-192.png', apple: '/icons/icon-192.png' },
};

export const viewport = { themeColor: '#1b3a5c' };

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <AuthProvider>
          <Nav />
          <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
          <footer className="mx-auto max-w-6xl px-4 pb-8 text-xs text-slate-500">
            Proof of concept · synthetic data only · <a className="underline" href="/privacy">Privacy notice (NDPA 2023)</a>
          </footer>
        </AuthProvider>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
