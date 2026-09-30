import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Copy, ListChecks, Pencil, Plus, Power, Trash2 } from 'lucide-react';
import api, { errorMessage } from '../lib/api';
import { useApi } from '../hooks/useApi';
import { Badge, Card, ConfirmDialog, EmptyState, ErrorBanner, PageHeader, Spinner } from '../components/ui';

export default function Strategies() {
  const { data, loading, error, reload } = useApi('/strategies');
  const [busyId, setBusyId] = useState(null);
  const [actionError, setActionError] = useState('');
  const [toDelete, setToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  async function run(id, fn) {
    setBusyId(id);
    setActionError('');
    try {
      await fn();
      await reload();
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  async function confirmDelete() {
    setDeleting(true);
    try {
      await api.delete(`/strategies/${toDelete._id}`, { params: toDelete.tradeCount ? { force: 'true' } : {} });
      setToDelete(null);
      await reload();
    } catch (err) {
      setActionError(errorMessage(err));
      setToDelete(null);
    } finally {
      setDeleting(false);
    }
  }

  const strategies = data?.strategies || [];

  return (
    <>
      <PageHeader
        title="Strategies"
        subtitle="Define your own rules and checklist. Each trade is journaled against them."
        actions={
          <Link to="/strategies/new" className="btn-primary">
            <Plus size={16} /> New strategy
          </Link>
        }
      />
      {(error || actionError) && (
        <div className="mb-4">
          <ErrorBanner message={error || actionError} onRetry={error ? reload : undefined} />
        </div>
      )}

      {loading && !data ? (
        <Spinner />
      ) : strategies.length === 0 ? (
        <Card>
          <EmptyState
            icon={ListChecks}
            title="No strategies yet"
            message="Create a strategy with your entry, exit and risk rules plus the checklist conditions you want to verify before every trade."
            action={<Link to="/strategies/new" className="btn-primary"><Plus size={16} /> Create strategy</Link>}
          />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {strategies.map((s) => (
            <div key={s._id} className={`card flex flex-col p-4 ${s.active ? '' : 'opacity-70'}`}>
              <div className="flex items-start justify-between gap-2">
                <h2 className="font-semibold">{s.name}</h2>
                {s.active ? <Badge tone="profit">Active</Badge> : <Badge>Inactive</Badge>}
              </div>
              {s.description && <p className="mt-1 line-clamp-2 text-sm text-muted">{s.description}</p>}
              <p className="mt-3 text-xs text-muted">
                {s.conditions.length} checklist condition{s.conditions.length === 1 ? '' : 's'} · {s.tradeCount} trade{s.tradeCount === 1 ? '' : 's'}
              </p>
              {s.conditions.length > 0 && (
                <ol className="mt-2 list-inside list-decimal space-y-0.5 text-sm text-soft">
                  {s.conditions.slice(0, 5).map((c) => (
                    <li key={c._id} className="truncate">{c.text}</li>
                  ))}
                  {s.conditions.length > 5 && <li className="list-none text-xs text-muted">+{s.conditions.length - 5} more</li>}
                </ol>
              )}
              <div className="mt-auto flex flex-wrap gap-1 pt-4">
                <Link to={`/strategies/${s._id}/edit`} className="btn-ghost px-2.5 py-1.5 text-xs">
                  <Pencil size={14} /> Edit
                </Link>
                <button type="button" className="btn-ghost px-2.5 py-1.5 text-xs" disabled={busyId === s._id} onClick={() => run(s._id, () => api.post(`/strategies/${s._id}/duplicate`))}>
                  <Copy size={14} /> Duplicate
                </button>
                <button
                  type="button"
                  className="btn-ghost px-2.5 py-1.5 text-xs"
                  disabled={busyId === s._id}
                  onClick={() => run(s._id, () => api.patch(`/strategies/${s._id}/active`, { active: !s.active }))}
                >
                  <Power size={14} /> {s.active ? 'Deactivate' : 'Activate'}
                </button>
                <Link to={`/trades?strategyId=${s._id}`} className="btn-ghost px-2.5 py-1.5 text-xs">
                  Trades
                </Link>
                <button type="button" className="btn-ghost ml-auto px-2.5 py-1.5 text-xs text-loss hover:text-loss" onClick={() => setToDelete(s)}>
                  <Trash2 size={14} /> Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={Boolean(toDelete)}
        title={`Delete "${toDelete?.name}"?`}
        message={
          toDelete?.tradeCount
            ? `${toDelete.tradeCount} trade(s) use this strategy. They will keep their strategy name and checklist history, but the strategy itself will be removed. Consider deactivating it instead.`
            : 'This strategy will be permanently deleted.'
        }
        onConfirm={confirmDelete}
        onCancel={() => setToDelete(null)}
        busy={deleting}
      />
    </>
  );
}
