import { Link } from 'react-router-dom';
import { LandingHeader } from '../../components/landing/LandingHeader';
import { LandingFooter } from '../../components/landing/LandingFooter';

export function PrivacyPage() {
  return (
    <div className="min-h-screen bg-bg">
      <LandingHeader />
      <main className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-6">
        <p className="text-lg font-semibold">Agapay</p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">Privacy Notice</h1>
        <section className="mt-6 space-y-4 rounded-xl border border-border bg-surface p-6 text-sm shadow-card sm:p-8">
          <p>
            When you submit an assistance request, Agapay collects your name, email address, contact
            number, and location details, plus the goods your household needs. We use this
            information only to review your request, verify your email, coordinate relief, and let
            you track your request status.
          </p>
          <p>
            We do not ask for more personal information than the request form requires, and we never
            publish your details. Submitting a request does not guarantee approval.
          </p>
          {/* TODO(owner): replace with the organisation's full privacy notice and legal text. */}
          <p className="text-text-muted">
            This is a summary notice. The full privacy notice and retention policy will be published
            here.
          </p>
          <Link
            to="/request-assistance"
            className="inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-6 py-2 text-sm font-medium text-surface hover:bg-primary-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            Back to the request form
          </Link>
        </section>
      </main>
      <LandingFooter />
    </div>
  );
}
