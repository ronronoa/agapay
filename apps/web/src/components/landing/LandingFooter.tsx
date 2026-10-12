import { Link } from 'react-router-dom';

const FOOTER_LINKS = [
  {
    heading: '',
    links: [
      { label: 'How It Works', to: '/how-it-works' },
      { label: 'Donate', to: '/campaigns' },
      { label: 'Relief Requests', to: '/request-assistance' },
      { label: 'Track Donations', to: '/track' },
    ],
  },
  {
    heading: '',
    links: [
      { label: 'Verified Request', to: '/how-it-works' },
      { label: 'Partner Organization', to: '/about' },
      { label: 'Volunteer', to: '/about' },
    ],
  },
  {
    heading: '',
    links: [
      { label: 'About Agapay', to: '/about' },
      { label: 'Our Mission', to: '/about' },
      { label: 'Contact Us', to: '/about' },
    ],
  },
  {
    heading: '',
    links: [
      { label: 'Help center', to: '/how-it-works' },
      { label: 'Community', to: '/about' },
      { label: 'Security', to: '/about' },
      { label: 'Privacy Policy', to: '/about' },
    ],
  },
] as const;

export function LandingFooter() {
  return (
    <footer className="w-full bg-pine-dark text-white">
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-12">
          <div className="space-y-6 lg:col-span-4">
            <div>
              <p className="font-display text-xl font-semibold">Agapay</p>
              <p className="mt-1 text-sm text-white/70">
                Connecting compassion to communities need.
              </p>
            </div>

            <div className="flex max-w-sm flex-wrap gap-3">
              <Link
                to="/request-assistance"
                className="inline-flex min-h-[44px] items-center justify-center rounded-lg bg-pine px-5 py-2 text-sm font-semibold text-white transition hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                Request assistance
              </Link>
              <Link
                to="/track"
                className="inline-flex min-h-[44px] items-center justify-center rounded-lg border border-white/30 px-5 py-2 text-sm font-semibold text-white transition hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                Track a request
              </Link>
            </div>
          </div>

          {/* Link columns */}
          <div className="grid grid-cols-2 gap-8 sm:grid-cols-4 lg:col-span-8">
            {FOOTER_LINKS.map((group, gIdx) => (
              <nav key={gIdx} aria-label={`Footer links group ${gIdx + 1}`}>
                <ul className="space-y-3">
                  {group.links.map((link) => (
                    <li key={link.label}>
                      <Link
                        to={link.to}
                        className="text-sm text-white/70 transition hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="border-t border-white/10">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-6 sm:px-6 lg:px-8">
          <p className="text-xs text-white/50">
            &copy; 2026 Agapay Community, Inc. All rights reserved.
          </p>
          <div className="flex items-center gap-4 text-xs text-white/50">
            <Link
              to="/about"
              className="hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              Privacy Policy
            </Link>
            <Link
              to="/about"
              className="hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              Terms of Service
            </Link>
            <Link
              to="/about"
              className="hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              Cookie Policy
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
