import { useEffect, useId, useRef, useState } from "react";
import { useCreateInquiry } from "../../queries/inquiries";
import { useExperience } from "../experience/experience-context";
import { INTEREST_EVENT, INTEREST_OPTIONS, type Interest } from "./content";

type Field = "name" | "email" | "interest" | "message";
type Values = Record<Field, string>;
type Errors = Partial<Record<Field, string>>;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Mirrors the server schema in api/routes/inquiries.ts so most errors never need a round-trip. */
function validate(v: Values): Errors {
  const e: Errors = {};
  const name = v.name.trim();
  if (name.length < 2) e.name = "Please enter your name.";
  else if (name.length > 120) e.name = "That name is a little long — 120 characters at most.";
  const email = v.email.trim();
  if (!email) e.email = "Please enter your email address.";
  else if (!EMAIL.test(email) || email.length > 200) e.email = "Please enter a valid email address.";
  if (!INTEREST_OPTIONS.some((o) => o.value === v.interest)) e.interest = "Please choose what you're interested in.";
  const msg = v.message.trim();
  if (msg.length < 10) e.message = "Please write at least 10 characters.";
  else if (msg.length > 4000) e.message = "Please keep your message under 4,000 characters.";
  return e;
}

/** Pull per-field messages out of an oRPC validation error, if that's what it is. */
function serverFieldErrors(err: unknown): Errors | null {
  const data = (err as { data?: { issues?: { path?: (string | number)[]; message?: string }[] } })?.data;
  if (!data?.issues?.length) return null;
  const out: Errors = {};
  for (const i of data.issues) {
    const k = i.path?.[0];
    if (k === "name" || k === "email" || k === "interest" || k === "message") out[k] ??= i.message ?? "Please check this field.";
  }
  return Object.keys(out).length ? out : null;
}

const EMPTY: Values = { name: "", email: "", interest: "", message: "" };

