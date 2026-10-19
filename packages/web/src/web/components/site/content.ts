import { scrollToId } from "./shared";

// Copy + media manifest for the sections below the hero.
// `video` is only set once a clip exists in /public/media — until then the
// poster still is shown, so nothing 404s.

export type Stat = { value: string; label: string };

export type Capability = {
  id: string;
  index: string;
  short: string;
  name: string;
  statement: string;
  detail: string;
  stats: Stat[];
  poster: string;
  video?: string;
};

export const CAPABILITIES: Capability[] = [
  {
    id: "agility",
    index: "01",
    short: "Agility",
    name: "Dogfighting & Agility",
    statement: "Nine g, held on a wire.",
    detail:
      "Relaxed static stability and the first production fly-by-wire flight controls let the Falcon sustain 9-g turns that would stall a conventional design. A 30° reclined seat and a force-sensing side-stick help the pilot ride them out.",
    stats: [
      { value: "+9 g", label: "Sustained load" },
      { value: "30°", label: "Seat recline" },
      { value: "FBW", label: "Quad-redundant" },
    ],
    poster: "/media/p1_agility_v2.jpg",
  },
  {
    id: "multirole",
    index: "02",
    short: "Multi-Role",
    name: "Multi-Role Versatility",
    statement: "Air and ground, in one sortie.",
    detail:
      "Nine hardpoints carry air-to-air missiles, precision-guided bombs, targeting pods and fuel in the same load, so a single jet can escort, strike and defend on one mission and swing between roles in flight.",
    stats: [
      { value: "9", label: "Hardpoints" },
      { value: "7.7 t", label: "External load" },
      { value: "Swing", label: "Role in flight" },
    ],
    poster: "/media/p2_multirole.jpg",
  },
  {
    id: "ew",
    index: "03",
    short: "Self-Protection",
    name: "Electronic Warfare & Self-Protection",
    statement: "See the threat first. Deny it the lock.",
    detail:
      "Radar-warning receivers map emitters around the jet while electronic countermeasure pods and internal suites jam hostile radars. Chaff and flare dispensers break the final lock when a missile is already in the air.",
    stats: [
      { value: "360°", label: "Radar warning" },
      { value: "ECM", label: "Active jamming" },
      { value: "CMDS", label: "Chaff & flare" },
    ],
    poster: "/media/p3_ew.jpg",
  },
  {
    id: "avionics",
    index: "04",
    short: "Avionics",
    name: "Avionics & Helmet-Mounted Cueing",
    statement: "Look. Lock. Launch.",
    detail:
      "The Joint Helmet-Mounted Cueing System projects targeting symbology onto the visor, so the pilot cues high-off-boresight missiles simply by looking at the threat. On the latest jets, that cue is fused with an AESA fire-control radar.",
    stats: [
      { value: "JHMCS", label: "Visor cueing" },
      { value: "AESA", label: "Fire-control radar" },
      { value: "HOBS", label: "Off-boresight shots" },
    ],
    poster: "/media/p4_avionics.jpg",
  },
  {
    id: "supersonic",
    index: "05",
    short: "Supersonic",
    name: "Supersonic Performance",
    statement: "Mach 2, with thrust to spare.",
    detail:
      "A single afterburning turbofan pushes the Falcon past Mach 2 at altitude. In air-combat configuration it produces more thrust than it weighs, so it can accelerate while climbing straight up.",
    stats: [
      { value: "Mach 2+", label: "At altitude" },
      { value: "> 1 : 1", label: "Thrust-to-weight" },
      { value: "1", label: "Afterburning engine" },
    ],
    poster: "/media/p5_supersonic.jpg",
  },
];

export type Milestone = { year: string; title: string; body: string };

export const MILESTONES: Milestone[] = [
  { year: "1974", title: "First flight", body: "The YF-16 prototype flies at Edwards AFB, beginning the Lightweight Fighter story." },
  {
    year: "1979",
    title: "Into service",
    body: "The 388th Tactical Fighter Wing at Hill AFB receives the first operational F-16s.",
  },
  { year: "1981", title: "First combat", body: "Israeli F-16s fly the long-range Osirak strike, Operation Opera." },
  {
    year: "1991",
    title: "Desert Storm",
    body: "F-16s fly more sorties than any other aircraft in the coalition air campaign.",
  },
  {
    year: "1994–99",
    title: "The Balkans",
    body: "Deny Flight, Deliberate Force and Allied Force, including NATO's first air-to-air combat engagement.",
  },
  {
    year: "2001–",
    title: "Air defence",
    body: "Homeland and international air-policing missions, from Operation Noble Eagle to NATO's eastern flank.",
  },
  { year: "Today", title: "Still flying", body: "More than 4,600 built and flown by over 25 nations, with new Block 70s on the line." },
];

