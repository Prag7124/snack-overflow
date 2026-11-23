import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import { api, ApiClientError, resolveImageUrl } from '../api';
import { useAuth } from '../context/AuthContext';
import type { Snack, SnackCategory } from '../types';

interface SnackFormModalProps {
  open: boolean;
  editingSnack: Snack | null;
  onClose: () => void;
  onSaved: (snack: Snack, isEdit: boolean) => void;
}

const CATEGORIES: Array<{ value: SnackCategory; label: string }> = [
  { value: 'sweet', label: '🍪 Sweet' },
  { value: 'savoury', label: '🥨 Savoury' },
  { value: 'drink', label: '🥤 Drink' },
  { value: 'healthy-ish', label: '🥜 Healthy-ish' },
];

export function SnackFormModal({
  open,
  editingSnack,
  onClose,
  onSaved,
}: SnackFormModalProps) {
  const { token } = useAuth();
  const [name, setName] = useState('');
  const [category, setCategory] = useState<SnackCategory>('sweet');
  const [quantity, setQuantity] = useState(10);
  const [threshold, setThreshold] = useState(5);
  const [imageUrl, setImageUrl] = useState<string>('');
  const [uploadingImage, setUploadingImage] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (editingSnack) {
      setName(editingSnack.name);
      setCategory(editingSnack.category);
      setQuantity(editingSnack.quantity);
      setThreshold(editingSnack.low_stock_threshold);
      setImageUrl(editingSnack.image_url || '');
    } else {
      setName('');
      setCategory('sweet');
      setQuantity(12);
      setThreshold(5);
      setImageUrl('');
    }
  }, [open, editingSnack]);

  if (!open) return null;

  async function handleFileSelect(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !token) return;
    setError(null);
    setUploadingImage(true);
    try {
      const uploadedUrl = await api.uploadSnackImage(token, file);
      setImageUrl(uploadedUrl);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Image upload failed');
    } finally {
      setUploadingImage(false);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setError(null);
    setSubmitting(true);
    try {
      const cleanImage = imageUrl.trim() || null;
      if (editingSnack) {
        const updated = await api.updateSnack(token, editingSnack.id, {
          name: name.trim(),
          category,
          low_stock_threshold: threshold,
          image_url: cleanImage,
        });
        onSaved(updated, true);
      } else {
        const created = await api.createSnack(token, {
          name: name.trim(),
          category,
          quantity,
          low_stock_threshold: threshold,
          image_url: cleanImage,
        });
        onSaved(created, false);
      }
      onClose();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Failed to save snack');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs px-4">
      <div className="w-full max-w-md bg-white rounded-2xl border border-slate-200 shadow-xl p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <h2 className="text-lg font-bold text-slate-900">
            {editingSnack ? 'Edit Snack Details' : 'Add New Snack to Pantry'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 text-lg font-bold px-2 cursor-pointer"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {/* Image Upload Picker + Preview */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-1.5">
              Snack Photo (Upload from Computer)
            </label>
            <div className="flex items-center gap-3">
              {imageUrl ? (
                <img
                  src={resolveImageUrl(imageUrl) || ''}
                  alt="Preview"
                  className="w-16 h-16 rounded-lg object-cover border border-slate-200 shrink-0"
                />
              ) : (
                <div className="w-16 h-16 rounded-lg bg-slate-100 border border-dashed border-slate-300 flex items-center justify-center text-xs text-slate-400 shrink-0">
                  No photo
                </div>
              )}
              <div className="flex-1 space-y-1.5">
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  onChange={handleFileSelect}
                  disabled={uploadingImage}
                  className="block w-full text-xs text-slate-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-amber-50 file:text-amber-900 hover:file:bg-amber-100 cursor-pointer"
                />
                <p className="text-[11px] text-slate-400">
                  {uploadingImage
                    ? 'Uploading image...'
                    : 'JPG, PNG, or WEBP up to 5 MB'}
                </p>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-1">
              Snack Name
            </label>
            <input
              type="text"
              required
              minLength={2}
              maxLength={120}
              placeholder="e.g., Dark Chocolate Sea Salt Almonds"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-1">
              Category
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as SnackCategory)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
            >
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {!editingSnack && (
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-1">
                  Initial Stock
                </label>
                <input
                  type="number"
                  min={0}
                  max={500}
                  required
                  value={quantity}
                  onChange={(e) => setQuantity(Number(e.target.value))}
                  className="w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
            )}

            <div className={editingSnack ? 'col-span-2' : ''}>
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-1">
                Low-Stock Alert Threshold
              </label>
              <input
                type="number"
                min={0}
                max={200}
                required
                value={threshold}
                onChange={(e) => setThreshold(Number(e.target.value))}
                className="w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
          </div>

          {error && (
            <div className="rounded-lg bg-rose-50 border border-rose-200 px-3.5 py-2 text-xs text-rose-700">
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || uploadingImage}
              className="rounded-lg bg-slate-900 hover:bg-slate-800 disabled:opacity-50 px-4 py-2 text-xs font-semibold text-white cursor-pointer"
            >
              {submitting ? 'Saving...' : editingSnack ? 'Save Changes' : 'Add Snack'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
