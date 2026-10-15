import { LandingHeader } from '../components/landing/LandingHeader';
import { LandingHero } from '../components/landing/LandingHero';
import { RespondsToSection } from '../components/landing/RespondsToSection';
import { AffectedAreasSection } from '../components/landing/AffectedAreasSection';
import { MissionSection } from '../components/landing/MissionSection';
import { LandingFooter } from '../components/landing/LandingFooter';
import { Bot } from 'lucide-react';

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
        <div className="fixed bottom-6 right-6">
          <button
            type="button"
            disabled
            aria-disabled="true"
            title="The assistant arrives in a later release"
            aria-label="Agapay AI assistant, coming soon"
            className="inline-flex min-h-11 items-center gap-2 rounded-full bg-primary-subtle px-5 py-3 text-sm font-semibold text-surface disabled:cursor-not-allowed disabled:opacity-80"
          >
            <span>
              <Bot size={18} />
            </span>
            AGAPAY AI
            <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs">Soon</span>
          </button>
        </div>
        <LandingHero />
        <RespondsToSection />
        <AffectedAreasSection />
        <MissionSection />
      </main>
      <LandingFooter />
    </>
  );
}
