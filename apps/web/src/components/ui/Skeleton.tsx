'use client';

type SkeletonProps = {
  className?: string;
};

export function Skeleton({ className = '' }: SkeletonProps) {
  return <div className={`bg-ink-100/90 animate-pulse rounded-2xl ${className}`} />;
}

export function SkeletonLine({ className = '' }: SkeletonProps) {
  return <div className={`bg-ink-100/90 animate-pulse rounded-xl ${className}`} />;
}

