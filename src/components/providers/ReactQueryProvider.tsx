'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { useState } from 'react';

/**
 * React Query Provider для кэширования данных
 *
 * NOTE: Convex has its own real-time subscription system.
 * React Query is used here for additional client-side caching
 * of API route responses (not Convex queries which use useQuery directly).
 *
 * Optimized staleTime values:
 * - Static data (org settings, profiles): 10 minutes
 * - Semi-static (leave lists, task lists): 2 minutes
 * - Real-time (attendance, chat): 0 seconds (use Convex directly)
 */
export function ReactQueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Stale time: increased from 30s to 2min for HR data
            staleTime: 2 * 60 * 1000,
            // GC time: reduced from 5min to 3min to free memory faster
            gcTime: 3 * 60 * 1000,
            // Количество повторных попыток при ошибке
            retry: 2,
            // Задержка между повторными попытками
            retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
            // Refetch on window focus disabled — Convex handles real-time updates
            refetchOnWindowFocus: false,
          },
          mutations: {
            // При мутациях не ждём stale time
            gcTime: 0,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      {/* Devtools только в development режиме.
          Кнопка девтулзов — position: fixed в правом нижнем углу, то есть ровно
          там, где на телефоне стоит мобильный док. Прячем её ниже lg, чтобы она
          не перекрывала навигацию (родитель с display:none убирает и fixed
          потомков). */}
      {process.env.NODE_ENV === 'development' && (
        <div className="hidden lg:block">
          <ReactQueryDevtools initialIsOpen={false} />
        </div>
      )}
    </QueryClientProvider>
  );
}
