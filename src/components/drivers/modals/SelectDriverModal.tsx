'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from '@/lib/cssMotion';
import { useTranslation } from 'react-i18next';
import { UserPlus, Search, X, User } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import type { Id } from '@/convex/_generated/dataModel';

interface DriverCandidate {
  _id: Id<'users'>;
  name: string;
  email: string;
  phone?: string;
  department?: string;
  position?: string;
}

interface SelectDriverModalProps {
  candidates: DriverCandidate[];
  onSelect: (driver: DriverCandidate) => void;
  onClose: () => void;
}

export function SelectDriverModal({ candidates, onSelect, onClose }: SelectDriverModalProps) {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');

  const filtered = candidates.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.email.toLowerCase().includes(search.toLowerCase()) ||
      (c.department && c.department.toLowerCase().includes(search.toLowerCase())),
  );

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[999999] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        transition={{ duration: 0.2 }}
        className="w-full max-w-lg bg-(--card) rounded-2xl border border-(--border) shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 border-b border-(--border)">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-(--primary)/10 rounded-xl">
                <UserPlus className="w-5 h-5 text-(--primary)" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-(--text-primary)">
                  {t('driver.selectDriver', 'Select Driver')}
                </h2>
                <p className="text-sm text-(--text-muted)">
                  {t('driver.selectDriverDesc', 'Choose an employee with driver role')}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-(--background-subtle) transition-colors"
            >
              <X className="w-4 h-4 text-(--text-muted)" />
            </button>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-(--text-muted)" />
            <Input
              placeholder={t('common.search', 'Search by name, email, or department...')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        {/* List */}
        <div className="max-h-[400px] overflow-y-auto p-4 space-y-2">
          {filtered.length === 0 ? (
            <div className="text-center py-8 text-(--text-muted)">
              <User className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p className="text-sm">
                {t('driver.noDriverCandidates', 'No employees with driver role found')}
              </p>
              <p className="text-xs mt-1">
                {t('driver.createDriverFirst', 'Create an employee with driver role first')}
              </p>
            </div>
          ) : (
            filtered.map((candidate) => (
              <button
                key={candidate._id}
                onClick={() => onSelect(candidate)}
                className="w-full p-4 rounded-xl border border-(--border) bg-(--background-subtle) hover:border-(--primary) hover:bg-(--primary)/5 transition-all text-left"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-(--primary)/10 flex items-center justify-center flex-shrink-0">
                    <span className="text-sm font-semibold text-(--primary)">
                      {candidate.name
                        .split(' ')
                        .map((n) => n[0])
                        .join('')
                        .toUpperCase()
                        .slice(0, 2)}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-(--text-primary) truncate">{candidate.name}</p>
                    <p className="text-xs text-(--text-muted) truncate">{candidate.email}</p>
                    {candidate.department && (
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="outline" className="text-xs">
                          {candidate.department}
                        </Badge>
                        {candidate.position && (
                          <span className="text-xs text-(--text-muted)">{candidate.position}</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-(--border) bg-(--background-subtle)">
          <p className="text-xs text-(--text-muted) text-center">
            {t('driver.driverCount', '{{count}} employees with driver role', {
              count: candidates.length,
            })}
          </p>
        </div>
      </motion.div>
    </motion.div>,
    document.body,
  );
}
