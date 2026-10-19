import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { smoothScrollTo } from "../experience/smooth-scroll";

export const isReduced = () => document.documentElement.dataset.reducedMotion === "1";

export function scrollToId(id: string) {
  const el = id === "top" ? null : document.getElementById(id);
  smoothScrollTo(el ?? 0, { immediate: isReduced() });
}

export const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const smooth = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/** true once / while the element is within the viewport (+margin) */
export function useInView<T extends Element>(opts: { margin?: string; once?: boolean; threshold?: number } = {}) {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);
  const { margin = "0px", once = false, threshold = 0 } = opts;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e) return;
        if (e.isIntersecting) {
          setInView(true);
          if (once) io.disconnect();
        } else if (!once) setInView(false);
      },
      { rootMargin: margin, threshold },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [margin, once, threshold]);
  return [ref, inView] as const;
}

/**
 * Runs `fn` every animation frame while `el` is near the viewport.
 * fn gets the element's bounding rect and the frame delta in seconds.
 */
export function useFrameWhileVisible<T extends HTMLElement>(
  fn: (rect: DOMRect, dt: number) => void,
  margin = "200px",
) {
  const ref = useRef<T>(null);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    let last = 0;
    let running = false;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, last ? (now - last) / 1000 : 0.016);
      last = now;
      fnRef.current(el.getBoundingClientRect(), dt);
    };
    const io = new IntersectionObserver(
      ([e]) => {
        if (e?.isIntersecting && !running) {
          running = true;
          last = 0;
          raf = requestAnimationFrame(loop);
        } else if (!e?.isIntersecting && running) {
          running = false;
          cancelAnimationFrame(raf);
          fnRef.current(el.getBoundingClientRect(), 0);
        }
      },
      { rootMargin: margin },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [margin]);
  return ref;
}

type LoopVideoProps = {
  src?: string;
  poster: string;
  alt: string;
  /** host wants it playing (e.g. active card); still only plays when on screen */
  play: boolean;
  reduced: boolean;
  className?: string;
  eager?: boolean;
};

/**
 * Muted, inline, looping clip with a poster. The source is attached only when
 * the element approaches the viewport and it only plays while visible + wanted.
 * Without a src (or under reduced motion) it is just the still.
 */
export function LoopVideo({ src, poster, alt, play, reduced, className, eager }: LoopVideoProps) {
  const ref = useRef<HTMLVideoElement>(null);
  const [near, setNear] = useState(false);
  const [visible, setVisible] = useState(false);
  const [failed, setFailed] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ioNear = new IntersectionObserver(([e]) => e?.isIntersecting && setNear(true), { rootMargin: "600px" });
    const ioVis = new IntersectionObserver(([e]) => setVisible(!!e?.isIntersecting), { threshold: 0.05 });
    ioNear.observe(el);
    ioVis.observe(el);
    return () => {
      ioNear.disconnect();
      ioVis.disconnect();
    };
  }, []);

  const useVideo = !!src && !failed;
  const shouldPlay = useVideo && play && visible && !reduced;
  // no clip: the still gets a slow camera drift instead, only while live
  const stillLive = !useVideo && play && visible && !reduced;
  // <source> children appear lazily, so the element must be told to re-select
  const attached = near || !!eager;
  useEffect(() => {
    if (attached) ref.current?.load();
  }, [attached]);

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    if (shouldPlay) {
      const p = v.play();
      if (p) p.catch(() => undefined);
    } else v.pause();
  }, [shouldPlay, near]);

  return (
    <div ref={wrap} className={`lv ${useVideo ? "has-video" : "is-still"} ${stillLive ? "is-live" : ""} ${className ?? ""}`}>
      <img src={poster} alt={alt} loading={eager ? "eager" : "lazy"} decoding="async" draggable={false} />
      {useVideo && (
        <video
          ref={ref}
          poster={poster}
          muted
          loop
          playsInline
          preload={near ? "auto" : "none"}
          aria-hidden="true"
          tabIndex={-1}
          onError={() => setFailed(true)}
          className={shouldPlay ? "is-playing" : ""}
        >
          {(near || eager) && src && (
            <>
              {src.endsWith(".mp4") && <source src={src.replace(/\.mp4$/, ".webm")} type="video/webm" />}
              <source src={src} type="video/mp4" onError={() => setFailed(true)} />
            </>
          )}
        </video>
      )}
    </div>
  );
}

export type DialogHandle = { open: () => void; close: () => void };

/** Accessible modal built on <dialog>: focus trap, Esc, backdrop click, focus return. */
export const Dialog = forwardRef<
  DialogHandle,
  { label: string; onClosed?: () => void; children: React.ReactNode; className?: string }
>(function Dialog({ label, onClosed, children, className }, handle) {
  const ref = useRef<HTMLDialogElement>(null);
  const returnTo = useRef<HTMLElement | null>(null);
  useImperativeHandle(handle, () => ({
    open: () => {
      const d = ref.current;
      if (!d || d.open) return;
      returnTo.current = document.activeElement as HTMLElement | null;
      d.showModal();
      document.documentElement.classList.add("is-locked");
    },
    close: () => ref.current?.close(),
  }));
  return (
    // backdrop clicks close the dialog; Esc and the close button cover keyboard users
    // oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions
    <dialog
      ref={ref}
      className={`fx-dialog ${className ?? ""}`}
      aria-label={label}
      onClose={() => {
        document.documentElement.classList.remove("is-locked");
        returnTo.current?.focus?.({ preventScroll: true });
        onClosed?.();
      }}
      onClick={(e) => {
        if (e.target === ref.current) ref.current?.close();
      }}
    >
      <div className="fx-dialog-panel">
        <button type="button" className="fx-dialog-close" onClick={() => ref.current?.close()} aria-label="Close">
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.4" fill="none" />
          </svg>
        </button>
        {children}
      </div>
    </dialog>
  );
});

/** Pointer tilt + metallic edge highlight driven via CSS custom properties. */
export function tiltHandlers(enabled: boolean) {
  if (!enabled) return {};
  return {
    onPointerMove: (e: React.PointerEvent<HTMLElement>) => {
      if (e.pointerType !== "mouse") return;
      const el = e.currentTarget;
      const r = el.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width;
      const y = (e.clientY - r.top) / r.height;
      el.style.setProperty("--tx", (x - 0.5).toFixed(3));
      el.style.setProperty("--ty", (y - 0.5).toFixed(3));
      el.style.setProperty("--mx", `${(x * 100).toFixed(1)}%`);
      el.style.setProperty("--my", `${(y * 100).toFixed(1)}%`);
    },
    onPointerLeave: (e: React.PointerEvent<HTMLElement>) => {
      const el = e.currentTarget;
      el.style.setProperty("--tx", "0");
      el.style.setProperty("--ty", "0");
    },
  };
}
