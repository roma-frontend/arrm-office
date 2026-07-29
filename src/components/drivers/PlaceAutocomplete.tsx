'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { MapPin, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ShieldLoader } from '@/components/ui/ShieldLoader';

interface PlaceSuggestion {
  display_name: string;
  lat: string;
  lon: string;
  type: string;
  address?: Record<string, string>;
}

interface PlaceAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  onSelect: (place: { address: string; lat: number; lng: number }) => void;
  placeholder?: string;
  className?: string;
  label?: string;
}

export function PlaceAutocomplete({
  value,
  onChange,
  onSelect,
  placeholder = 'Search for a place...',
  className,
}: PlaceAutocompleteProps) {
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const abortRef = useRef<AbortController | undefined>(undefined);

  // Fetch suggestions from Nominatim
  const fetchSuggestions = useCallback(async (query: string) => {
    if (query.length < 2) {
      setSuggestions([]);
      setIsOpen(false);
      return;
    }

    // Abort previous request
    if (abortRef.current) {
      abortRef.current.abort();
    }
    abortRef.current = new AbortController();

    setIsLoading(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5&addressdetails=1&accept-language=en,ru`,
        {
          signal: abortRef.current.signal,
          headers: { 'User-Agent': 'OfficeApp/1.0' },
        },
      );
      const data: PlaceSuggestion[] = await res.json();
      setSuggestions(data);
      setIsOpen(data.length > 0);
      setHighlightedIndex(-1);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (e: any) {
      if (e.name !== 'AbortError') {
        setSuggestions([]);
        setIsOpen(false);
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Debounced search
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    onChange(val);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSuggestions(val), 350);
  };

  // Select a suggestion
  const handleSelect = (suggestion: PlaceSuggestion) => {
    const shortName = formatAddress(suggestion);
    onChange(shortName);
    onSelect({
      address: shortName,
      lat: parseFloat(suggestion.lat),
      lng: parseFloat(suggestion.lon),
    });
    setSuggestions([]);
    setIsOpen(false);
    inputRef.current?.blur();
  };

  // Format address to shorter form
  const formatAddress = (s: PlaceSuggestion): string => {
    const addr = s.address;
    if (!addr) return s.display_name;

    const parts: string[] = [];
    // Try to build a concise address
    if (addr.road || addr.pedestrian || addr.street) {
      parts.push(addr.road || addr.pedestrian || addr.street || '');
      if (addr.house_number) parts[0] = `${parts[0]} ${addr.house_number}`;
    }
    if (addr.city || addr.town || addr.village) {
      parts.push(addr.city || addr.town || addr.village || '');
    }
    if (addr.country) {
      parts.push(addr.country);
    }

    if (parts.length === 0) return s.display_name;
    // If the place has a specific name (like a business/airport), prepend it
    const name = addr.aeroway || addr.amenity || addr.tourism || addr.building || addr.shop;
    if (name) {
      return `${name}, ${parts.join(', ')}`;
    }
    return parts.join(', ');
  };

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen || suggestions.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev < suggestions.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : suggestions.length - 1));
    } else if (e.key === 'Enter' && highlightedIndex >= 0) {
      e.preventDefault();
      handleSelect(suggestions[highlightedIndex]!);
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  // Close on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Cleanup
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (abortRef.current) abortRef.current.abort();
    };
  }, []);

  const clearInput = () => {
    onChange('');
    setSuggestions([]);
    setIsOpen(false);
    inputRef.current?.focus();
  };

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <div className="relative flex items-center">
        <MapPin className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-(--text-muted) pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (suggestions.length > 0) setIsOpen(true);
          }}
          placeholder={placeholder}
          className={cn(
            'flex h-9 w-full rounded-lg border border-(--input-border) bg-(--input) pl-8 py-1 text-sm text-(--text-primary) shadow-sm transition-colors',
            value || isLoading ? 'pr-9' : 'pr-3',
            'placeholder:text-(--text-muted)',
            'focus:outline-none focus:ring-2 focus:ring-(--ring) focus:border-(--primary)',
          )}
        />
        {isLoading ? (
          <div className="absolute right-0 top-0 bottom-0 flex items-center pr-2.5 pl-3 bg-linear-to-l from-(--input) via-(--input) to-transparent pointer-events-none">
            <ShieldLoader size="xs" variant="inline" />
          </div>
        ) : value ? (
          <div className="absolute right-0 top-0 bottom-0 flex items-center pr-1.5 pl-4 bg-linear-to-l from-(--input) from-60% to-transparent">
            <button
              type="button"
              onClick={clearInput}
              className="p-1 rounded-full text-(--text-muted) hover:text-(--text-primary) hover:bg-(--muted) transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : null}
      </div>

      {/* Dropdown */}
      {isOpen && suggestions.length > 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border border-(--input-border) bg-(--card) shadow-lg overflow-hidden">
          {suggestions.map((s, i) => (
            <button
              key={`${s.lat}-${s.lon}`}
              type="button"
              onClick={() => handleSelect(s)}
              className={cn(
                'w-full text-left px-3 py-2.5 text-sm flex items-start gap-2.5 transition-colors border-b border-(--input-border) last:border-b-0',
                i === highlightedIndex
                  ? 'bg-(--primary)/10 text-(--primary)'
                  : 'text-(--text-primary) hover:bg-(--muted)',
              )}
            >
              <MapPin className="h-4 w-4 mt-0.5 shrink-0 text-(--text-muted)" />
              <div className="min-w-0">
                <div className="font-medium truncate">{formatAddress(s)}</div>
                {s.display_name !== formatAddress(s) && (
                  <div className="text-xs text-(--text-muted) truncate mt-0.5">
                    {s.display_name}
                  </div>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
