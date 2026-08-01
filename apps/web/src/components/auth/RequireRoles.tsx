'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getStoredUser, SessionUser } from '@/lib/api';
import { hasAnyRole } from '@/lib/roles';

type Props = {
  roles: string[];
  children: React.ReactNode;
  fallbackHref?: string;
};

/** Client-side route guard — backend APIs still enforce roles independently. */
export function RequireRoles({ roles, children, fallbackHref = '/dashboard' }: Props) {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null | undefined>(undefined);

  useEffect(() => {
    const u = getStoredUser();
    if (!u) {
      router.replace('/');
      return;
    }
    if (!hasAnyRole(u, roles)) {
      router.replace(fallbackHref);
      return;
    }
    setUser(u);
  }, [roles, router, fallbackHref]);

  if (user === undefined) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center text-sm text-ink-400">
        Checking access…
      </div>
    );
  }

  return <>{children}</>;
}
