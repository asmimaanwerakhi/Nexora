import { useState } from 'react';
import { createGroupConversation, uploadGroupAvatar } from '../services/chatApi.js';

function CreateGroupDialog({ friends, onClose, onCreated }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [memberIds, setMemberIds] = useState([]);
  const [avatar, setAvatar] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const toggleMember = (userId) => {
    setMemberIds((current) =>
      current.includes(userId) ? current.filter((id) => id !== userId) : [...current, userId],
    );
  };

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    setSaving(true);
    try {
      const conversation = await createGroupConversation({
        name: name.trim(),
        description: description.trim(),
        participantIds: memberIds,
      });
      let avatarError = '';
      if (avatar) {
        try {
          await uploadGroupAvatar(conversation.id, avatar);
        } catch (uploadError) {
          avatarError =
            uploadError.response?.data?.error?.message ||
            uploadError.message ||
            'The group was created, but its image could not be uploaded.';
        }
      }
      await onCreated(conversation, avatarError);
    } catch (createError) {
      setError(
        createError.response?.data?.error?.message ||
          createError.message ||
          'Could not create the group.',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
      <form
        onSubmit={submit}
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl border border-border bg-bg p-5 shadow-2xl sm:p-7"
      >
        <h2 className="text-xl font-semibold text-heading">Create a group</h2>
        <p className="mt-1 text-sm text-text-muted">Choose a name and at least one friend.</p>
        {error && (
          <p role="alert" className="mt-4 rounded-xl bg-error/10 px-3 py-2 text-sm text-error">
            {error}
          </p>
        )}
        <label className="mt-5 block text-sm font-medium text-heading">
          Group name
          <input
            required
            maxLength={100}
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="mt-1 w-full rounded-xl border border-border bg-bg-subtle px-3 py-2 outline-none focus:border-brand-primary"
          />
        </label>
        <label className="mt-4 block text-sm font-medium text-heading">
          Description
          <textarea
            maxLength={500}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={2}
            className="mt-1 w-full resize-y rounded-xl border border-border bg-bg-subtle px-3 py-2 outline-none focus:border-brand-primary"
          />
        </label>
        <label className="mt-4 block text-sm font-medium text-heading">
          Group image
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(event) => setAvatar(event.target.files?.[0] || null)}
            className="mt-1 block w-full text-sm text-text-muted"
          />
        </label>
        <fieldset className="mt-5">
          <legend className="text-sm font-semibold text-heading">
            Members ({memberIds.length} selected)
          </legend>
          <div className="mt-2 max-h-52 overflow-y-auto rounded-xl border border-border">
            {friends.length ? (
              friends.map((friend) => (
                <label
                  key={friend.id}
                  className="flex cursor-pointer items-center gap-3 border-b border-border px-3 py-2 last:border-b-0 hover:bg-bg-subtle"
                >
                  <input
                    type="checkbox"
                    checked={memberIds.includes(friend.id)}
                    onChange={() => toggleMember(friend.id)}
                  />
                  <span className="grid h-8 w-8 place-items-center overflow-hidden rounded-full bg-brand-primary-soft text-xs font-semibold text-brand-primary-text">
                    {friend.avatar ? (
                      <img src={friend.avatar} alt="" className="h-full w-full object-cover" />
                    ) : (
                      friend.name?.slice(0, 1).toUpperCase() || '?'
                    )}
                  </span>
                  <span className="text-sm text-heading">{friend.name}</span>
                  {friend.username && (
                    <span className="ml-auto text-xs text-text-muted">@{friend.username}</span>
                  )}
                </label>
              ))
            ) : (
              <p className="px-3 py-4 text-sm text-text-muted">
                Add friends before creating a group.
              </p>
            )}
          </div>
        </fieldset>
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-border px-4 py-2 text-sm text-text-muted hover:bg-bg-subtle"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving || !name.trim() || memberIds.length === 0}
            className="rounded-xl bg-brand-primary px-4 py-2 text-sm font-semibold text-on-primary disabled:opacity-50"
          >
            {saving ? 'Creating…' : 'Create group'}
          </button>
        </div>
      </form>
    </div>
  );
}

export default CreateGroupDialog;
