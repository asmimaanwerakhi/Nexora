function AuthCard({ eyebrow, title, description, children, className = '' }) {
  return (
    <section
      className={`w-full max-w-md rounded-3xl border border-border bg-bg p-6 shadow-xl shadow-charcoal-900/5 sm:p-9 ${className}`}
    >
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-primary-text">
        {eyebrow}
      </p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-heading">{title}</h1>
      {description && <p className="mt-2 text-sm leading-6 text-text-muted">{description}</p>}
      <div className="mt-7">{children}</div>
    </section>
  );
}

export default AuthCard;
