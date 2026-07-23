import { useEffect, useRef } from 'react';

export function useMainRef() {
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    ref.current = document.querySelector<HTMLElement>('main');
  }, []);

  return ref;
}
