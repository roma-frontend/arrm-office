'use client';

/**
 * Project edit in a slide-over, opened from the Edit button on the project
 * detail page.
 *
 * Same pattern as the task wizard and organization edit sheets: the project
 * page stays put, the form arrives from the edge, and closing it costs no
 * re-orientation. The project document comes from the parent's own liv query,
 * so the form opens instantly — a save closes the panel and the detail page
 * updates in place.
 */

import React from 'react';
import dynamic from 'next/dynamic';
import { useTranslation } from 'react-i18next';

import { DetailSheet } from '@/components/ui/detail-sheet';
import { ShieldLoader } from '@/components/ui/ShieldLoader';
import type { ProjectEditFormProps } from '@/components/projects/ProjectEditForm';

const ProjectEditForm = dynamic(
  () => import('@/components/projects/ProjectEditForm').then((m) => m.ProjectEditForm),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-64 items-center justify-center">
        <ShieldLoader size="md" />
      </div>
    ),
  },
);

export interface ProjectEditSheetProps {
  open: boolean;
  onClose: () => void;
  /** The live project document from the parent's query. */
  project: ProjectEditFormProps['project'] | null;
}

export function ProjectEditSheet({ open, onClose, project }: ProjectEditSheetProps) {
  const { t } = useTranslation();

  return (
    <DetailSheet
      open={open}
      onClose={onClose}
      size="lg"
      title={t('projects.editTitle', 'Edit Project')}
      {...(project ? { deepLink: `/projects/${project._id}` } : {})}
    >
      {open && project && <ProjectEditForm project={project} onDone={onClose} />}
    </DetailSheet>
  );
}

export default ProjectEditSheet;
