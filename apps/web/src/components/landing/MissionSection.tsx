import { Clock, ShieldCheck } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Reveal } from '../ui/reveal';

const HIGHLIGHTS: readonly { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: ShieldCheck,
    title: 'Verified Needs',
    body: 'Staff review every assistance request before it goes live, and every donation is verified before it enters inventory.',
  },
  {
    icon: Clock,
    title: 'Live Status Updates',
    body: 'Beneficiaries follow their request with a tracking number and email, from submission through scheduled distribution.',
  },
];

export function MissionSection() {
  return (
    <section id="about" aria-labelledby="mission-heading" className="w-full bg-bg py-16 sm:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl">
          <h2
            id="mission-heading"
            className="font-display text-3xl font-semibold tracking-tight text-text sm:text-4xl"
          >
            Connecting those who can help with those who need it most.
          </h2>

          <p className="mt-6 text-base leading-relaxed text-text-muted sm:text-lg">
            Agapay was born out of a critical need for rapid, organized, and transparent disaster
            response. By digitizing relief request flows, validating affected areas, and displaying
            transparent distribution trackers, we ensure assistance reaches kababayans without
            administrative friction.
          </p>

          <Reveal className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2">
            {HIGHLIGHTS.map((item) => (
              <article
                key={item.title}
                className="rounded-xl border border-border bg-surface p-6 shadow-card"
              >
                <span
                  className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-surface-alt text-pine"
                  aria-hidden="true"
                >
                  <item.icon className="h-5 w-5" />
                </span>
                <h3 className="mt-4 font-display text-base font-semibold text-text">
                  {item.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-text-muted">{item.body}</p>
              </article>
            ))}
          </Reveal>
        </div>
      </div>
    </section>
  );
}
