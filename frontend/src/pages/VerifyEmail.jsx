import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useWatch } from 'react-hook-form';
import AuthCard from '../components/AuthCard.jsx';
import AuthField from '../components/AuthField.jsx';
import AuthSubmitButton from '../components/AuthSubmitButton.jsx';
import FormAlert from '../components/FormAlert.jsx';
import { getAuthErrorMessage, useAuthStore } from '../stores/authStore.js';
import { otpVerificationSchema } from '../validators/authSchemas.js';

function VerifyEmail() {
  const [formError, setFormError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendSeconds, setResendSeconds] = useState(0);
  const verifyEmail = useAuthStore((state) => state.verifyEmail);
  const resendVerification = useAuthStore((state) => state.resendVerification);
  const location = useLocation();
  const navigate = useNavigate();
  const {
    register,
    handleSubmit,
    setValue,
    control,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(otpVerificationSchema),
    defaultValues: { email: location.state?.email || '', code: '' },
  });
  const emailValue = useWatch({ control, name: 'email' });

  useEffect(() => {
    if (location.state?.email) {
      setValue('email', location.state.email);
    }
  }, [location.state?.email, setValue]);

  useEffect(() => {
    if (resendSeconds <= 0) {
      return undefined;
    }
    const timer = window.setTimeout(() => setResendSeconds((seconds) => seconds - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [resendSeconds]);

  const onSubmit = async (values) => {
    setFormError('');
    setLoading(true);
    try {
      await verifyEmail(values);
      navigate('/login', { replace: true, state: { verified: true } });
    } catch (error) {
      setFormError(getAuthErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setFormError('');
    setSuccess('');
    setResending(true);
    try {
      const result = await resendVerification(emailValue);
      setSuccess('If this email has an unverified account, a new code has been sent.');
      setResendSeconds(result.resendAfterSeconds || 60);
    } catch (error) {
      setFormError(getAuthErrorMessage(error));
    } finally {
      setResending(false);
    }
  };

  return (
    <AuthCard
      eyebrow="Email verification"
      title="Check your inbox"
      description="Enter the 6-digit code we sent to your email. The code expires in 5 minutes."
    >
      <div className="space-y-5">
        <FormAlert>{formError}</FormAlert>
        <FormAlert success>{success}</FormAlert>
        <form className="space-y-4" onSubmit={handleSubmit(onSubmit)} noValidate>
          <AuthField
            id="email"
            label="Work email"
            type="email"
            autoComplete="email"
            placeholder="you@company.com"
            register={register('email')}
            error={errors.email?.message}
          />
          <AuthField
            id="code"
            label="Verification code"
            autoComplete="one-time-code"
            inputMode="numeric"
            maxLength={6}
            placeholder="000000"
            register={register('code')}
            error={errors.code?.message}
          />
          <AuthSubmitButton loading={loading} loadingLabel="Verifying…">
            Verify email
          </AuthSubmitButton>
        </form>
        <div className="flex items-center justify-between gap-3 text-sm">
          <button
            type="button"
            onClick={handleResend}
            disabled={resending || resendSeconds > 0}
            className="font-semibold text-brand-primary-text hover:underline disabled:cursor-not-allowed disabled:opacity-60"
          >
            {resending
              ? 'Sending…'
              : resendSeconds > 0
                ? `Resend code in ${resendSeconds}s`
                : 'Resend code'}
          </button>
          <Link to="/login" className="text-text-muted hover:text-heading">
            Back to sign in
          </Link>
        </div>
      </div>
    </AuthCard>
  );
}

export default VerifyEmail;
