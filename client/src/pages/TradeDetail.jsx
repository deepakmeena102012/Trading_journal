import { useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Pencil, Trash2 } from 'lucide-react';
import api, { errorMessage } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useApi } from '../hooks/useApi';
import { MARKETS, labelOf } from '../lib/constants';
import { capitalize, formatDate, formatMoney, formatPct, formatPrice, formatR, pnlClass } from '../lib/format';
import { Card, ConfirmDialog, DirectionBadge, ErrorBanner, PageHeader, ResultBadge, Spinner } from '../components/ui';
import { ChecklistView } from '../components/Checklist';
import { ScreenshotGallery } from '../components/Screenshots';

function Item({ label, value, className = 'text-ink' }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-line/60 py-2 text-sm last:border-0">
      <dt className="text-muted">{label}</dt>
      <dd className={`num text-right font-medium ${className}`}>{value}</dd>
    </div>
  );
}

function Note({ label, text }) {
  if (!text) return null;
  return (
    <div>
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className="mt-0.5 whitespace-pre-wrap text-sm">{text}</p>
    </div>
  );
}

const FOLLOWED = { yes: 'Yes', partial: 'Partially', no: 'No' };
const RISK_SOURCE = { manual: 'entered risk amount', stopLoss: 'stop-loss distance', percentage: 'risk % × balance' };

