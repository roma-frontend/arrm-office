'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';

/**
 * /goals/[id]/edit — redirects to the goal detail page.
 * The edit form is now a sheet opened from the detail view.
 */
export default function GoalEditPage() {
  const params = useParams();
  const router = useRouter();

  useEffect(() => {
    router.replace(`/goals/${params.id}`);
  }, [params.id, router]);

  return null;
}
