import { useEffect, useRef } from "react";
import { useExperience } from "../experience/experience-context";
import { BOOM_EVENT, type BoomDetail } from "./flight-store";

/**
 * Visual half of the sonic boom: a pressure ring that bursts from the nose as
 * the reel reaches Supersonic, with or without sound. Skipped under reduced motion.
 */
export function ShockRing() {
  const { reduced } = useExperience();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (reduced) return;
    const el = ref.current;
    if (!el) return;
    const onBoom = (ev: Event) => {
      const d = (ev as CustomEvent<BoomDetail>).detail;
      el.style.setProperty("--x", `${d.x.toFixed(1)}px`);
      el.style.setProperty("--y", `${d.y.toFixed(1)}px`);
      el.classList.remove("is-on");
      // restart the animation
      void el.offsetWidth;
      el.classList.add("is-on");
    };
    window.addEventListener(BOOM_EVENT, onBoom);
    return () => window.removeEventListener(BOOM_EVENT, onBoom);
  }, [reduced]);

  return (
    <div ref={ref} className="shock-ring" aria-hidden="true">
      <i />
      <i />
    </div>
  );
}
