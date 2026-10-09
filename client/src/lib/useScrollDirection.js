import { useEffect, useState } from 'react';

// Tracks scroll intent for the auto-hiding top bar. Returns `true` while the bar
// should be visible: always shown near the top of the page, hidden once the user
// scrolls down past a small threshold, revealed again the moment they scroll up.
// A per-frame rAF guard + a movement threshold keep it from flickering on the
// sub-pixel jitter some trackpads and momentum scrolls produce.
export function useShowOnScroll({ topOffset = 8, threshold = 6 } = {}) {
  const [show, setShow] = useState(true);

  useEffect(() => {
    let last = window.scrollY;
    let ticking = false;

    const update = () => {
      const y = window.scrollY;
      const delta = y - last;
      if (y <= topOffset) {
        setShow(true);              // always reveal at the very top
      } else if (Math.abs(delta) > threshold) {
        setShow(delta < 0);        // up → show, down → hide
      }
      last = y;
      ticking = false;
    };

    const onScroll = () => {
      if (!ticking) {
        ticking = true;
        window.requestAnimationFrame(update);
      }
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [topOffset, threshold]);

  return show;
}
