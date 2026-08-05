'use client';

import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import type { MouseEvent, KeyboardEvent } from 'react';

interface ProjectBadgeProps {
  projectId?: string;
  projectName?: string | null;
  className?: string;
}

/**
 * Clickable project chip shown on task cards. Opens the project page and uses
 * stopPropagation so the card's own click (open task) does not fire. Renders
 * nothing when either the id or the name is missing (e.g. project deleted).
 */
export function ProjectBadge({ projectId, projectName, className }: ProjectBadgeProps) {
  const { t } = useTranslation();
  const router = useRouter();
  if (!projectId || !projectName) return null;

  const openProject = (e: MouseEvent | KeyboardEvent) => {
    e.stopPropagation();
    router.push(`/projects/${projectId}`);
  };

  return (
    <span
      title={`${projectName} — ${t('projects.openProject', 'Open project')}`}
      role="link"
      tabIndex={0}
      onClick={openProject}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openProject(e);
        }
      }}
      className={`font-medium text-(--text-secondary) bg-(--background-subtle) border border-(--border) px-2 py-0.5 rounded-full truncate cursor-pointer hover:text-blue-500 hover:border-blue-400/50 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-400 ${className ?? ''}`}
    >
      📁 {projectName}
    </span>
  );
}

export default ProjectBadge;
