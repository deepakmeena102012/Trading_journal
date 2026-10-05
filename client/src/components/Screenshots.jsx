import { useEffect, useState } from 'react';
import { Camera, ImageOff, ImagePlus, Loader2, Trash2 } from 'lucide-react';
import api from '../lib/api';
import { SCREENSHOT_KINDS } from '../lib/constants';
import { Modal } from './ui';

export const MAX_IMAGE_MB = 4;
const MAX_INPUT_MB = 40;
const MAX_DIMENSION = 2560;
const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
const ACCEPT = 'image/*';

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('decode'));
    };
    img.src = url;
  });
}

function canvasToBlob(canvas, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
}

/**
 * Returns a file the server will accept: small images in an allowed format are kept as-is,
 * anything else (too large, or another browser-decodable format) is re-encoded as a JPEG.
 */
async function prepareImage(file) {
  if (ALLOWED_TYPES.includes(file.type) && file.size <= MAX_IMAGE_MB * 1024 * 1024) return file;

  const img = await loadImage(file);
  let maxDim = MAX_DIMENSION;
  for (const quality of [0.85, 0.75, 0.65, 0.55]) {
    const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff'; // JPEG has no transparency
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await canvasToBlob(canvas, quality);
    if (blob && blob.size <= MAX_IMAGE_MB * 1024 * 1024) {
      const name = `${file.name.replace(/\.[^.]+$/, '') || 'screenshot'}.jpg`;
      return new File([blob], name, { type: 'image/jpeg' });
    }
    maxDim = Math.round(maxDim * 0.8);
  }
  throw new Error('too-large');
}

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

/** Opens the device camera directly on phones/tablets (falls back to a file picker on desktop). */
function CameraButton({ onPick }) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-1 text-accent hover:underline">
      <Camera size={12} aria-hidden />
      Take photo
      <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => onPick(e.target)} />
    </label>
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
  const [processing, setProcessing] = useState(null);

  useEffect(() => {
    const urls = {};
    for (const [kind, file] of Object.entries(pending)) if (file) urls[kind] = URL.createObjectURL(file);
    setPreviews(urls);
    return () => Object.values(urls).forEach((u) => URL.revokeObjectURL(u));
  }, [pending]);

  async function pick(kind, input) {
    const file = input.files?.[0];
    input.value = ''; // allow picking the same file again
    setError('');
    if (!file) return;
    if (file.type && !file.type.startsWith('image/')) return setError('Please choose an image file.');
    if (file.size > MAX_INPUT_MB * 1024 * 1024) return setError(`Images must be ${MAX_INPUT_MB} MB or smaller.`);
    setProcessing(kind);
    try {
      const ready = await prepareImage(file);
      onPendingChange((prev) => ({ ...prev, [kind]: ready }));
    } catch (err) {
      setError(
        err.message === 'too-large'
          ? 'This image is too large even after compression. Try cropping it.'
          : 'This image format is not supported by your browser. Please use PNG, JPEG, WEBP or GIF.'
      );
    } finally {
      setProcessing(null);
    }
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
                  <div className="mt-1 flex gap-3 text-xs">
                    <label className="cursor-pointer text-accent hover:underline">
                      Replace
                      <input type="file" accept={ACCEPT} className="sr-only" onChange={(e) => pick(k.value, e.target)} />
                    </label>
                    <CameraButton onPick={(input) => pick(k.value, input)} />
                  </div>
                </div>
              ) : (
                <label className="flex aspect-video cursor-pointer flex-col items-center justify-center gap-1 rounded bg-bg text-xs text-muted hover:text-soft">
                  {processing === k.value ? (
                    <>
                      <Loader2 size={20} className="animate-spin" aria-hidden />
                      Preparing image…
                    </>
                  ) : (
                    <>
                      <ImagePlus size={20} aria-hidden />
                      Add image
                    </>
                  )}
                  <input type="file" accept={ACCEPT} className="sr-only" onChange={(e) => pick(k.value, e.target)} />
                </label>
              )}
              {!file && !shot && processing !== k.value && (
                <div className="mt-1 text-xs">
                  <CameraButton onPick={(input) => pick(k.value, input)} />
                </div>
              )}
            </div>
          );
        })}
      </div>
      {error && <p className="mt-2 text-xs text-loss">{error}</p>}
      <p className="mt-2 text-xs text-muted">Optional. Upload a screenshot or take a photo with your camera. Large images are compressed automatically.</p>
    </div>
  );
}
