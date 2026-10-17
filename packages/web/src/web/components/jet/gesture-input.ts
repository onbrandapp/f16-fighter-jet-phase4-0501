// Turns wheel / trackpad / touch / keyboard input into discrete "step" intents.
//
// Rules:
//  - one deliberate gesture => exactly one step
//  - while the host reports busy (camera moving), every event is discarded
//  - after a step fires, input stays disarmed until the wheel has been quiet
//    for QUIET_MS — this swallows trackpad inertia / Magic Mouse momentum that
//    continues long after the fingers lift, so a fresh gesture is required

export type StepHandler = (dir: 1 | -1, source: "wheel" | "touch" | "key") => void;

const QUIET_MS = 240;
const WHEEL_THRESHOLD = 38; // px of intent within a gesture before it counts
const TOUCH_THRESHOLD = 46;

export function attachGestureInput(
  target: HTMLElement,
  isBusy: () => boolean,
  onStep: StepHandler,
): () => void {
  let armed = true;
  let lastWheel = 0;
  let accum = 0;
  let quietTimer: number | undefined;

  const scheduleRearm = () => {
    window.clearTimeout(quietTimer);
    quietTimer = window.setTimeout(function check() {
      // still moving? keep waiting — we only re-arm once settled AND quiet
      if (isBusy()) {
        quietTimer = window.setTimeout(check, 60);
        return;
      }
      if (performance.now() - lastWheel >= QUIET_MS) {
        armed = true;
        accum = 0;
      } else {
        quietTimer = window.setTimeout(check, 60);
      }
    }, QUIET_MS);
  };

  const fire = (dir: 1 | -1, source: "wheel" | "touch" | "key") => {
    armed = false;
    accum = 0;
    onStep(dir, source);
    scheduleRearm();
  };

  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const now = performance.now();
    const gap = now - lastWheel;
    lastWheel = now;
    if (!armed || isBusy()) {
      // wheel activity while moving or disarmed postpones re-arming (momentum tail)
      armed = false;
      scheduleRearm();
      return;
    }
    if (gap > 400) accum = 0;
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? window.innerHeight : 1;
    const dy = (Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX) * unit;
    accum += dy;
    if (Math.abs(accum) >= WHEEL_THRESHOLD) fire(accum > 0 ? 1 : -1, "wheel");
  };

  // touch: one swipe per touch sequence
  let touchStartY = 0;
  let touchStartX = 0;
  let touchUsed = false;
  const onTouchStart = (e: TouchEvent) => {
    const t = e.touches[0];
    if (!t) return;
    touchStartY = t.clientY;
    touchStartX = t.clientX;
    touchUsed = false;
  };
  const onTouchMove = (e: TouchEvent) => {
    const t = e.touches[0];
    if (!t) return;
    const dy = touchStartY - t.clientY;
    const dx = touchStartX - t.clientX;
    if (Math.abs(dy) > 6) e.preventDefault();
    if (touchUsed || isBusy()) return;
    if (Math.abs(dy) >= TOUCH_THRESHOLD && Math.abs(dy) > Math.abs(dx) * 1.2) {
      touchUsed = true;
      onStep(dy > 0 ? 1 : -1, "touch");
    }
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.repeat || e.altKey || e.ctrlKey || e.metaKey) return;
    const el = e.target as HTMLElement | null;
    const typing = el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
    if (typing) return;
    const next = ["ArrowDown", "PageDown", "ArrowRight"].includes(e.key) || (e.key === " " && !e.shiftKey);
    const prev = ["ArrowUp", "PageUp", "ArrowLeft"].includes(e.key) || (e.key === " " && e.shiftKey);
    if (!next && !prev) return;
    // let Space/Enter activate focused buttons normally
    if (e.key === " " && el && el.tagName === "BUTTON") return;
    e.preventDefault();
    if (isBusy()) return;
    onStep(next ? 1 : -1, "key");
  };

  target.addEventListener("wheel", onWheel, { passive: false });
  target.addEventListener("touchstart", onTouchStart, { passive: true });
  target.addEventListener("touchmove", onTouchMove, { passive: false });
  window.addEventListener("keydown", onKey);
  return () => {
    window.clearTimeout(quietTimer);
    target.removeEventListener("wheel", onWheel);
    target.removeEventListener("touchstart", onTouchStart);
    target.removeEventListener("touchmove", onTouchMove);
    window.removeEventListener("keydown", onKey);
  };
}
