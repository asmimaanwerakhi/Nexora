import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import AuthCard from '../components/AuthCard.jsx';
import AuthField from '../components/AuthField.jsx';
import AuthSubmitButton from '../components/AuthSubmitButton.jsx';
import FormAlert from '../components/FormAlert.jsx';
import { getAuthErrorMessage, useAuthStore } from '../stores/authStore.js';
import { loginSchema } from '../validators/authSchemas.js';

function Login() {
  const [formError, setFormError] = useState('');
  const [verificationRequired, setVerificationRequired] = useState(false);
  const [loading, setLoading] = useState(false);
  const login = useAuthStore((state) => state.login);
  const sessionRestoreError = useAuthStore((state) => state.sessionRestoreError);
  const location = useLocation();
  const navigate = useNavigate();
  const verified = location.state?.verified;
  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors },
  } = useForm({ resolver: zodResolver(loginSchema), defaultValues: { email: '', password: '' } });

  const onSubmit = async (values) => {
    setFormError('');
    setVerificationRequired(false);
    setLoading(true);
    try {
      await login(values);
      navigate(location.state?.from?.pathname || '/profile', { replace: true });
    } catch (error) {
      const message = getAuthErrorMessage(error);
      setVerificationRequired(error.response?.data?.error?.code === 'EMAIL_NOT_VERIFIED');
      setFormError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthCard
      eyebrow="Welcome back"
      title="Sign in to Nexora"
      description="Use your work email to continue to your workspace."
    >
      <div className="space-y-5">
        <FormAlert>{location.state?.logoutError}</FormAlert>
        <FormAlert>{sessionRestoreError}</FormAlert>
        <FormAlert success>
          {location.state?.passwordReset
            ? 'Your password was reset. Sign in with your new password.'
            : null}
        </FormAlert>
        <FormAlert success={Boolean(verified)}>
          {verified ? 'Your email is verified. You can sign in now.' : null}
        </FormAlert>
        <FormAlert>{formError}</FormAlert>
        {verificationRequired && (
          <Link
            to="/verify-email"
            state={{ email: getValues('email') }}
            className="-mt-3 block text-sm font-semibold text-brand-primary-text hover:underline"
          >
            Verify email address
          </Link>
        )}
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
            id="password"
            label="Password"
            type="password"
            autoComplete="current-password"
            placeholder="Your password"
            register={register('password')}
            error={errors.password?.message}
          />
          <div className="flex justify-end">
            <Link
              to="/forgot-password"
              className="text-sm font-medium text-brand-primary-text hover:underline"
            >
              Forgot password?
            </Link>
          </div>
          <AuthSubmitButton loading={loading}>Sign in</AuthSubmitButton>
        </form>
        <p className="text-center text-sm text-text-muted">
          New to Nexora?{' '}
          <Link to="/signup" className="font-semibold text-brand-primary-text hover:underline">
            Create an account
          </Link>
        </p>
      </div>
    </AuthCard>
  );
}

export default Login;
