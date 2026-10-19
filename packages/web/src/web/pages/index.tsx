import { useState } from "react";
import { ExperienceProvider, useExperience } from "../components/experience/experience-context";
import { SmoothScroll } from "../components/experience/smooth-scroll";
import { HudOverlay, Reticle } from "../components/hud/hud-overlay";
import { F16Hero } from "../components/jet/f16-hero";
import { ContactSection } from "../components/site/contact-section";
import { HistorySection } from "../components/site/history-section";
import { PerformanceSection } from "../components/site/performance-section";
import { SiteFooter } from "../components/site/site-footer";
import { SiteNav } from "../components/site/site-nav";
import { TurnSection } from "../components/site/turn-section";
import { VariantsSection } from "../components/site/variants-section";
import "../components/site/site.css";

function PageScroll() {
  const { reduced } = useExperience();
  return <SmoothScroll reduced={reduced} />;
}

function Index() {
  const [ready, setReady] = useState(false);
  return (
    <ExperienceProvider>
      <PageScroll />
      <SiteNav ready={ready} />
      <F16Hero nextId="performance" onReady={() => setReady(true)} />
      <main className="site-main">
        <PerformanceSection />
        <TurnSection />
        <HistorySection />
        <VariantsSection />
        <ContactSection />
      </main>
      <SiteFooter />
      <HudOverlay />
      <Reticle />
    </ExperienceProvider>
  );
}

export default Index;
