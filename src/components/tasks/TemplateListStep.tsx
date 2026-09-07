'use client';

import { useState } from 'react';
import { useWizardContext } from '@/components/ui/wizard';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, X } from 'lucide-react';

interface TemplateItem {
  title: string;
  priority?: string;
}

/**
 * A wizard step that manages a dynamic list of template items (subtasks or
 * checklist entries). Each item is a simple title with an optional priority.
 *
 * The list is stored under `field` in the wizard data as a TemplateItem[].
 */
export function TemplateListStep({
  field,
  label,
  placeholder,
  addLabel,
  showPriority = false,
}: {
  field: string;
  label: string;
  placeholder: string;
  addLabel: string;
  showPriority?: boolean;
}) {
  const { stepData, updateStepData } = useWizardContext();
  const items: TemplateItem[] = (() => {
    const raw: unknown = stepData[field];
    if (Array.isArray(raw)) return raw as TemplateItem[];
    if (typeof raw === 'string') {
      try {
        const parsed: unknown = JSON.parse(raw);
        return Array.isArray(parsed) ? (parsed as TemplateItem[]) : [];
      } catch {
        return [];
      }
    }
    return [];
  })();
  const [newTitle, setNewTitle] = useState('');
  const [newPriority, setNewPriority] = useState('medium');

  const addItem = () => {
    const title = newTitle.trim();
    if (!title) return;
    const newItem: TemplateItem = { title };
    if (showPriority && newPriority) newItem.priority = newPriority;
    updateStepData(field, JSON.stringify([...items, newItem]));
    setNewTitle('');
    setNewPriority('medium');
  };

  const removeItem = (index: number) => {
    updateStepData(field, JSON.stringify(items.filter((_, i) => i !== index)));
  };

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium">{label}</p>

      {items.length > 0 && (
        <div className="space-y-1.5">
          {items.map((item, i) => (
            <div key={i} className="flex items-center gap-2 group">
              <span className="w-4 h-4 rounded border border-(--border) shrink-0" />
              <span className="text-sm flex-1 min-w-0 truncate">{item.title}</span>
              {showPriority && item.priority && item.priority !== 'medium' && (
                <Badge variant="secondary" className="text-xs shrink-0">
                  {item.priority}
                </Badge>
              )}
              <button
                type="button"
                onClick={() => removeItem(i)}
                className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <Input
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder={placeholder}
          className="flex-1"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addItem();
            }
          }}
        />
        {showPriority && (
          <Select value={newPriority} onValueChange={setNewPriority}>
            <SelectTrigger className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="low">Low</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="urgent">Urgent</SelectItem>
            </SelectContent>
          </Select>
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addItem}
          className="gap-1 shrink-0"
        >
          <Plus className="h-3.5 w-3.5" />
          {addLabel}
        </Button>
      </div>
    </div>
  );
}
