import { useEffect } from "react";

// creates the wavesurfer instance on mount, wires horizontal wheel on the
// waveform to nudge, and tears everything down on unmount
export function usePlayerMount(containerRef, actions) {
  useEffect(() => {
    actions.ensurePlayer();

    const el = containerRef.current;
    const THRESHOLD = 100;
    let acc = 0;
    const onWheel = (e) => {
      const dx = e.deltaX || (e.shiftKey ? e.deltaY : 0);
      if (!dx) return;
      e.preventDefault();
      acc += dx;
      while (acc <= -THRESHOLD) {
        actions.hop(1);
        acc += THRESHOLD;
      }
      while (acc >= THRESHOLD) {
        actions.hop(-1);
        acc -= THRESHOLD;
      }
    };
    if (el && el.addEventListener) {
      el.addEventListener("wheel", onWheel, { passive: false });
    }

    return () => {
      if (el && el.removeEventListener) {
        el.removeEventListener("wheel", onWheel);
      }
      actions.teardown();
    };
  }, [actions, containerRef]);
}
