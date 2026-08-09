'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

type SelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

type CustomSelectProps = {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  className?: string;
  triggerClassName?: string;
  dropdownClassName?: string;
  disabled?: boolean;
  fullWidth?: boolean;
};

export function CustomSelect({
  value,
  onChange,
  options,
  placeholder,
  className,
  triggerClassName,
  dropdownClassName,
  disabled = false,
  fullWidth = false,
}: CustomSelectProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});

  const selectedLabel = options.find((o) => o.value === value)?.label || placeholder || '';

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const spaceBelow = viewportHeight - rect.bottom;
    const dropdownH = 240;

    const style: React.CSSProperties = {
      position: 'fixed',
      left: rect.left,
      width: rect.width,
    };

    if (spaceBelow >= dropdownH) {
      style.top = rect.bottom + 4;
    } else {
      style.bottom = viewportHeight - rect.top + 4;
    }

    setDropdownStyle(style);
  }, []);

  useEffect(() => {
    if (open) {
      updatePosition();
      window.addEventListener('resize', updatePosition);
      window.addEventListener('scroll', updatePosition, true);
      return () => {
        window.removeEventListener('resize', updatePosition);
        window.removeEventListener('scroll', updatePosition, true);
      };
    }
  }, [open, updatePosition]);

  // Stop pointerdown in capture phase BEFORE Radix Dialog sees it
  useEffect(() => {
    if (!open) return;
    const stopPointerDown = (e: PointerEvent) => {
      if (dropdownRef.current && dropdownRef.current.contains(e.target as Node)) {
        e.stopPropagation();
      }
    };
    document.addEventListener('pointerdown', stopPointerDown, true);
    return () => document.removeEventListener('pointerdown', stopPointerDown, true);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handle = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [open]);

  const handleSelect = (val: string) => {
    onChange(val);
    setOpen(false);
  };

  return (
    <div className={cn('min-w-20 relative inline-block', fullWidth && 'w-full', className)}>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen(!open)}
        className={cn(
          'w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-sm outline-none cursor-pointer transition-all text-[var(--text-primary)]',
          disabled && 'opacity-50 cursor-not-allowed',
          triggerClassName,
        )}
      >
        <span className="truncate">{selectedLabel}</span>
        <ChevronDown
          className={cn('shrink-0 w-4 h-4 transition-transform duration-200', open && 'rotate-180')}
        />
      </button>

      {open &&
        createPortal(
          <div
            ref={dropdownRef}
            className={cn('rounded-lg overflow-hidden shadow-xl', dropdownClassName)}
            style={{
              ...dropdownStyle,
              zIndex: 999999,
              maxHeight: 240,
              overflowY: 'auto',
              // The dropdown is a child of <body>, and a Radix dialog sets
              // `pointer-events: none` there while it is open — everything outside
              // the dialog content is meant to be inert. That made the options
              // visible but unclickable inside every modal: the list opened, and
              // nothing could be picked from it. Opting back in is what makes the
              // portal usable inside a dialog.
              pointerEvents: 'auto',
              background: 'var(--landing-modal-bg, #fff)',
              border: '1px solid var(--landing-card-border, #e5e7eb)',
            }}
          >
            <div className="py-1">
              {options.map((opt) => {
                const isSelected = opt.value === value;
                const isDisabled = opt.disabled;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    disabled={isDisabled}
                    onClick={() => !isDisabled && handleSelect(opt.value)}
                    className="w-full text-left px-3 py-2 text-sm truncate transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{
                      background: isSelected ? 'var(--primary)' : 'transparent',
                      color: isSelected ? '#fff' : 'var(--landing-text-primary, #111827)',
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected && !isDisabled) {
                        (e.target as HTMLElement).style.background =
                          'var(--landing-card-border, #e5e7eb)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected) {
                        (e.target as HTMLElement).style.background = 'transparent';
                      }
                    }}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
