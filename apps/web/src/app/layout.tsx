import type { Metadata } from 'next';
import './globals.css';
import { PortalShell } from '@/components/layout/PortalShell';

export const metadata: Metadata = {
  title: 'HRMS Platform — Enterprise Human Resources',
  description: 'Premium enterprise HRMS & Payroll platform for modern organizations.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <PortalShell>{children}</PortalShell>
      </body>
    </html>
  );
}
