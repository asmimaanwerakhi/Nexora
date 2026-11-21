function FormAlert({ children, success = false }) {
  if (!children) {
    return null;
  }

  return (
    <p
      role={success ? 'status' : 'alert'}
      className={`rounded-xl border px-4 py-3 text-sm ${
        success
          ? 'border-success/30 bg-success/10 text-success'
          : 'border-error/30 bg-error/10 text-error'
      }`}
    >
      {children}
    </p>
  );
}

export default FormAlert;
