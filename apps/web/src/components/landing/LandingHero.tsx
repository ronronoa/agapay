import { Link } from 'react-router-dom';

export function LandingHero() {
  return (
    <section aria-labelledby="hero-heading" className="w-full bg-white py-12 sm:py-16 lg:py-20">
      <div className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-12 px-4 sm:px-6 lg:grid-cols-12 lg:gap-8 lg:px-8">
        <div className="space-y-6 lg:col-span-7 lg:pr-8">
          <h1
            id="hero-heading"
            className="font-display text-4xl font-bold tracking-tight text-text sm:text-5xl lg:text-6xl"
          >
            Connecting donors with communities hit by calamity
          </h1>
          <p className="max-w-2xl text-lg leading-relaxed text-text-muted sm:text-xl">
            Agapay manages the full relief process: from collecting donated goods, through inventory
            and scheduling, to getting supplies into the hands of families who need them.
          </p>
          <div className="flex flex-wrap items-center gap-4 pt-2">
            <Link
              to="/request-assistance"
              className="inline-flex min-h-[48px] items-center justify-center rounded-xl bg-pine px-7 py-3 text-base font-semibold text-white shadow-sm transition hover:bg-pine-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pine"
            >
              Request Aid Now
            </Link>
            <Link
              to="/campaigns"
              className="inline-flex min-h-[48px] items-center justify-center rounded-xl border-2 border-pine bg-transparent px-7 py-3 text-base font-semibold text-pine transition hover:bg-pine/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pine"
            >
              Donate Goods
            </Link>
          </div>
        </div>

        <div className="flex justify-center lg:col-span-5 lg:justify-end">
          <div className="relative w-full max-w-md overflow-hidden rounded-t-[180px] rounded-b-[40px] shadow-xl sm:max-w-lg sm:rounded-t-[240px]">
            <img
              src="/images/hero-child.png"
              alt="A smiling Filipino child receiving relief meals"
              className="h-full w-full object-cover object-center"
              loading="eager"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
