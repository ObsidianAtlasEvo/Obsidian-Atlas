import { useEffect, useState } from 'react';

const MOBILE_MAX_WIDTH = 639;

/**
 * True when viewport width is below 640px. Subscribes to `resize`.
 */
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth <= MOBILE_MAX_WIDTH : false
  );

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= MOBILE_MAX_WIDTH);
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return isMobile;
}
