'use client';

import React from 'react';
import { useTranslation } from 'react-i18next';
import { Sparkles, ChevronDown, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { AGENTS, type AgentType } from '@/lib/ai/agents';

interface AgentSelectorProps {
  selectedAgent: AgentType;
  onSelect: (agent: AgentType) => void;
  disabled?: boolean;
}

const AGENT_COLORS: Record<string, string> = {
  recruitment: '#3b82f6',
  policy: '#f59e0b',
  analytics: '#10b981',
  kpi: '#8b5cf6',
  general: '#64748b',
};

export default function AgentSelector({
  selectedAgent,
  onSelect,
  disabled = false,
}: AgentSelectorProps) {
  const { t } = useTranslation();
  const activeAgent = AGENTS.find((a) => a.id === selectedAgent) ?? AGENTS[4]!;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={disabled}
          className="relative gap-1.5 h-8 px-2.5 text-xs font-medium transition-all duration-200 hover:shadow-sm"
        >
          <span className="text-sm">{activeAgent.icon}</span>
          <span className="hidden sm:inline text-xs">
            {t(`aiAgent.${activeAgent.id}`, activeAgent.shortName)}
          </span>
          {activeAgent.id !== 'general' && (
            <span
              className="flex h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: AGENT_COLORS[activeAgent.id] ?? '#64748b' }}
            />
          )}
          <ChevronDown className="w-3 h-3 text-(--text-muted)" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-60" align="end">
        <DropdownMenuLabel className="text-xs font-medium text-(--text-muted) px-3 py-2">
          {t('aiAgent.select', 'Select AI Agent')}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {AGENTS.map((agent) => {
          const isActive = selectedAgent === agent.id;
          const color = AGENT_COLORS[agent.id] ?? '#64748b';
          return (
            <DropdownMenuItem
              key={agent.id}
              onClick={() => onSelect(agent.id)}
              className={`flex items-start gap-3 px-3 py-2.5 cursor-pointer ${
                isActive ? 'bg-(--accent)/10' : ''
              }`}
            >
              {/* Icon */}
              <div
                className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-sm"
                style={{
                  backgroundColor: isActive ? `${color}15` : 'transparent',
                  border: `1px solid ${color}30`,
                }}
              >
                {agent.icon}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium">
                    {t(`aiAgent.${agent.id}`, agent.shortName)}
                  </span>
                  {isActive && <Check className="w-3 h-3 shrink-0" style={{ color }} />}
                </div>
                <p className="text-[10px] text-(--text-muted) mt-0.5 leading-relaxed">
                  {t(`aiAgent.${agent.id}Desc`, agent.description)}
                </p>
              </div>
            </DropdownMenuItem>
          );
        })}
        <DropdownMenuSeparator />
        <div className="px-3 py-1.5">
          <p className="text-[9px] text-(--text-muted) text-center">
            {t('aiAgent.hint', 'Specialized agents for domain-specific tasks')}
          </p>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
