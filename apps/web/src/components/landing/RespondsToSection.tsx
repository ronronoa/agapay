import { Reveal } from '../ui/reveal';

const CARDS = [
  {
    title: 'Our Spirit of Kapit-Bisig',
    body: 'At Agapay, we live by kapit-bisig, the Filipino way of holding on to one another through hard times. Your donation is more than help; it\u2019s a warm hand reaching out, a reminder that no Filipino walks alone.',
  },
  {
    title: 'Filipinos Take Care of Their Own',
    body: 'Filipinos take care of their own. Every gift you give supports a family, a child, or a community working to rise again, an act of love for a fellow kababayan in need.',
  },
  {
    title: 'Our Spirit of Bayanihan',
    body: 'No Filipino should face life\u2019s struggles alone; that\u2019s the heart of Agapay. Let\u2019s hold on to each other and keep the bayanihan spirit strong. Donate today.',
  },
] as const;

export function RespondsToSection() {
  return (
    <section aria-labelledby="responds-heading" className="w-full bg-white py-16 sm:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <h2
            id="responds-heading"
            className="font-display text-2xl font-semibold tracking-tight text-text sm:text-3xl"
          >
            What Agapay responds to
          </h2>
          <p className="mt-4 text-base leading-relaxed text-text-muted sm:text-lg">
            The Philippines sits on the Pacific Ring of Fire and in the direct path of the monsoon
            belt. When calamity hits, this is the spirit we bring.
          </p>
        </div>

        <Reveal className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {CARDS.map((card, index) => (
            <article
              key={index}
              className="rounded-2xl border border-border bg-white p-6 shadow-sm transition hover:shadow-md sm:p-8"
            >
              <h3 className="font-display text-lg font-semibold text-text">{card.title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-text-muted">{card.body}</p>
            </article>
          ))}
        </Reveal>
      </div>
    </section>
  );
}
