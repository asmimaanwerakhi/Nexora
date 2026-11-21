import { useEffect, useState } from 'react';
import { Camera, ImagePlus } from 'lucide-react';

function CoverPhotoUpload({ coverPhoto, loading, onUpload }) {
  const [preview, setPreview] = useState(null);

  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );

  const handleChange = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    const objectUrl = URL.createObjectURL(file);
    setPreview(objectUrl);
    const uploaded = await onUpload(file);
    if (uploaded) {
      URL.revokeObjectURL(objectUrl);
      setPreview(null);
    }
    if (preview) URL.revokeObjectURL(preview);
  };

  return (
    <div className="space-y-3">
      <div className="relative h-32 overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-brand-100 via-brand-50 to-charcoal-100 sm:h-40">
        {(preview || coverPhoto) && (
          <img
            src={preview || coverPhoto}
            alt="Cover photo preview"
            className="h-full w-full object-cover"
          />
        )}
        {!preview && !coverPhoto && (
          <div className="absolute inset-0 grid place-items-center text-brand-primary-text">
            <ImagePlus size={30} strokeWidth={1.5} />
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-border bg-bg px-4 py-2.5 text-sm font-semibold text-heading transition hover:bg-surface">
          <Camera size={16} />
          {loading ? 'Uploading…' : coverPhoto ? 'Change cover photo' : 'Upload cover photo'}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            disabled={loading}
            onChange={handleChange}
          />
        </label>
        <p className="text-xs text-text-muted">JPEG, PNG, or WebP up to 5 MB</p>
      </div>
    </div>
  );
}

export default CoverPhotoUpload;
