import { Link } from 'react-router-dom';

function NotFoundPage() {
  return (
    <section className="mx-auto max-w-xl py-16 text-center">
      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-brand-primary-text">
        404
      </p>
      <h1 className="mt-3 text-3xl font-semibold text-heading">Page not found</h1>
      <p className="mt-3 text-text-muted">The page you requested does not exist.</p>
      <Link
        to="/"
        className="mt-7 inline-flex rounded-xl bg-brand-primary px-4 py-2.5 text-sm font-semibold text-on-primary transition-colors hover:bg-brand-primary-hover active:bg-brand-primary-pressed"
      >
        Back to dashboard
      </Link>
    </section>
  );
}

export default NotFoundPage;
