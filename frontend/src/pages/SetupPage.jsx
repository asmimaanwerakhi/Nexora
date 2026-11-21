import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import AvatarUpload from '../components/AvatarUpload.jsx';
import CoverPhotoUpload from '../components/CoverPhotoUpload.jsx';
import AuthField from '../components/AuthField.jsx';
import AuthSubmitButton from '../components/AuthSubmitButton.jsx';
import { getAuthErrorMessage, useAuthStore } from '../stores/authStore.js';
import { notifyApp } from '../services/notificationService.js';
import { profileSchema } from '../validators/authSchemas.js';

function SetupPage() {
  const user = useAuthStore((state) => state.user);
  const updateProfile = useAuthStore((state) => state.updateProfile);
  const updatePreferences = useAuthStore((state) => state.updatePreferences);
  const uploadAvatar = useAuthStore((state) => state.uploadAvatar);
  const uploadCoverPhoto = useAuthStore((state) => state.uploadCoverPhoto);
  const [avatarLoading, setAvatarLoading] = useState(false);
  const [coverPhotoLoading, setCoverPhotoLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [preferences, setPreferences] = useState(() => ({
    privacy: {
      profileVisibility: user.privacy?.profileVisibility || 'everyone',
      lastSeenVisibility: user.privacy?.lastSeenVisibility || 'everyone',
      callPermission: user.privacy?.callPermission || 'friends',
      readReceipts: user.privacy?.readReceipts !== false,
      showOnlineStatus: user.privacy?.showOnlineStatus !== false,
      allowFriendRequests: user.privacy?.allowFriendRequests !== false,
    },
    settings: {
      theme: user.settings?.theme || 'system',
      notificationsEnabled: user.settings?.notificationsEnabled !== false,
      language: user.settings?.language || 'en',
      timezone: user.settings?.timezone || 'UTC',
    },
  }));
  const [savingPreferences, setSavingPreferences] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      name: user.name,
      username: user.username || '',
      bio: user.bio?.length <= 160 ? user.bio : '',
      about: user.about || (user.bio?.length > 160 ? user.bio : ''),
      phone: user.phone || '',
    },
  });

  const onSubmit = async (values) => {
    setSaving(true);
    try {
      const updates = { ...values, phone: values.phone || null };
      if (!updates.username) delete updates.username;
      await updateProfile(updates);
      notifyApp('Your profile has been saved.', 'success');
    } catch (error) {
      notifyApp(getAuthErrorMessage(error), 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarUpload = async (file) => {
    setAvatarLoading(true);
    try {
      await uploadAvatar(file);
      notifyApp('Profile photo updated.', 'success');
      return true;
    } catch (error) {
      notifyApp(getAuthErrorMessage(error), 'error');
      return false;
    } finally {
      setAvatarLoading(false);
    }
  };

  const handleCoverPhotoUpload = async (file) => {
    setCoverPhotoLoading(true);
    try {
      await uploadCoverPhoto(file);
      notifyApp('Cover photo updated.', 'success');
      return true;
    } catch (error) {
      notifyApp(getAuthErrorMessage(error), 'error');
      return false;
    } finally {
      setCoverPhotoLoading(false);
    }
  };

  const savePreferences = async (event) => {
    event.preventDefault();
    setSavingPreferences(true);
    try {
      await updatePreferences(preferences);
      notifyApp('Your privacy and preferences have been saved.', 'success');
    } catch (requestError) {
      notifyApp(getAuthErrorMessage(requestError), 'error');
    } finally {
      setSavingPreferences(false);
    }
  };

  const updatePreference = (section, key, value) =>
    setPreferences((current) => ({
      ...current,
      [section]: { ...current[section], [key]: value },
    }));

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="rounded-3xl border border-brand-primary/15 bg-gradient-to-br from-brand-primary-soft via-bg-subtle to-bg p-6 sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-primary-text">
          Account
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-heading">
          Profile &amp; settings
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-text-muted">
          Update how your profile appears to teammates and choose how Nexora works for you.
        </p>
      </header>

      <section className="rounded-2xl border border-border bg-bg p-5 shadow-sm sm:p-7">
        <div>
          <h2 className="text-lg font-semibold text-heading">Cover photo</h2>
          <p className="mt-1 text-sm text-text-muted">
            Set the wide image at the top of your profile.
          </p>
        </div>
        <div className="mt-5">
          <CoverPhotoUpload
            coverPhoto={user.coverPhoto}
            loading={coverPhotoLoading}
            onUpload={handleCoverPhotoUpload}
          />
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-bg p-5 shadow-sm sm:p-7">
        <div>
          <h2 className="text-lg font-semibold text-heading">Profile photo</h2>
          <p className="mt-1 text-sm text-text-muted">
            Your photo helps teammates recognize you across Nexora.
          </p>
        </div>
        <div className="mt-5">
          <AvatarUpload
            avatar={user.avatar}
            loading={avatarLoading}
            onUpload={handleAvatarUpload}
          />
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-bg p-5 shadow-sm sm:p-7">
        <div>
          <h2 className="text-lg font-semibold text-heading">Personal information</h2>
          <p className="mt-1 text-sm text-text-muted">Update the details shown on your profile.</p>
        </div>
        <form className="mt-6 space-y-4" onSubmit={handleSubmit(onSubmit)} noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <AuthField
              id="name"
              label="Full name"
              autoComplete="name"
              register={register('name')}
              error={errors.name?.message}
            />
            <AuthField
              id="username"
              label="Username"
              autoComplete="username"
              placeholder="e.g. rahim_01"
              register={register('username')}
              error={errors.username?.message}
            />
          </div>
          <p className="-mt-2 text-xs text-text-muted">
            Friends can find you by this unique username. You can change it later if available.
          </p>
          <div>
            <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-heading">
              Work email
            </label>
            <input
              id="email"
              type="email"
              value={user.email}
              readOnly
              className="w-full cursor-not-allowed rounded-xl border border-border bg-surface px-4 py-3 text-sm text-text-muted"
            />
          </div>
          <AuthField
            id="phone"
            label="Phone number"
            type="tel"
            autoComplete="tel"
            placeholder="Optional"
            register={register('phone')}
            error={errors.phone?.message}
          />
          <div>
            <AuthField
              id="bio"
              label="Bio"
              placeholder="Frontend developer who loves building useful things."
              maxLength={160}
              register={register('bio')}
              error={errors.bio?.message}
            />
            <p className="mt-1.5 text-xs text-text-muted">
              A short, one-line introduction shown under your name. Up to 160 characters.
            </p>
          </div>
          <div>
            <label htmlFor="about" className="mb-1.5 block text-sm font-medium text-heading">
              About you
            </label>
            <textarea
              id="about"
              rows={5}
              maxLength={2000}
              placeholder="Tell people more about yourself..."
              className={`w-full resize-y rounded-xl border bg-bg px-4 py-3 text-sm text-text outline-none transition placeholder:text-text-muted/70 focus:border-brand-primary focus:ring-4 focus:ring-brand-primary/10 ${
                errors.about ? 'border-error' : 'border-border'
              }`}
              {...register('about')}
            />
            {errors.about?.message && (
              <p className="mt-1.5 text-xs text-error">{errors.about.message}</p>
            )}
            <p className="mt-1.5 text-xs text-text-muted">
              Share more detail about yourself. This appears in the About section of your profile.
            </p>
          </div>
          <div className="pt-1">
            <AuthSubmitButton loading={saving} loadingLabel="Saving changes…">
              Save profile
            </AuthSubmitButton>
          </div>
        </form>
      </section>

      <section className="rounded-2xl border border-border bg-bg p-5 shadow-sm sm:p-7">
        <div>
          <h2 className="text-lg font-semibold text-heading">Privacy &amp; preferences</h2>
          <p className="mt-1 text-sm text-text-muted">
            Control who can find your profile, see activity, and call you.
          </p>
        </div>
        <form className="mt-6 space-y-5" onSubmit={savePreferences}>
          <div className="grid gap-4 sm:grid-cols-2">
            {[
              ['profileVisibility', 'Profile visibility', ['everyone', 'friends']],
              ['lastSeenVisibility', 'Last seen visibility', ['everyone', 'friends', 'nobody']],
              ['callPermission', 'Who can call me', ['everyone', 'friends', 'nobody']],
              ['theme', 'Appearance', ['system', 'light', 'dark']],
              ['language', 'Language', ['en', 'bn']],
            ].map(([key, label, options]) => {
              const section = key === 'theme' || key === 'language' ? 'settings' : 'privacy';
              return (
                <label key={key} className="block text-sm font-medium text-heading">
                  {label}
                  <select
                    value={preferences[section][key]}
                    onChange={(event) => updatePreference(section, key, event.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-border bg-bg px-3 py-2.5 text-sm text-text"
                  >
                    {options.map((option) => (
                      <option key={option} value={option}>
                        {option === 'friends' ? 'Contacts / friends' : option}
                      </option>
                    ))}
                  </select>
                </label>
              );
            })}
          </div>
          {[
            ['showOnlineStatus', 'Show my online status'],
            ['readReceipts', 'Send read receipts'],
            ['allowFriendRequests', 'Accept friend requests'],
          ].map(([key, label]) => (
            <label key={key} className="flex items-center gap-3 text-sm text-text">
              <input
                type="checkbox"
                checked={preferences.privacy[key]}
                onChange={(event) => updatePreference('privacy', key, event.target.checked)}
                className="h-4 w-4 accent-brand-primary"
              />
              {label}
            </label>
          ))}
          <label className="flex items-center gap-3 text-sm text-text">
            <input
              type="checkbox"
              checked={preferences.settings.notificationsEnabled}
              onChange={(event) =>
                updatePreference('settings', 'notificationsEnabled', event.target.checked)
              }
              className="h-4 w-4 accent-brand-primary"
            />
            Enable notifications
          </label>
          <button
            type="submit"
            disabled={savingPreferences}
            className="rounded-xl bg-brand-primary px-4 py-2.5 text-sm font-semibold text-on-primary transition hover:bg-brand-primary-hover disabled:cursor-wait disabled:opacity-50"
          >
            {savingPreferences ? 'Saving…' : 'Save preferences'}
          </button>
        </form>
      </section>
    </div>
  );
}

export default SetupPage;