export function ContactSection() {
  const { cue } = useExperience();
  const uid = useId();
  const [values, setValues] = useState<Values>(EMPTY);
  const [errors, setErrors] = useState<Errors>({});
  const [touched, setTouched] = useState<Partial<Record<Field, boolean>>>({});
  const [honey, setHoney] = useState("");
  const [sent, setSent] = useState<{ name: string } | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const mutation = useCreateInquiry();
  const formRef = useRef<HTMLFormElement>(null);
  const successRef = useRef<HTMLDivElement>(null);

  // CTAs elsewhere on the page preselect the interest
  useEffect(() => {
    const on = (e: Event) => {
      const v = (e as CustomEvent<Interest>).detail;
      if (INTEREST_OPTIONS.some((o) => o.value === v)) {
        setSent(null);
        setValues((s) => ({ ...s, interest: v }));
        setErrors((s) => ({ ...s, interest: undefined }));
      }
    };
    window.addEventListener(INTEREST_EVENT, on);
    return () => window.removeEventListener(INTEREST_EVENT, on);
  }, []);

  useEffect(() => {
    if (sent) successRef.current?.focus();
  }, [sent]);

  const set = (k: Field) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const next = { ...values, [k]: e.target.value };
    setValues(next);
    if (touched[k] || errors[k]) setErrors((s) => ({ ...s, [k]: validate(next)[k] }));
  };
  const blur = (k: Field) => () => {
    setTouched((s) => ({ ...s, [k]: true }));
    if (values[k]) setErrors((s) => ({ ...s, [k]: validate(values)[k] }));
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (mutation.isPending) return;
    setFailure(null);
    const errs = validate(values);
    setErrors(errs);
    setTouched({ name: true, email: true, interest: true, message: true });
    const first = (Object.keys(errs) as Field[])[0];
    if (first) {
      formRef.current?.querySelector<HTMLElement>(`[name="${first}"]`)?.focus();
      return;
    }
    mutation.mutate(
      {
        name: values.name.trim(),
        email: values.email.trim(),
        interest: values.interest as Interest,
        message: values.message.trim(),
        company: honey,
      },
      {
        onSuccess: (res) => {
          // only a stored record counts as success
          if (!res?.received) {
            setFailure("We couldn't confirm your message was received. Please try again.");
            return;
          }
          cue("open");
          setSent({ name: values.name.trim().split(/\s+/)[0] ?? "" });
          setValues(EMPTY);
          setTouched({});
          setErrors({});
        },
        onError: (err) => {
          const fe = serverFieldErrors(err);
          if (fe) {
            setErrors(fe);
            setFailure("Some details need another look.");
          } else {
            setFailure(
              typeof navigator !== "undefined" && !navigator.onLine
                ? "You appear to be offline. Your message has not been sent — please try again once you're connected."
                : "Something went wrong and your message has not been sent. Please try again in a moment.",
            );
          }
        },
      },
    );
  };

  const fid = (k: string) => `${uid}-${k}`;
  const describe = (k: Field) => (errors[k] ? fid(`${k}-err`) : undefined);

  return (
    <section id="contact" className="contact" aria-labelledby="contact-title">
      <div className="contact-sky" aria-hidden="true">
        <div className="contact-clouds is-a" />
        <div className="contact-clouds is-b" />
        <div className="contact-vignette" />
      </div>

      <div className="contact-inner">
        <div className="contact-head">
          <p className="fx-eyebrow">
            <span className="fx-num">06</span> Contact
          </p>
          <h2 id="contact-title" className="fx-display">
            Your Next Mission <em>Begins Here.</em>
          </h2>
          <p className="fx-lede">
            Request a tactical briefing, ask about a specific variant, or just say hello. Every message is read by a
            person and answered within two working days.
          </p>
          <ul className="contact-points">
            <li>
              <span>Briefings</span>Capability and programme overviews
            </li>
            <li>
              <span>Variants</span>Block configurations and upgrades
            </li>
            <li>
              <span>General</span>Press, partnerships and everything else
            </li>
          </ul>
        </div>

        <div className="contact-card">
          {sent ? (
            <div ref={successRef} className="contact-success" tabIndex={-1} aria-live="polite">
              <span className="contact-success-mark" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="22" height="22">
                  <path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
                </svg>
              </span>
              <h3>Message received{sent.name ? `, ${sent.name}` : ""}.</h3>
              <p>Your inquiry is logged and on its way to the team. We&apos;ll reply to the email address you gave us.</p>
              <button type="button" className="fx-link" onClick={() => setSent(null)}>
                <span>Send another message</span>
              </button>
            </div>
          ) : (
            <form ref={formRef} className="contact-form" noValidate onSubmit={onSubmit} aria-describedby={failure ? fid("fail") : undefined}>
              <div className="contact-row">
                <div className={`fx-field ${errors.name ? "is-invalid" : ""}`}>
                  <label htmlFor={fid("name")}>Name</label>
                  <input
                    id={fid("name")}
                    name="name"
                    aria-label="Name"
                    autoComplete="name"
                    value={values.name}
                    onChange={set("name")}
                    onBlur={blur("name")}
                    aria-invalid={!!errors.name}
                    aria-describedby={describe("name")}
                    maxLength={120}
                    placeholder="Your full name"
                  />
                  {errors.name && (
                    <p id={fid("name-err")} className="fx-error">
                      {errors.name}
                    </p>
                  )}
                </div>
                <div className={`fx-field ${errors.email ? "is-invalid" : ""}`}>
                  <label htmlFor={fid("email")}>Email</label>
                  <input
                    id={fid("email")}
                    name="email"
                    aria-label="Email"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    value={values.email}
                    onChange={set("email")}
                    onBlur={blur("email")}
                    aria-invalid={!!errors.email}
                    aria-describedby={describe("email")}
                    maxLength={200}
                    placeholder="you@example.com"
                  />
                  {errors.email && (
                    <p id={fid("email-err")} className="fx-error">
                      {errors.email}
                    </p>
                  )}
                </div>
              </div>

              <fieldset className={`fx-field fx-choice ${errors.interest ? "is-invalid" : ""}`} aria-describedby={describe("interest")}>
                <legend>Interest</legend>
                <div className="fx-choice-row">
                  {INTEREST_OPTIONS.map((o) => (
                    <label key={o.value} className={values.interest === o.value ? "is-checked" : ""}>
                      <input
                        type="radio"
                        name="interest"
                        value={o.value}
                        checked={values.interest === o.value}
                        onChange={set("interest")}
                        aria-label={o.label}
                      />
                      <span>{o.label}</span>
                    </label>
                  ))}
                </div>
                {errors.interest && (
                  <p id={fid("interest-err")} className="fx-error">
                    {errors.interest}
                  </p>
                )}
              </fieldset>

              <div className={`fx-field ${errors.message ? "is-invalid" : ""}`}>
                <label htmlFor={fid("message")}>
                  Message <span className="fx-count">{values.message.trim().length} / 4000</span>
                </label>
                <textarea
                  id={fid("message")}
                  name="message"
                  aria-label="Message"
                  rows={5}
                  value={values.message}
                  onChange={set("message")}
                  onBlur={blur("message")}
                  aria-invalid={!!errors.message}
                  aria-describedby={describe("message")}
                  maxLength={4000}
                  placeholder="Tell us about your mission…"
                />
                {errors.message && (
                  <p id={fid("message-err")} className="fx-error">
                    {errors.message}
                  </p>
                )}
              </div>

              {/* honeypot: hidden from people and assistive tech */}
              <div className="fx-hp" aria-hidden="true">
                <label htmlFor={fid("company")}>Company</label>
                <input
                  id={fid("company")}
                  name="company"
                  aria-label="Company"
                  tabIndex={-1}
                  autoComplete="off"
                  value={honey}
                  onChange={(e) => setHoney(e.target.value)}
                />
              </div>

              {failure && (
                <p id={fid("fail")} className="contact-failure" role="alert">
                  {failure}
                </p>
              )}

              <div className="contact-submit">
                <button type="submit" className="jet-cta is-solid" disabled={mutation.isPending} aria-busy={mutation.isPending}>
                  <span>{mutation.isPending ? "Sending…" : "Send Message"}</span>
                  {mutation.isPending ? (
                    <span className="fx-spinner" aria-hidden="true" />
                  ) : (
                    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                      <path d="M5 12h14M13 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="1.4" />
                    </svg>
                  )}
                </button>
                <p className="contact-note">We only use your details to reply to this message.</p>
              </div>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}