export type Variant = {
  id: string;
  name: string;
  tag: string;
  era: string;
  headline: string;
  summary: string;
  specs: Stat[];
  poster: string;
  video?: string;
};

export const VARIANTS: Variant[] = [
  {
    id: "ab",
    name: "F-16A/B",
    tag: "Lightweight origins",
    era: "1978 — Block 1–20",
    headline: "Where the legend got light.",
    summary:
      "The original day fighter: small, clean and brutally agile, built around a simple pulse-Doppler radar and a pilot-first cockpit. The B adds a second seat for training.",
    specs: [
      { value: "F100-PW-200", label: "Engine" },
      { value: "AN/APG-66", label: "Radar" },
      { value: "Air superiority", label: "Primary role" },
      { value: "1 / 2", label: "Seats (A / B)" },
    ],
    poster: "/media/v1_ab.jpg",
  },
  {
    id: "cd",
    name: "F-16C/D",
    tag: "Block 50/52 workhorse",
    era: "1991 — Block 50/52",
    headline: "The backbone of the fleet.",
    summary:
      "More thrust, a far more capable radar and precision-strike integration made the Block 50/52 the definitive multi-role Falcon, including the dedicated Wild Weasel air-defence suppression mission.",
    specs: [
      { value: "F110-GE-129 / F100-PW-229", label: "Engine" },
      { value: "AN/APG-68(V)", label: "Radar" },
      { value: "Multi-role, SEAD", label: "Primary role" },
      { value: "1 / 2", label: "Seats (C / D)" },
    ],
    poster: "/media/v2_cd.jpg",
  },
  {
    id: "ef",
    name: "F-16E/F",
    tag: "Block 60 Desert Falcon",
    era: "2004 — Block 60",
    headline: "Long legs, sharper eyes.",
    summary:
      "Developed for the United Arab Emirates, the Desert Falcon added conformal fuel tanks, an internal targeting system and the first AESA radar ever fitted to an F-16.",
    specs: [
      { value: "F110-GE-132", label: "Engine" },
      { value: "AN/APG-80 AESA", label: "Radar" },
      { value: "Conformal tanks", label: "Range" },
      { value: "1 / 2", label: "Seats (E / F)" },
    ],
    poster: "/media/v3_ef.jpg",
  },
  {
    id: "v",
    name: "F-16V",
    tag: "Block 70/72 Viper",
    era: "2018 — Block 70/72",
    headline: "The Viper, fully modern.",
    summary:
      "An AESA radar, a large centre pedestal display, modern electronic warfare and an airframe rated for 12,000 hours keep the newest Falcons competitive well into the coming decades.",
    specs: [
      { value: "F110-GE-129 / F100-PW-229", label: "Engine" },
      { value: "AN/APG-83 SABR", label: "Radar" },
      { value: "12,000 h", label: "Service life" },
      { value: "1 / 2", label: "Seats" },
    ],
    poster: "/media/v4_viper.jpg",
  },
];

export const FEATURE = { poster: "/media/feature.jpg", video: "/media/feature-720.mp4" as string | undefined };

export const SECTIONS = [
  { id: "performance", label: "Performance" },
  { id: "history", label: "History" },
  { id: "variants", label: "Variants" },
  { id: "contact", label: "Contact" },
] as const;

export const INTEREST_OPTIONS = [
  { value: "tactical-briefing", label: "Tactical Briefing" },
  { value: "variant-inquiry", label: "Variant Inquiry" },
  { value: "general-inquiry", label: "General Inquiry" },
] as const;
export type Interest = (typeof INTEREST_OPTIONS)[number]["value"];

/** Fired by CTAs that preselect a contact interest. */
export const INTEREST_EVENT = "falcon:interest";
export function requestContact(interest: Interest) {
  window.dispatchEvent(new CustomEvent(INTEREST_EVENT, { detail: interest }));
  scrollToId("contact");
}
