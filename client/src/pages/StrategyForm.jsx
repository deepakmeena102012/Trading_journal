import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowDown, ArrowUp, Loader2, Plus, Trash2 } from 'lucide-react';
import api, { errorMessage, fieldErrors } from '../lib/api';
import { Card, ErrorBanner, Field, PageHeader, Spinner } from '../components/ui';

const EMPTY = { name: '', description: '', entryRules: '', exitRules: '', riskRules: '', notes: '', active: true, conditions: [] };
let tempKey = 0;
const withKey = (c) => ({ ...c, key: c._id || `new-${++tempKey}` });

export default function StrategyForm() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const [form, setForm] = useState(EMPTY);
  const [loading, setLoading] = useState(isEdit);
  const [loadError, setLoadError] = useState('');
  const [error, setError] = useState('');
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [newCondition, setNewCondition] = useState('');
  const [tradeCount, setTradeCount] = useState(0);

  useEffect(() => {
    if (!isEdit) return;
    api
      .get(`/strategies/${id}`)
      .then((res) => {
        const s = res.data.strategy;
        setTradeCount(s.tradeCount || 0);
        setForm({
          name: s.name,
          description: s.description || '',
          entryRules: s.entryRules || '',
          exitRules: s.exitRules || '',
          riskRules: s.riskRules || '',
          notes: s.notes || '',
          active: s.active,
          conditions: s.conditions.map(withKey),
        });
      })
      .catch((err) => setLoadError(errorMessage(err)))
      .finally(() => setLoading(false));
  }, [id, isEdit]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  function addCondition() {
    const text = newCondition.trim();
    if (!text) return;
    setForm((f) => ({ ...f, conditions: [...f.conditions, withKey({ text })] }));
    setNewCondition('');
  }
  const updateCondition = (key, text) =>
    setForm((f) => ({ ...f, conditions: f.conditions.map((c) => (c.key === key ? { ...c, text } : c)) }));
  const removeCondition = (key) => setForm((f) => ({ ...f, conditions: f.conditions.filter((c) => c.key !== key) }));
  function move(index, delta) {
    setForm((f) => {
      const list = [...f.conditions];
      const target = index + delta;
      if (target < 0 || target >= list.length) return f;
      [list[index], list[target]] = [list[target], list[index]];
      return { ...f, conditions: list };
    });
  }

  async function onSubmit(e) {
    e.preventDefault();
    if (!form.name.trim()) {
      setErrors({ name: 'Strategy name is required' });
      return;
    }
    const pendingText = newCondition.trim();
    const conditions = [...form.conditions, ...(pendingText ? [{ text: pendingText }] : [])]
      .map((c) => ({ _id: c._id, text: c.text.trim() }))
      .filter((c) => c.text);
    setSaving(true);
    setError('');
    setErrors({});
    try {
      const payload = { ...form, conditions };
      if (isEdit) await api.put(`/strategies/${id}`, payload);
      else await api.post('/strategies', payload);
      navigate('/strategies');
    } catch (err) {
      setErrors(fieldErrors(err));
      setError(errorMessage(err, 'Could not save the strategy'));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <Spinner />;
  if (loadError) return <ErrorBanner message={loadError} />;

  const textarea = (k, label, placeholder) => (
    <Field label={label} error={errors[k]}>
      {(fid) => <textarea id={fid} rows={4} className="input" value={form[k]} onChange={set(k)} placeholder={placeholder} />}
    </Field>
  );

  return (
    <form onSubmit={onSubmit} noValidate className="mx-auto max-w-3xl">
      <PageHeader
        title={isEdit ? 'Edit strategy' : 'New strategy'}
        subtitle="Your rules, in your words. The journal never assumes what your strategy is."
        actions={<Link to="/strategies" className="btn-ghost">Cancel</Link>}
      />
      {error && (
        <div className="mb-4">
          <ErrorBanner message={error} />
        </div>
      )}

      <div className="space-y-4">
        <Card title="Strategy">
          <div className="space-y-3">
            <Field label="Strategy name" error={errors.name} required>
              {(fid) => <input id={fid} className="input" value={form.name} onChange={set('name')} placeholder="e.g. BTC Breakout Setup" />}
            </Field>
            <Field label="Description">
              {(fid) => <textarea id={fid} rows={2} className="input" value={form.description} onChange={set('description')} />}
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="h-4 w-4 accent-[#3987e5]" checked={form.active} onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))} />
              Active (available when adding trades)
            </label>
          </div>
        </Card>

        <Card title="Checklist conditions">
          <p className="mb-3 text-sm text-muted">
            These appear on every trade that uses this strategy, where you mark each one Yes, No or N/A.
          </p>
          {isEdit && tradeCount > 0 && (
            <p className="mb-3 rounded-lg bg-raised px-3 py-2 text-xs text-soft">
              {tradeCount} trade(s) use this strategy. Editing condition text keeps their history linked; removed conditions stay on past trades.
            </p>
          )}
          {form.conditions.length > 0 && (
            <ol className="mb-3 space-y-2">
              {form.conditions.map((c, i) => (
                <li key={c.key} className="flex items-center gap-2">
                  <span className="num w-6 shrink-0 text-right text-sm text-muted">{i + 1}.</span>
                  <input
                    className="input"
                    value={c.text}
                    onChange={(e) => updateCondition(c.key, e.target.value)}
                    aria-label={`Condition ${i + 1}`}
                    maxLength={200}
                  />
                  <div className="flex shrink-0">
                    <button type="button" className="btn-ghost p-2" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up">
                      <ArrowUp size={15} />
                    </button>
                    <button type="button" className="btn-ghost p-2" onClick={() => move(i, 1)} disabled={i === form.conditions.length - 1} aria-label="Move down">
                      <ArrowDown size={15} />
                    </button>
                    <button type="button" className="btn-ghost p-2 hover:text-loss" onClick={() => removeCondition(c.key)} aria-label="Remove condition">
                      <Trash2 size={15} />
                    </button>
                  </div>
                </li>
              ))}
            </ol>
          )}
          <div className="flex gap-2">
            <input
              className="input"
              value={newCondition}
              onChange={(e) => setNewCondition(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addCondition();
                }
              }}
              placeholder="e.g. Higher timeframe trend confirmed"
              aria-label="New condition"
              maxLength={200}
            />
            <button type="button" className="btn-secondary shrink-0" onClick={addCondition} disabled={!newCondition.trim()}>
              <Plus size={15} /> Add
            </button>
          </div>
          {errors.conditions && <p className="mt-1 text-xs text-loss">{errors.conditions}</p>}
        </Card>

        <Card title="Rules">
          <div className="space-y-3">
            {textarea('entryRules', 'Entry rules', '1. HTF trend confirmed\n2. …')}
            {textarea('exitRules', 'Exit rules', 'e.g. Fixed SL + target')}
            {textarea('riskRules', 'Risk rules', 'e.g. 1% per trade')}
            {textarea('notes', 'Notes')}
          </div>
        </Card>

        <div className="flex justify-end gap-2">
          <Link to="/strategies" className="btn-secondary">Cancel</Link>
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving && <Loader2 size={15} className="animate-spin" />} {isEdit ? 'Save changes' : 'Create strategy'}
          </button>
        </div>
      </div>
    </form>
  );
}
