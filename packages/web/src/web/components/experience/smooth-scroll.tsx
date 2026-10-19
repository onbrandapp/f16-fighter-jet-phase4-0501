import Lenis from "lenis";
import "lenis/dist/lenis.css";
import { useEffect } from "react";

/**
 * Page-wide inertial wheel scrolling (Lenis). The page still scrolls natively
 * underneath — Lenis only eases wheel input — so sticky sections, scroll
 * listeners and IntersectionObservers keep working unchanged. Touch keeps the
 * platform's own momentum.
 *
 * The hero owns the wheel while it is engaged: its listener runs in the
 * capture phase and calls preventDefault, and Lenis skips any event that has
 * already been claimed.
 */
let lenis: Lenis | null = null;

export const getLenis = () => lenis;

/** true while the page is at (or heading for) the very top */
export const atTop = () => window.scrollY <= 1 && (lenis ? lenis.targetScroll <= 1 : true);

export function smoothScrollTo(target: HTMLElement | number, opts: { immediate?: boolean } = {}) {
  if (lenis) {
    lenis.scrollTo(target, opts.immediate ? { immediate: true } : { duration: 1.25, easing: (t) => 1 - (1 - t) ** 4 });
    return;
  }
  const behavior: ScrollBehavior = opts.immediate ? "auto" : "smooth";
  if (typeof target === "number") window.scrollTo({ top: target, behavior });
  else target.scrollIntoView({ behavior, block: "start" });
}

/** mounts page-wide smooth scrolling unless reduced motion is on */
export function SmoothScroll({ reduced }: { reduced: boolean }) {
  useSmoothScroll(!reduced);
  return null;
}

export function useSmoothScroll(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const l = new Lenis({
      autoRaf: true,
      lerp: 0.085,
      wheelMultiplier: 1,
      smoothWheel: true,
      syncTouch: false,
      respectReducedMotion: false, // the site's own reduced-motion switch decides
      // wheel already claimed (hero camera) or page locked while loading
      virtualScroll: ({ event }) =>
        !event.defaultPrevented && !document.documentElement.classList.contains("is-locked"),
      // let dialogs and text areas scroll themselves
      prevent: (node) => node.tagName === "DIALOG" || node.tagName === "TEXTAREA",
    });
    lenis = l;
    return () => {
      l.destroy();
      if (lenis === l) lenis = null;
    };
  }, [enabled]);
}
