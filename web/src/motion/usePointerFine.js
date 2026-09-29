import { useEffect, useState } from 'react';

export function usePointerFine() {
  const [fine, setFine] = useState(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia('(pointer: fine)').matches,
  );

  useEffect(() => {
    const mq = window.matchMedia('(pointer: fine)');
    const onChange = (e) => setFine(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return fine;
}
