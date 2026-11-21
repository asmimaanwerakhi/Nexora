import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import AuthCard from '../components/AuthCard.jsx';
import AuthField from '../components/AuthField.jsx';
import AuthSubmitButton from '../components/AuthSubmitButton.jsx';
import FormAlert from '../components/FormAlert.jsx';
import { getAuthErrorMessage, useAuthStore } from '../stores/authStore.js';
import { resetPasswordSchema } from '../validators/authSchemas.js';

function ResetPassword() {
  const [formError, setFormError] = useState('');
  const [loading, setLoading] = useState(false);
  const resetPassword = useAuthStore((state) => state.resetPassword);
  const location = useLocation();
  const navigate = useNavigate();
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: {
      email: location.state?.email || '',
      code: '',
      password: '',
      confirmPassword: '',
    },
  });

  useEffect(() => {
    if (location.state?.email) {
      setValue('email', location.state.email);
    }
  }, [location.state?.email, setValue]);

  const onSubmit = async ({ confirmPassword, ...values }) => {
    void confirmPassword;
    setFormError('');
    setLoading(true);
    try {
      await resetPassword(values);
      navigate('/login', {
        replace: true,
        state: { passwordReset: true },
      });
    } catch (error) {
      setFormError(getAuthErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthCard
      eyebrow="Set a new password"
      title="Reset your password"
      description="Enter the 6-digit code from your email and choose a new password."
    >
      <div className="space-y-5">
        <FormAlert>{formError}</FormAlert>
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
            label="Reset code"
            autoComplete="one-time-code"
            inputMode="numeric"
            maxLength={6}
            placeholder="000000"
            register={register('code')}
            error={errors.code?.message}
          />
          <AuthField
            id="password"
            label="New password"
            type="password"
            autoComplete="new-password"
            placeholder="At least 8 characters"
            register={register('password')}
            error={errors.password?.message}
          />
          <AuthField
            id="confirmPassword"
            label="Confirm new password"
            type="password"
            autoComplete="new-password"
            placeholder="Enter your new password again"
            register={register('confirmPassword')}
            error={errors.confirmPassword?.message}
          />
          <AuthSubmitButton loading={loading} loadingLabel="Updating password…">
            Update password
          </AuthSubmitButton>
        </form>
        <p className="text-center text-sm text-text-muted">
          Need a new code?{' '}
          <Link
            to="/forgot-password"
            className="font-semibold text-brand-primary-text hover:underline"
          >
            Request another
          </Link>
        </p>
      </div>
    </AuthCard>
  );
}

export default ResetPassword;
