import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { Inter, Plus_Jakarta_Sans } from 'next/font/google';
import './globals.css';
import { PortalShell } from '@/components/layout/PortalShell';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-sans',
  preload: true,
});

const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-display',
  preload: true,
  weight: ['500', '600', '700', '800'],
});

export const metadata: Metadata = {
  title: 'HRMS Platform — Enterprise Human Resources',
  description: 'Premium enterprise HRMS & Payroll platform for modern organizations.',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Reading request headers opts every page into dynamic rendering, which the per-request CSP
  // nonce from middleware.ts requires (static HTML would carry no nonce and be blocked).
  await headers();
  return (
    <html lang="en" className={`${inter.variable} ${jakarta.variable}`}>
      <body className="font-sans">
        <PortalShell>{children}</PortalShell>
      </body>
    </html>
  );
}
