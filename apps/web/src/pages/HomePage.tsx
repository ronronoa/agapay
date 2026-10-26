import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { LandingHeader } from '../components/landing/LandingHeader';
import { LandingHero } from '../components/landing/LandingHero';
import { RespondsToSection } from '../components/landing/RespondsToSection';
import { AffectedAreasSection } from '../components/landing/AffectedAreasSection';
import { MissionSection } from '../components/landing/MissionSection';
import { LandingFooter } from '../components/landing/LandingFooter';

interface HomePageProps {
  isLoading?: boolean;
}

export function HomePage({ isLoading = false }: HomePageProps) {
  const location = useLocation();

  // Landing here with a section hash (e.g. Impact from /track) scrolls to it
  // after the sections mount, since client-side routing has no native jump.
  useEffect(() => {
    if (location.hash.length === 0) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    document
      .querySelector(location.hash)
      ?.scrollIntoView?.({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  }, [location.hash]);

  if (isLoading) {
    return (
      <p role="status" className="text-text-muted">
        Loading…
      </p>
    );
  }

  return (
    <>
      <LandingHeader />
      <main id="top">
        <LandingHero />
        <RespondsToSection />
        <AffectedAreasSection />
        <MissionSection />
      </main>
      <LandingFooter />
    </>
  );
}
