import type { Metadata } from 'next';
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${jakarta.variable}`}>
      <body className="font-sans">
        <PortalShell>{children}</PortalShell>
      </body>
    </html>
  );
}
