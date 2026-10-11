const AREAS = [
  {
    location: 'St. Bernard, Southern Leyte',
    date: 'February 17, 2006',
    event: 'Guinsaugon Landslide',
  },
  {
    location: 'Malabon City, Metro Manila',
    date: 'July 19, 2026',
    event: 'Flood, at Tinajeros Malabon',
  },
  {
    location: 'Camalig City, Bicol Philippines',
    date: 'May 15, 2026',
    event: 'Ashfall, at Camalig City',
  },
] as const;

export function AffectedAreasSection() {
  return (
    <section id="impact" aria-labelledby="areas-heading" className="w-full bg-white py-16 sm:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <h2
            id="areas-heading"
            className="text-2xl font-bold tracking-tight text-[#183327] sm:text-3xl"
          >
            Affected areas of the Philippines
          </h2>
          <p className="mt-4 text-base leading-relaxed text-[#625f5f] sm:text-lg">
            These places are currently affected and need relief support across their barangays.
          </p>
        </div>

        <div className="mt-12 grid grid-cols-1 items-start gap-10 lg:grid-cols-2 lg:gap-16">
          {/* Left: arch-masked relief photo */}
          <div className="flex justify-center">
            <div className="w-full max-w-md overflow-hidden rounded-t-[180px] rounded-b-[40px] shadow-xl sm:max-w-lg sm:rounded-t-[240px]">
              <img
                src="/images/relief-distribution.png"
                alt="Relief volunteers distributing meals and supplies to affected communities"
                className="h-full w-full object-cover object-center"
                loading="lazy"
              />
            </div>
          </div>

          {/* Right: stacked area cards */}
          <div className="flex flex-col gap-4">
            {AREAS.map((area) => (
              <article
                key={area.location}
                className="rounded-xl border border-[#bac9c9] bg-white px-6 py-5 shadow-sm"
              >
                <h3 className="text-base font-bold text-[#183327]">{area.location}</h3>
                <div className="mt-2 border-t border-[#bac9c9] pt-2">
                  <p className="text-sm text-[#625f5f]">{area.date}</p>
                  <p className="text-sm text-[#625f5f]">{area.event}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
