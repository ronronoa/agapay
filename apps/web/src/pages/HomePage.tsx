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
      <main id="main">
        <LandingHero />
        <RespondsToSection />
        <AffectedAreasSection />
        <MissionSection />
      </main>
      <LandingFooter />
    </>
  );
}
