export type StageCopy = {
  index: string;
  label: string;
  title: string;
  body: string;
  /** where the caption sits so it never covers the aircraft */
  place: "bl" | "br" | "tl" | "tr";
};

// Captions for stops 1–5 (stop 0 is the hero headline).
export const STAGE_COPY: StageCopy[] = [
  {
    index: "01",
    label: "Profile",
    title: "Fifteen metres of intent.",
    body: "A blended wing-body and relaxed stability, held steady by the first production fly-by-wire flight controls.",
    place: "bl",
  },
  {
    index: "02",
    label: "Planform",
    title: "Cropped delta, sharpened edges.",
    body: "9.96 m of span with leading-edge root extensions that keep airflow attached at extreme angles of attack.",
    place: "tl",
  },
  {
    index: "03",
    label: "Cockpit",
    title: "A frameless bubble.",
    body: "Near-360° visibility and a seat reclined 30° to help the pilot ride out sustained 9 g.",
    place: "tr",
  },
  {
    index: "04",
    label: "Powerplant",
    title: "One engine. No compromise.",
    body: "A single afterburning turbofan delivering up to 29,000 lbf of thrust — enough for Mach 2 at altitude.",
    place: "tl",
  },
  {
    index: "05",
    label: "Onward",
    title: "Into the weather.",
    body: "Day or night, through cloud and storm — the Falcon keeps its heading.",
    place: "br",
  },
];
