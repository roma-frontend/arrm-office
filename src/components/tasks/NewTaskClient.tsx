'use client';

import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { useQuery } from 'convex/react';
import { ArrowLeft, Target } from 'lucide-react';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CreateTaskWizard } from './CreateTaskWizard';

interface NewTaskClientProps {
  userId: string;
  userRole: 'superadmin' | 'admin' | 'supervisor' | 'employee' | 'driver';
  /** Present when the page was opened from an objective ("Add task" on a goal). */
  objectiveId?: Id<'objectives'>;
}

/**
 * Standalone task creation page. It exists because "Add task" on a goal links
 * to /tasks/new?objectiveId=… — without this route the request fell through to
 * /tasks/[id] and Convex rejected "new" as a task id.
 */
export function NewTaskClient({ userId, userRole, objectiveId }: NewTaskClientProps) {
  const router = useRouter();
  const { t } = useTranslation();

  const objective = useQuery(api.goals.getObjective, objectiveId ? { objectiveId } : 'skip');

  // Drivers have no task-creation surface anywhere in the app; keep it that way
  // rather than rendering a wizard whose mutation would be rejected.
  const canCreate = userRole !== 'driver';
  const wizardRole = userRole as 'admin' | 'supervisor' | 'employee' | 'superadmin';

  // Back to where the user came from: the goal that requested the task, or the
  // task board otherwise.
  const goBack = () => router.push(objectiveId ? `/goals/${objectiveId}` : '/tasks');

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={goBack} aria-label={t('actions.back')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold md:text-2xl">{t('task.createTask')}</h1>
          {objectiveId && (
            <p className="mt-0.5 flex items-center gap-1.5 truncate text-sm text-muted-foreground">
              <Target className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">
                {objective?.title ?? t('goals.linkedObjective', 'Linked objective')}
              </span>
            </p>
          )}
        </div>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{t('taskWizard.steps.details.title')}</CardTitle>
          <CardDescription>{t('taskWizard.steps.details.description')}</CardDescription>
        </CardHeader>
        <CardContent>
          {canCreate && userId ? (
            <CreateTaskWizard
              currentUserId={userId as Id<'users'>}
              userRole={wizardRole}
              objectiveId={objectiveId}
              // A goal-scoped draft: sharing "create-task" with the board wizard
              // would let a stale draft overwrite the objective link.
              draftKey={objectiveId ? `create-task:objective:${objectiveId}` : 'create-task'}
              onComplete={goBack}
              onCancel={goBack}
            />
          ) : (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {t('task.noPermission', 'You do not have permission to create tasks')}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default NewTaskClient;
