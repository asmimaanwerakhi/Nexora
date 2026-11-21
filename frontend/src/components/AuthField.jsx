function AuthField({
  id,
  label,
  type = 'text',
  autoComplete,
  placeholder,
  error,
  register,
  inputMode,
  maxLength,
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-heading">
        {label}
      </label>
      <input
        id={id}
        type={type}
        autoComplete={autoComplete}
        placeholder={placeholder}
        inputMode={inputMode}
        maxLength={maxLength}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        className={`w-full rounded-xl border bg-bg px-4 py-3 text-sm text-text outline-none transition placeholder:text-text-muted/70 focus:border-brand-primary focus:ring-4 focus:ring-brand-primary/10 ${
          error ? 'border-error' : 'border-border'
        }`}
        {...register}
      />
      {error && (
        <p id={`${id}-error`} className="mt-1.5 text-xs text-error">
          {error}
        </p>
      )}
    </div>
  );
}

export default AuthField;
