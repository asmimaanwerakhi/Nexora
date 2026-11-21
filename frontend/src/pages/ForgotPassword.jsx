import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import AuthCard from '../components/AuthCard.jsx';
import AuthField from '../components/AuthField.jsx';
import AuthSubmitButton from '../components/AuthSubmitButton.jsx';
import FormAlert from '../components/FormAlert.jsx';
import { getAuthErrorMessage, useAuthStore } from '../stores/authStore.js';
import { emailSchema } from '../validators/authSchemas.js';

function ForgotPassword() {
  const [formError, setFormError] = useState('');
  const [loading, setLoading] = useState(false);
  const requestPasswordReset = useAuthStore((state) => state.requestPasswordReset);
  const navigate = useNavigate();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({ resolver: zodResolver(emailSchema), defaultValues: { email: '' } });

  const onSubmit = async (values) => {
    setFormError('');
    setLoading(true);
    try {
      await requestPasswordReset(values.email);
      navigate('/reset-password', { state: { email: values.email } });
    } catch (error) {
      setFormError(getAuthErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthCard
      eyebrow="Account recovery"
      title="Forgot your password?"
      description="Enter your account email and we’ll send a password reset code if the account exists."
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
          <AuthSubmitButton loading={loading} loadingLabel="Sending code…">
            Send reset code
          </AuthSubmitButton>
        </form>
        <p className="text-center text-sm text-text-muted">
          Remembered it?{' '}
          <Link to="/login" className="font-semibold text-brand-primary-text hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </AuthCard>
  );
}

export default ForgotPassword;
