import { useEffect, useState } from 'react';
import { Camera, UserRound } from 'lucide-react';

function AvatarUpload({ avatar, loading, onUpload }) {
  const [preview, setPreview] = useState(null);

  useEffect(
    () => () => {
      if (preview) {
        URL.revokeObjectURL(preview);
      }
    },
    [preview],
  );

  const handleChange = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) {
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    setPreview(objectUrl);
    const uploaded = await onUpload(file);
    if (uploaded) {
      URL.revokeObjectURL(objectUrl);
      setPreview(null);
    }
    if (preview) {
      URL.revokeObjectURL(preview);
    }
  };

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row">
      <div className="grid h-24 w-24 shrink-0 place-items-center overflow-hidden rounded-full bg-brand-primary-soft text-brand-primary-text ring-4 ring-bg-subtle">
        {preview || avatar ? (
          <img src={preview || avatar} alt="Profile" className="h-full w-full object-cover" />
        ) : (
          <UserRound size={36} strokeWidth={1.5} />
        )}
      </div>
      <div className="text-center sm:text-left">
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-border bg-bg px-4 py-2.5 text-sm font-semibold text-heading transition hover:bg-surface">
          <Camera size={16} />
          {loading ? 'Uploading…' : 'Change photo'}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            disabled={loading}
            onChange={handleChange}
          />
        </label>
        <p className="mt-2 text-xs text-text-muted">JPEG, PNG, or WebP up to 5 MB</p>
      </div>
    </div>
  );
}

export default AvatarUpload;
