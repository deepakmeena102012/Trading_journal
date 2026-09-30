import { useEffect, useState } from 'react';
import { ImageOff, ImagePlus, Loader2, Trash2 } from 'lucide-react';
import api from '../lib/api';
import { SCREENSHOT_KINDS } from '../lib/constants';
import { Modal } from './ui';

export const MAX_IMAGE_MB = 4;
const ACCEPT = 'image/png,image/jpeg,image/webp,image/gif';

/** Loads a private screenshot with the auth header and renders it via an object URL. */
export function AuthImage({ id, alt, className, onClick }) {
  const [src, setSrc] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let url;
    let cancelled = false;
    setFailed(false);
    api
      .get(`/screenshots/${id}`, { responseType: 'blob' })
      .then((res) => {
        if (cancelled) return;
        url = URL.createObjectURL(res.data);
        setSrc(url);
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [id]);

  if (failed) {
    return (
      <div className={`flex items-center justify-center bg-bg text-muted ${className}`}>
        <ImageOff size={20} aria-label="Image could not be loaded" />
      </div>
    );
  }
  if (!src) {
    return (
      <div className={`flex items-center justify-center bg-bg text-muted ${className}`}>
        <Loader2 size={18} className="animate-spin" aria-label="Loading image" />
      </div>
    );
  }
  return onClick ? (
    <button type="button" onClick={() => onClick(src)} className="block w-full" aria-label={`Open ${alt}`}>
      <img src={src} alt={alt} className={className} />
    </button>
  ) : (
    <img src={src} alt={alt} className={className} />
  );
}

/** Read-only gallery with a lightbox, used on the trade detail page. */
export function ScreenshotGallery({ screenshots }) {
  const [open, setOpen] = useState(null);
  if (!screenshots?.length) return <p className="text-sm text-muted">No screenshots attached.</p>;
  return (
    <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {SCREENSHOT_KINDS.map((k) => {
          const shot = screenshots.find((s) => s.kind === k.value);
          if (!shot) return null;
          return (
            <figure key={k.value}>
              <AuthImage
                id={shot.screenshotId}
                alt={k.label}
                className="aspect-video w-full rounded-lg border border-line object-cover"
                onClick={(src) => setOpen({ src, label: k.label })}
              />
              <figcaption className="mt-1 text-xs text-muted">{k.label}</figcaption>
            </figure>
          );
        })}
      </div>
      <Modal open={Boolean(open)} onClose={() => setOpen(null)} title={open?.label || ''} size="max-w-5xl">
        {open && <img src={open.src} alt={open.label} className="mx-auto max-h-[75vh] w-auto rounded" />}
      </Modal>
    </>
  );
}

/**
 * Editable screenshot slots for the trade form.
 * Existing screenshots can be removed immediately; new files are kept as `pending`
 * and uploaded by the form after the trade is saved.
 */
export function ScreenshotSlots({ existing = [], pending, onPendingChange, onRemoveExisting, removing }) {
  const [error, setError] = useState('');
  const [previews, setPreviews] = useState({});

  useEffect(() => {
    const urls = {};
    for (const [kind, file] of Object.entries(pending)) if (file) urls[kind] = URL.createObjectURL(file);
    setPreviews(urls);
    return () => Object.values(urls).forEach((u) => URL.revokeObjectURL(u));
  }, [pending]);

  function pick(kind, file) {
    setError('');
    if (!file) return;
    if (!ACCEPT.split(',').includes(file.type)) return setError('Only PNG, JPEG, WEBP or GIF images are allowed.');
    if (file.size > MAX_IMAGE_MB * 1024 * 1024) return setError(`Images must be ${MAX_IMAGE_MB} MB or smaller.`);
    onPendingChange({ ...pending, [kind]: file });
  }

  return (
    <div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {SCREENSHOT_KINDS.map((k) => {
          const shot = existing.find((s) => s.kind === k.value);
          const file = pending[k.value];
          return (
            <div key={k.value} className="rounded-lg border border-dashed border-line p-2">
              <p className="mb-2 text-xs font-medium text-soft">{k.label}</p>
              {file ? (
                <div className="relative">
                  <img src={previews[k.value]} alt={`${k.label} preview`} className="aspect-video w-full rounded object-cover" />
                  <button
                    type="button"
                    className="btn-secondary absolute right-1.5 top-1.5 p-1.5"
                    onClick={() => onPendingChange({ ...pending, [k.value]: null })}
                    aria-label={`Remove selected ${k.label} image`}
                  >
                    <Trash2 size={14} />
                  </button>
                  <p className="mt-1 truncate text-xs text-muted">Will upload on save · {file.name}</p>
                </div>
              ) : shot ? (
                <div className="relative">
                  <AuthImage id={shot.screenshotId} alt={k.label} className="aspect-video w-full rounded object-cover" />
                  <button
                    type="button"
                    className="btn-secondary absolute right-1.5 top-1.5 p-1.5"
                    onClick={() => onRemoveExisting(k.value)}
                    disabled={removing === k.value}
                    aria-label={`Delete ${k.label} screenshot`}
                  >
                    {removing === k.value ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                  </button>
                  <label className="mt-1 block cursor-pointer text-xs text-accent hover:underline">
                    Replace
                    <input type="file" accept={ACCEPT} className="sr-only" onChange={(e) => pick(k.value, e.target.files?.[0])} />
                  </label>
                </div>
              ) : (
                <label className="flex aspect-video cursor-pointer flex-col items-center justify-center gap-1 rounded bg-bg text-xs text-muted hover:text-soft">
                  <ImagePlus size={20} aria-hidden />
                  Add image
                  <input type="file" accept={ACCEPT} className="sr-only" onChange={(e) => pick(k.value, e.target.files?.[0])} />
                </label>
              )}
            </div>
          );
        })}
      </div>
      {error && <p className="mt-2 text-xs text-loss">{error}</p>}
      <p className="mt-2 text-xs text-muted">Optional. PNG, JPEG, WEBP or GIF up to {MAX_IMAGE_MB} MB each.</p>
    </div>
  );
}
