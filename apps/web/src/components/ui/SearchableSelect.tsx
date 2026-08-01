'use client';

import { useEffect, useRef, useState } from 'react';

type Props = {
  label: string;
  value: string;
  options: readonly string[];
  onChange: (value: string) => void;
  required?: boolean;
  error?: string;
  placeholder?: string;
};

export function SearchableSelect({
  label,
  value,
  options,
  onChange,
  required,
  error,
  placeholder = 'Search…',
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setQuery(value);
  }, [value]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const filtered = options.filter((o) => o.toLowerCase().includes(query.toLowerCase()));

  return (
    <label className="block text-sm">
      <span className="text-ink/70">
        {label}
        {required ? ' *' : ''}
      </span>
      <div ref={wrapRef} className="relative mt-1">
        <input
          className={`w-full rounded border px-3 py-2 ${error ? 'border-red-400' : 'border-mist'}`}
          value={query}
          placeholder={placeholder}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            if (options.includes(e.target.value as (typeof options)[number])) {
              onChange(e.target.value);
            }
          }}
          required={required}
        />
        {open && (
          <ul className="absolute z-20 mt-1 max-h-48 w-full overflow-auto rounded border border-mist bg-white shadow-lg text-sm">
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-ink/50">No matches</li>
            ) : (
              filtered.map((opt) => (
                <li key={opt}>
                  <button
                    type="button"
                    className="w-full px-3 py-2 text-left hover:bg-mist/60"
                    onClick={() => {
                      onChange(opt);
                      setQuery(opt);
                      setOpen(false);
                    }}
                  >
                    {opt}
                  </button>
                </li>
              ))
            )}
          </ul>
        )}
      </div>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </label>
  );
}
