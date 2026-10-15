import { Flag, Heart, Users } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Reveal } from '../ui/reveal';

const CARDS: readonly { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: Heart,
    title: 'Our Spirit of Kapit-Bisig',
    body: 'The Filipino way of holding on to one another through hard times. Your donation is more than help; it is a warm hand reaching out.',
  },
  {
    icon: Users,
    title: 'Filipinos Take Care of Their Own',
    body: 'Every gift supports a family, a child, or a community working to rise again, an act of love for a fellow kababayan in need.',
  },
  {
    icon: Flag,
    title: 'No One Faces Life Alone',
    body: 'No Filipino should face life’s struggles alone. Hold on to each other and keep the bayanihan spirit strong.',
  },
];

export function RespondsToSection() {
  return (
    <section aria-labelledby="responds-heading" className="w-full bg-bg py-16 sm:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl">
          <h2
            id="responds-heading"
            className="font-display text-2xl font-semibold tracking-tight text-text sm:text-3xl"
          >
            What Agapay responds to
          </h2>
          <p className="mt-4 text-base leading-relaxed text-text-muted sm:text-lg">
            The Philippines sits on the Pacific Ring of Fire and in the direct path of the monsoon
            belt. Most relief requests fall into three categories.
          </p>
        </div>

        <Reveal className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {CARDS.map((card) => (
            <article
              key={card.title}
              className="rounded-xl border border-border bg-surface p-6 shadow-card transition hover:shadow-md"
            >
              <span
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-surface-alt text-pine"
                aria-hidden="true"
              >
                <card.icon className="h-5 w-5" />
              </span>
              <h3 className="mt-4 font-display text-lg font-semibold text-text">{card.title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-text-muted">{card.body}</p>
            </article>
          ))}
        </Reveal>
      </div>
    </section>
  );
}