export default function TradeDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { currency } = useAuth();
  const { data, loading, error, reload } = useApi(`/trades/${id}`);
  const [confirm, setConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  if (loading) return <Spinner />;
  if (error) return <ErrorBanner message={error} onRetry={reload} />;
  const t = data.trade;
  const money = (v, signed) => formatMoney(v, currency, { signed });
  const bn = t.beforeNotes || {};
  const an = t.afterNotes || {};
  const hasBefore = Object.values(bn).some(Boolean);
  const hasAfter = Object.values(an).some(Boolean);
  const uploadErrors = location.state?.uploadErrors;

  async function onDelete() {
    setDeleting(true);
    try {
      await api.delete(`/trades/${id}`);
      navigate('/trades', { replace: true });
    } catch (err) {
      setDeleteError(errorMessage(err));
      setDeleting(false);
      setConfirm(false);
    }
  }

  return (
    <>
      <Link to="/trades" className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ArrowLeft size={15} /> Trades
      </Link>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            {t.asset} <DirectionBadge direction={t.direction} /> <ResultBadge result={t.result} status={t.status} />
          </span>
        }
        subtitle={`${formatDate(t.date)}${t.time ? ` · ${t.time}` : ''} · ${labelOf(MARKETS, t.market)}`}
        actions={
          <>
            <Link to={`/trades/${id}/edit`} className="btn-secondary">
              <Pencil size={15} /> {t.status === 'open' ? 'Edit / close' : 'Edit'}
            </Link>
            <button type="button" className="btn-danger" onClick={() => setConfirm(true)}>
              <Trash2 size={15} /> Delete
            </button>
          </>
        }
      />

      <div className="space-y-3">
        {deleteError && <ErrorBanner message={deleteError} />}
        {uploadErrors && <ErrorBanner message={`Trade saved, but some screenshots failed to upload: ${uploadErrors.join('; ')}`} />}
      </div>

      <div className="mt-1 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="card p-4">
          <p className="text-xs text-muted">Net P&amp;L</p>
          <p className={`num mt-1 text-xl font-semibold ${pnlClass(t.netPnL)}`}>{t.status === 'open' ? 'Open' : money(t.netPnL, true)}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-muted">R multiple</p>
          <p className={`num mt-1 text-xl font-semibold ${pnlClass(t.rMultiple)}`}>{formatR(t.rMultiple)}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-muted">Risk (1R)</p>
          <p className="num mt-1 text-xl font-semibold">{money(t.riskAmount)}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-muted">Checklist</p>
          <p className="num mt-1 text-xl font-semibold">
            {t.checklistResults?.length ? `${t.compliance.satisfied} / ${t.compliance.applicable}` : '—'}
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card title="Trade information">
          <dl>
            <Item label="Strategy" value={t.strategyName ? `${t.strategyName}${!t.strategyId ? ' (deleted)' : ''}` : '—'} />
            <Item label="Setup" value={t.setup || '—'} />
            <Item label="Timeframe" value={t.timeframe || '—'} />
            <Item label="Session" value={t.session || '—'} />
            <Item label="Direction" value={capitalize(t.direction)} />
            <Item label="Status" value={capitalize(t.status)} />
          </dl>
        </Card>

        <Card title="Prices">
          <dl>
            <Item label="Entry" value={formatPrice(t.entryPrice)} />
            <Item label="Stop loss" value={formatPrice(t.stopLoss)} />
            <Item label="Take profit" value={formatPrice(t.takeProfit)} />
            <Item label="Exit" value={formatPrice(t.exitPrice)} />
            <Item label="Position size" value={formatPrice(t.positionSize)} />
            {t.multiplier !== 1 && <Item label="Multiplier" value={formatPrice(t.multiplier)} />}
          </dl>
        </Card>

        <Card title="Risk & result">
          <dl>
            <Item label="Account balance" value={money(t.accountBalance)} />
            <Item label="Risk amount" value={money(t.riskAmount)} />
            <Item label="Risk %" value={formatPct(t.riskPercentage, 2)} />
            <Item label="Potential reward" value={money(t.potentialReward)} />
            <Item label="Planned R:R" value={t.plannedRR !== null ? `1 : ${t.plannedRR.toFixed(2)}` : '—'} />
            <Item label="Gross P&L" value={money(t.grossPnL, true)} className={pnlClass(t.grossPnL)} />
            <Item label="Fees" value={money(t.fees)} />
            {t.swap !== 0 && <Item label="Swap / funding" value={money(t.swap)} />}
            {t.slippage !== 0 && <Item label="Slippage" value={money(t.slippage)} />}
            <Item label="Net P&L" value={money(t.netPnL, true)} className={pnlClass(t.netPnL)} />
            <Item label="R multiple" value={formatR(t.rMultiple)} className={pnlClass(t.rMultiple)} />
          </dl>
          {t.riskSource && <p className="mt-2 text-xs text-muted">1R based on {RISK_SOURCE[t.riskSource]}.</p>}
          {(t.manualGrossPnL !== null || t.manualResult) && (
            <p className="mt-1 text-xs text-muted">Includes manual adjustments ({[t.manualGrossPnL !== null && 'gross P&L', t.manualResult && 'result'].filter(Boolean).join(', ')}).</p>
          )}
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card title="Strategy compliance">
          {t.checklistResults?.length ? (
            <ChecklistView results={t.checklistResults} />
          ) : (
            <p className="text-sm text-muted">{t.strategyName ? 'No checklist conditions were marked for this trade.' : 'No strategy selected.'}</p>
          )}
        </Card>
        <Card title="Notes" className="lg:col-span-2">
          {!hasBefore && !hasAfter ? (
            <p className="text-sm text-muted">No notes recorded.</p>
          ) : (
            <div className="grid gap-5 sm:grid-cols-2">
              <div className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-soft">Before</p>
                {hasBefore ? (
                  <>
                    <Note label="Trade idea" text={bn.idea} />
                    <Note label="Market condition" text={bn.marketCondition} />
                    <Note label="Why am I taking this trade?" text={bn.reason} />
                    <Note label="What confirms the trade?" text={bn.confirmation} />
                    <Note label="What invalidates the trade?" text={bn.invalidation} />
                  </>
                ) : (
                  <p className="text-sm text-muted">—</p>
                )}
              </div>
              <div className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-soft">After</p>
                {hasAfter ? (
                  <>
                    <Note label="What happened?" text={an.whatHappened} />
                    <Note label="Did I follow my strategy?" text={FOLLOWED[an.followedStrategy]} />
                    <Note label="What mistake did I make?" text={an.mistakes} />
                    <Note label="What did I learn?" text={an.lessons} />
                  </>
                ) : (
                  <p className="text-sm text-muted">—</p>
                )}
              </div>
            </div>
          )}
        </Card>
      </div>

      <Card title="Screenshots" className="mt-4">
        <ScreenshotGallery screenshots={t.screenshots} />
      </Card>

      <ConfirmDialog
        open={confirm}
        title="Delete trade?"
        message="This permanently deletes the trade, its notes and screenshots. Statistics will be recalculated."
        onConfirm={onDelete}
        onCancel={() => setConfirm(false)}
        busy={deleting}
      />
    </>
  );
}
