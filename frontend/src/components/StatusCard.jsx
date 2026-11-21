const statusStyles = {
  idle: 'bg-charcoal-400',
  checking: 'animate-pulse bg-warning',
  online: 'bg-success',
  offline: 'bg-error',
};

function StatusCard({ title, status, description, error, onCheck }) {
  const statusLabel = {
    idle: 'Not checked',
    checking: 'Checking',
    online: 'Connected',
    offline: 'Unavailable',
  }[status];

  return (
    <article className="rounded-3xl border border-border bg-bg p-6 shadow-xl shadow-charcoal-900/5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-text-muted">{title}</p>
          <div className="mt-3 flex items-center gap-2">
            <span className={`h-2.5 w-2.5 rounded-full ${statusStyles[status]}`} />
            <h2 className="text-xl font-semibold text-heading">{statusLabel}</h2>
          </div>
        </div>
        <button
          type="button"
          onClick={onCheck}
          disabled={status === 'checking'}
          className="rounded-xl border border-brand-primary/30 px-3 py-2 text-sm font-medium text-brand-primary-text transition-colors hover:border-brand-primary-hover hover:bg-brand-primary-soft disabled:cursor-wait disabled:opacity-50"
        >
          {status === 'checking' ? 'Checking…' : 'Test'}
        </button>
      </div>
      <p className="mt-4 text-sm leading-6 text-text-muted">{description}</p>
      {error && (
        <p className="mt-4 rounded-xl border border-error/20 bg-error/5 px-3 py-2 text-sm text-error">
          {error}
        </p>
      )}
    </article>
  );
}

export default StatusCard;
