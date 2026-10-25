import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowUpRight } from 'lucide-react';

export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main id="main-content" className="min-h-dvh bg-surface lg:grid lg:grid-cols-[1.15fr_1fr]">
      <section
        aria-label="Agapay community"
        className="relative isolate flex min-h-52 flex-col justify-between overflow-hidden bg-pine-dark px-6 py-6 text-surface sm:px-10 lg:sticky lg:top-0 lg:h-dvh lg:px-12 lg:py-10 xl:px-16 xl:py-12"
      >
        <img
          src="/images/hero-child.png"
          alt=""
          aria-hidden="true"
          width={1465}
          height={937}
          fetchPriority="high"
          className="absolute inset-0 size-full object-cover object-[40%_center]"
        />
        <div aria-hidden="true" className="absolute inset-0 bg-text/75" />
        <Link
          to="/"
          aria-label="Agapay home"
          className="relative inline-flex min-h-11 w-fit items-center font-display text-2xl font-bold focus-visible:outline-surface"
        >
          Agapay
        </Link>
        <div className="relative mt-8 max-w-xl lg:my-auto lg:py-16">
          <p className="font-display text-4xl font-bold leading-tight tracking-tight sm:text-5xl lg:text-6xl xl:text-7xl">
            Relief starts
            <br />
            with people.
          </p>
          <p className="mt-6 hidden max-w-sm text-lg leading-relaxed text-surface lg:block">
            A shared space for donors and relief teams to organize goods, collections, and
            distributions.
          </p>
        </div>
        <p className="relative hidden text-sm text-surface lg:block">
          Calamity relief, organized together.
        </p>
      </section>

      <section
        aria-label="Account access"
        className="flex min-w-0 flex-col px-6 py-5 sm:px-12 lg:min-h-dvh lg:px-10 lg:py-8 xl:px-16"
      >
        <Link
          to="/"
          className="inline-flex min-h-11 w-fit items-center gap-2 self-end text-sm text-text-muted hover:text-text"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back to home
        </Link>
        <div className="mx-auto my-auto w-full max-w-md py-8 sm:py-10">{children}</div>
        <div className="mx-auto flex w-full max-w-md flex-wrap items-center justify-between gap-3 border-t border-border pt-5 text-sm">
          <Link
            to="/request-assistance"
            className="inline-flex min-h-11 items-center gap-2 text-primary underline underline-offset-4"
          >
            Request assistance
            <ArrowUpRight className="size-4" aria-hidden="true" />
          </Link>
          <Link
            to="/privacy"
            className="inline-flex min-h-11 items-center text-text-muted underline underline-offset-4"
          >
            Privacy
          </Link>
          <p className="w-full text-text-muted">Assistance requests do not require an account.</p>
        </div>
      </section>
    </main>
  );
}
