import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import AuthCard from '../components/AuthCard.jsx';
import AuthField from '../components/AuthField.jsx';
import AuthSubmitButton from '../components/AuthSubmitButton.jsx';
import FormAlert from '../components/FormAlert.jsx';
import { getAuthErrorMessage, useAuthStore } from '../stores/authStore.js';
import { signupSchema } from '../validators/authSchemas.js';

function Signup() {
  const [formError, setFormError] = useState('');
  const [loading, setLoading] = useState(false);
  const signup = useAuthStore((state) => state.signup);
  const navigate = useNavigate();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(signupSchema),
    defaultValues: { name: '', email: '', password: '', confirmPassword: '' },
  });

  const onSubmit = async ({ confirmPassword, ...values }) => {
    void confirmPassword;
    setFormError('');
    setLoading(true);
    try {
      await signup(values);
      navigate('/verify-email', { state: { email: values.email } });
    } catch (error) {
      setFormError(getAuthErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthCard
      eyebrow="Get started"
      title="Create your account"
      description="Sign up with your work email. We’ll send you a verification code."
    >
      <div className="space-y-5">
        <FormAlert>{formError}</FormAlert>
        <form className="space-y-4" onSubmit={handleSubmit(onSubmit)} noValidate>
          <AuthField
            id="name"
            label="Full name"
            autoComplete="name"
            placeholder="Your name"
            register={register('name')}
            error={errors.name?.message}
          />
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
            autoComplete="new-password"
            placeholder="At least 8 characters"
            register={register('password')}
            error={errors.password?.message}
          />
          <AuthField
            id="confirmPassword"
            label="Confirm password"
            type="password"
            autoComplete="new-password"
            placeholder="Enter your password again"
            register={register('confirmPassword')}
            error={errors.confirmPassword?.message}
          />
          <AuthSubmitButton loading={loading} loadingLabel="Creating account…">
            Create account
          </AuthSubmitButton>
        </form>
        <p className="text-center text-sm text-text-muted">
          Already have an account?{' '}
          <Link to="/login" className="font-semibold text-brand-primary-text hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </AuthCard>
  );
}

export default Signup;
