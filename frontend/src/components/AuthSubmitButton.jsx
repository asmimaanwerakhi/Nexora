function AuthSubmitButton({ children, loading, loadingLabel = 'Please wait…' }) {
  return (
    <button
      type="submit"
      disabled={loading}
      className="inline-flex w-full items-center justify-center rounded-xl bg-brand-primary px-4 py-3 text-sm font-semibold text-on-primary transition-colors hover:bg-brand-primary-hover active:bg-brand-primary-pressed disabled:cursor-not-allowed disabled:opacity-60"
    >
      {loading ? loadingLabel : children}
    </button>
  );
}

export default AuthSubmitButton;
