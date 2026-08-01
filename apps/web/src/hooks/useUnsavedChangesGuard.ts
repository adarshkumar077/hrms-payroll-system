'use client';

import { useCallback, useEffect, useState } from 'react';

type Options = {
  isDirty: boolean;
  onSave: () => Promise<boolean | void>;
  onDiscard: () => void;
};

export function useUnsavedChangesGuard({ isDirty, onSave, onDiscard }: Options) {
  const [showDialog, setShowDialog] = useState(false);
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (!isDirty) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  useEffect(() => {
    if (!isDirty) return;
    const onClick = (e: MouseEvent) => {
      const anchor = (e.target as HTMLElement).closest('a[href]') as HTMLAnchorElement | null;
      if (!anchor || anchor.target === '_blank') return;
      const href = anchor.getAttribute('href');
      if (!href || href.startsWith('#') || href.startsWith('mailto:')) return;
      if (href === window.location.pathname) return;
      e.preventDefault();
      setPendingHref(href);
      setShowDialog(true);
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [isDirty]);

  const confirmLeave = useCallback(async (action: 'save' | 'discard' | 'cancel') => {
    if (action === 'cancel') {
      setShowDialog(false);
      setPendingHref(null);
      return;
    }
    if (action === 'discard') {
      onDiscard();
      setShowDialog(false);
      if (pendingHref) window.location.href = pendingHref;
      setPendingHref(null);
      return;
    }
    const ok = await onSave();
    if (ok === false) return;
    setShowDialog(false);
    if (pendingHref) window.location.href = pendingHref;
    setPendingHref(null);
  }, [onDiscard, onSave, pendingHref]);

  return { showDialog, confirmLeave, setShowDialog };
}
