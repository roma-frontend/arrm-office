/**
 * Typed Convex helpers.
 *
 * Re-exports `useQuery` / `useMutation` from `convex/react` unchanged
 * (preserving Convex's full overload-based type inference) and provides
 * a small `useTypedQuery<T>()` helper for cases where you want to pass
 * an explicit return type.
 *
 * Usage:
 *   import { useQuery, useMutation } from '@/lib/convex-typed';
 *   const objectives = useQuery(api.goals.listObjectives, { … });
 *   // objectives is fully typed via Convex's FunctionReference inference
 *
 *   // When TypeScript can't infer the type (e.g. with 'skip'):
 *   import { useTypedQuery } from '@/lib/convex-typed';
 *   const items = useTypedQuery<ItemType[]>(api.items.list, condition ? { … } : 'skip');
 */

import { useQuery, useMutation, useConvex, usePaginatedQuery, useAction } from 'convex/react';

// Re-export unchanged — preserves Convex's overload-based type inference.
export { useQuery, useMutation, useConvex, usePaginatedQuery, useAction };

/**
 * Light wrapper for when you need an explicit return type.
 * Does NOT attempt to re-implement Convex's overload resolution
 * (that would lose type inference); instead it simply casts the
 * original result.
 *
 * Prefer plain `useQuery` whenever inference works on its own.
 *
 * @example
 *   const items = useTypedQuery<string[]>(
 *     api.items.list,
 *     condition ? { orgId } : 'skip',
 *   );
 */
export function useTypedQuery<T>(
  query: Parameters<typeof useQuery>[0],
  ...args: Parameters<typeof useQuery> extends [unknown, ...infer Rest] ? Rest : never
): T {
  return useQuery(query, ...args) as unknown as T;
}
