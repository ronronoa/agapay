function ShieldCheckIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

function RadarIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M19.07 4.93A10 10 0 0 0 6.99 3.34" />
      <path d="M4 6h.01" />
      <path d="M2.29 9.62A10 10 0 1 0 21.31 8.35" />
      <path d="M16.24 7.76A6 6 0 1 0 8.23 16.67" />
      <path d="M12 18h.01" />
      <path d="M17.99 11.66A6 6 0 0 1 15.77 16.67" />
      <circle cx="12" cy="12" r="2" />
      <path d="m13.41 10.59 5.66-5.66" />
    </svg>
  );
}

const HIGHLIGHTS = [
  {
    icon: ShieldCheckIcon,
    title: 'Reviewed Requests',
    body: 'Staff review every assistance request before approval, and every donation is verified before it enters inventory.',
  },
  {
    icon: RadarIcon,
    title: 'Trackable Status',
    body: 'Beneficiaries follow their request with a tracking number and email, from submission through scheduled pickup.',
  },
] as const;

export function MissionSection() {
  return (
    <section
      id="about"
      aria-labelledby="mission-heading"
      className="w-full bg-white py-16 sm:py-20"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl">
          <h2
            id="mission-heading"
            className="font-display text-3xl font-semibold tracking-tight text-text sm:text-4xl"
          >
            Connecting those who can help with those who need it most.
          </h2>

          <div className="mt-8 space-y-4 text-base leading-relaxed text-text-muted sm:text-lg">
            <p>
              Agapay was born out of a critical need for rapid, organized, and transparent disaster
              response in the Philippines. Lying directly in the path of the Pacific monsoon belt,
              our communities face yearly vulnerabilities that require more than just delayed
              assistance.
            </p>
            <p>
              We built Agapay to bridge the gap between kind-hearted donors and local barangays. By
              digitizing relief request flows, validating affected areas, and displaying transparent
              distribution trackers, we ensure your assistance directly feeds and supports our
              kababayans without administrative friction.
            </p>
          </div>

          <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2">
            {HIGHLIGHTS.map((item) => (
              <article
                key={item.title}
                className="rounded-xl border border-border bg-white p-6 shadow-sm"
              >
                <item.icon className="h-8 w-8 text-pine" />
                <h3 className="mt-4 font-display text-base font-semibold text-text">
                  {item.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-text-muted">{item.body}</p>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
