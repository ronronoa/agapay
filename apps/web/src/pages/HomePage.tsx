import { Link } from 'react-router-dom';

interface HomePageProps {
  isLoading?: boolean;
}

// The three actions a visitor can take are visible without scrolling. No stats,
// testimonials, or partner claims, because none have been supplied (hard rule 12).
export function HomePage({ isLoading = false }: HomePageProps) {
  if (isLoading) {
    return (
      <p role="status" className="text-text-muted">
        Loading…
      </p>
    );
  }

  return (
    <div className="space-y-10">
      <section className="space-y-4">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Calamity relief, coordinated.
        </h1>
        <p className="max-w-2xl text-text-muted">
          Donate relief goods, or request assistance if you are affected. You do not need an account
          to ask for help.
        </p>
      </section>

      <section aria-labelledby="actions-heading" className="space-y-4">
        <h2 id="actions-heading" className="text-lg font-semibold">
          What would you like to do?
        </h2>

        <ul className="grid gap-4 sm:grid-cols-3">
          <li className="rounded-lg border border-border bg-surface p-5">
            <h3 className="font-semibold">Donate relief goods</h3>
            <p className="mt-2 text-sm text-text-muted">
              Offer food, water, clothing, or hygiene supplies to an active campaign.
            </p>
            <Link
              to="/donate"
              className="mt-4 inline-block text-sm font-medium text-primary underline underline-offset-4"
            >
              Donate goods
            </Link>
          </li>

          <li className="rounded-lg border border-border bg-surface p-5">
            <h3 className="font-semibold">Request assistance</h3>
            <p className="mt-2 text-sm text-text-muted">
              Submit a request and receive a reference number by email.
            </p>
            <Link
              to="/request-assistance"
              className="mt-4 inline-block text-sm font-medium text-primary underline underline-offset-4"
            >
              Request assistance
            </Link>
          </li>

          <li className="rounded-lg border border-border bg-surface p-5">
            <h3 className="font-semibold">Track a request</h3>
            <p className="mt-2 text-sm text-text-muted">
              Check the status of a request using its reference number and email address.
            </p>
            <Link
              to="/track"
              className="mt-4 inline-block text-sm font-medium text-primary underline underline-offset-4"
            >
              Track assistance
            </Link>
          </li>
        </ul>
      </section>
    </div>
  );
}
