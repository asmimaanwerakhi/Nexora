import { useState } from 'react';
import {
  addGroupMember,
  leaveGroup,
  removeGroupMember,
  updateGroupAdmin,
  updateGroupInfo,
  updateGroupNotifications,
  updateGroupPermissions,
  uploadGroupAvatar,
} from '../services/chatApi.js';

const permissionLabels = {
  adminsOnlyMessages: 'Only admins can send messages',
  adminsOnlyAddMembers: 'Only admins can add members',
  adminsOnlyEditInfo: 'Only admins can edit group information',
};

function GroupInfoDialog({ conversation, friends, currentUserId, onClose, onUpdated, onLeft }) {
  const [name, setName] = useState(conversation.name);
  const [description, setDescription] = useState(conversation.description || '');
  const [permissions, setPermissions] = useState(conversation.permissions);
  const [selectedMemberId, setSelectedMemberId] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const isAdmin = ['owner', 'admin'].includes(conversation.currentRole);
  const canEditInfo = isAdmin || !permissions.adminsOnlyEditInfo;
  const canAddMembers = isAdmin || !permissions.adminsOnlyAddMembers;
  const currentMember = conversation.members.find((member) => member.id === currentUserId);
  const availableFriends = friends.filter(
    (friend) => !conversation.members.some((member) => member.id === friend.id),
  );

  const run = async (action, success) => {
    setError('');
    setSaving(true);
    try {
      await action();
      await onUpdated();
      if (success) success();
    } catch (actionError) {
      setError(
        actionError.response?.data?.error?.message ||
          actionError.message ||
          'Could not update the group.',
      );
    } finally {
      setSaving(false);
    }
  };

  const saveInfo = (event) => {
    event.preventDefault();
    void run(() =>
      updateGroupInfo(conversation.id, { name: name.trim(), description: description.trim() }),
    );
  };

  const handlePermission = (key, value) => {
    const updated = { ...permissions, [key]: value };
    setPermissions(updated);
    void run(
      () => updateGroupPermissions(conversation.id, { [key]: value }),
      () => setPermissions(updated),
    );
  };

  const handleAvatar = (event) => {
    const [file] = event.target.files || [];
    event.target.value = '';
    if (file) void run(() => uploadGroupAvatar(conversation.id, file));
  };

  const handleAddMember = (event) => {
    event.preventDefault();
    if (!selectedMemberId) return;
    void run(
      () => addGroupMember(conversation.id, selectedMemberId),
      () => setSelectedMemberId(''),
    );
  };

  const handleLeave = async () => {
    if (!window.confirm('Leave this group?')) return;
    await run(() => leaveGroup(conversation.id), onLeft);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-border bg-bg p-5 shadow-2xl sm:p-7">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-brand-primary-text">
              Group information
            </p>
            <h2 className="mt-1 text-xl font-semibold text-heading">{conversation.name}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close group information"
            className="rounded-full px-3 py-1 text-text-muted hover:bg-bg-subtle"
          >
            ✕
          </button>
        </div>
        {error && (
          <p role="alert" className="mt-4 rounded-xl bg-error/10 px-3 py-2 text-sm text-error">
            {error}
          </p>
        )}
        <form onSubmit={saveInfo} className="mt-5 grid gap-3 sm:grid-cols-[1fr_auto]">
          <label className="text-sm font-medium text-heading">
            Name
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={100}
              disabled={!canEditInfo}
              className="mt-1 w-full rounded-xl border border-border bg-bg-subtle px-3 py-2 disabled:opacity-60"
            />
          </label>
          <label className="text-sm font-medium text-heading sm:col-span-2">
            Description
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              maxLength={500}
              rows={2}
              disabled={!canEditInfo}
              className="mt-1 w-full resize-y rounded-xl border border-border bg-bg-subtle px-3 py-2 disabled:opacity-60"
            />
          </label>
          <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
            <button
              type="submit"
              disabled={saving || !canEditInfo}
              className="rounded-xl bg-brand-primary px-4 py-2 text-sm font-semibold text-on-primary disabled:opacity-50"
            >
              Save group info
            </button>
            <label className="cursor-pointer rounded-xl border border-border px-4 py-2 text-sm text-text-muted hover:bg-bg-subtle">
              Change image
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                disabled={!canEditInfo || saving}
                onChange={handleAvatar}
                className="hidden"
              />
            </label>
          </div>
        </form>

        <section className="mt-7">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-semibold text-heading">Members ({conversation.members.length})</h3>
            <label className="flex items-center gap-2 text-xs text-text-muted">
              <input
                type="checkbox"
                checked={Boolean(conversation.muted)}
                disabled={saving}
                onChange={(event) =>
                  void run(() => updateGroupNotifications(conversation.id, event.target.checked))
                }
              />
              Mute notifications
            </label>
          </div>
          {canAddMembers && availableFriends.length > 0 && (
            <form onSubmit={handleAddMember} className="mt-3 flex gap-2">
              <select
                value={selectedMemberId}
                onChange={(event) => setSelectedMemberId(event.target.value)}
                className="min-w-0 flex-1 rounded-xl border border-border bg-bg-subtle px-3 py-2 text-sm"
              >
                <option value="">Choose a friend to add</option>
                {availableFriends.map((friend) => (
                  <option key={friend.id} value={friend.id}>
                    {friend.name}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                disabled={saving || !selectedMemberId}
                className="rounded-xl border border-border px-3 py-2 text-sm disabled:opacity-50"
              >
                Add
              </button>
            </form>
          )}
          <div className="mt-3 divide-y divide-border rounded-xl border border-border">
            {conversation.members.map((member) => (
              <div key={member.id} className="flex items-center gap-3 px-3 py-2.5">
                <span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full bg-brand-primary-soft text-xs font-semibold text-brand-primary-text">
                  {member.avatar ? (
                    <img src={member.avatar} alt="" className="h-full w-full object-cover" />
                  ) : (
                    member.name?.slice(0, 1).toUpperCase() || '?'
                  )}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm text-heading">
                  {member.name}
                  {member.id === currentUserId && ' (you)'}
                </span>
                <span className="text-xs capitalize text-text-muted">
                  {member.role === 'owner' ? 'Owner' : member.role}
                </span>
                {isAdmin && member.role !== 'owner' && member.id !== currentUserId && (
                  <>
                    <button
                      type="button"
                      disabled={saving}
                      className="text-xs text-brand-primary-text hover:underline disabled:opacity-50"
                      onClick={() =>
                        void run(() =>
                          updateGroupAdmin(
                            conversation.id,
                            member.id,
                            member.role === 'admin' ? 'member' : 'admin',
                          ),
                        )
                      }
                    >
                      {member.role === 'admin' ? 'Demote' : 'Make admin'}
                    </button>
                    <button
                      type="button"
                      disabled={saving}
                      className="text-xs text-error hover:underline disabled:opacity-50"
                      onClick={() => {
                        if (!window.confirm(`Remove ${member.name} from this group?`)) return;
                        void run(() => removeGroupMember(conversation.id, member.id));
                      }}
                    >
                      Remove
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
        </section>

        {isAdmin && (
          <section className="mt-7">
            <h3 className="font-semibold text-heading">Group permissions</h3>
            <div className="mt-2 grid gap-2 rounded-xl border border-border p-3">
              {Object.entries(permissionLabels).map(([key, label]) => (
                <label key={key} className="flex items-center gap-2 text-sm text-text-muted">
                  <input
                    type="checkbox"
                    checked={Boolean(permissions[key])}
                    disabled={saving}
                    onChange={(event) => handlePermission(key, event.target.checked)}
                  />
                  {label}
                </label>
              ))}
            </div>
          </section>
        )}

        <div className="mt-7 flex justify-between">
          <button
            type="button"
            disabled={saving}
            onClick={() => void handleLeave()}
            className="rounded-xl border border-error/30 px-4 py-2 text-sm text-error hover:bg-error/5 disabled:opacity-50"
          >
            Leave group
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-border px-4 py-2 text-sm text-text-muted hover:bg-bg-subtle"
          >
            Close
          </button>
        </div>
        {currentMember?.notificationsMuted && (
          <p className="mt-2 text-xs text-text-muted">Notifications for this group are muted.</p>
        )}
      </div>
    </div>
  );
}

export default GroupInfoDialog;
