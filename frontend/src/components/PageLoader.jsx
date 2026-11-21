function PageLoader() {
  return (
    <div className="grid min-h-[50vh] place-items-center" role="status" aria-label="Loading">
      <span className="h-9 w-9 animate-spin rounded-full border-2 border-border border-t-brand-primary" />
    </div>
  );
}

export default PageLoader;
