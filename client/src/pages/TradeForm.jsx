import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import api, { errorMessage, fieldErrors } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useApi } from '../hooks/useApi';
import { MARKETS, RESULTS, SESSIONS, TIMEFRAMES } from '../lib/constants';
import { nowInTimezone } from '../lib/dates';
import { formatMoney, formatPct, formatR, pnlClass } from '../lib/format';
import { previewTrade } from '../lib/tradePreview';
import { Card, ErrorBanner, Field, PageHeader, ResultBadge, Spinner } from '../components/ui';
import { ChecklistInput } from '../components/Checklist';
import { ScreenshotSlots } from '../components/Screenshots';

const s = (v) => (v === null || v === undefined ? '' : String(v));

function emptyForm(user) {
  const { date, time } = nowInTimezone(user?.timezone);
  return {
    date,
    time,
    asset: '',
    market: user?.defaultMarket || 'crypto',
    direction: 'long',
    strategyId: '',
    setup: '',
    timeframe: user?.defaultTimeframe || '',
    session: '',
    entryPrice: '',
    stopLoss: '',
    takeProfit: '',
    exitPrice: '',
    positionSize: '',
    multiplier: '1',
    fees: '',
    swap: '',
    slippage: '',
    accountBalance: '',
    riskAmount: '',
    riskPercentage: '',
    manualGrossPnL: '',
    manualResult: '',
    checklist: {},
    beforeNotes: { idea: '', marketCondition: '', reason: '', confirmation: '', invalidation: '' },
    afterNotes: { whatHappened: '', followedStrategy: '', mistakes: '', lessons: '' },
  };
}

function tradeToForm(t) {
  return {
    date: t.date,
    time: t.time || '',
    asset: t.asset,
    market: t.market,
    direction: t.direction,
    strategyId: t.strategyId || '',
    setup: t.setup || '',
    timeframe: t.timeframe || '',
    session: t.session || '',
    entryPrice: s(t.entryPrice),
    stopLoss: s(t.stopLoss),
    takeProfit: s(t.takeProfit),
    exitPrice: s(t.exitPrice),
    positionSize: s(t.positionSize),
    multiplier: s(t.multiplier ?? 1),
    fees: t.fees ? s(t.fees) : '',
    swap: t.swap ? s(t.swap) : '',
    slippage: t.slippage ? s(t.slippage) : '',
    accountBalance: s(t.accountBalance),
    riskAmount: s(t.riskAmountInput),
    riskPercentage: s(t.riskPercentageInput),
    manualGrossPnL: s(t.manualGrossPnL),
    manualResult: t.manualResult || '',
    checklist: Object.fromEntries((t.checklistResults || []).map((c) => [c.conditionId, c.value])),
    beforeNotes: { idea: '', marketCondition: '', reason: '', confirmation: '', invalidation: '', ...t.beforeNotes },
    afterNotes: { whatHappened: '', followedStrategy: '', mistakes: '', lessons: '', ...t.afterNotes },
  };
}

export default function TradeForm() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const { user, currency } = useAuth();
  const topRef = useRef(null);

  const [form, setForm] = useState(() => emptyForm(user));
  const [trade, setTrade] = useState(null);
  const [loading, setLoading] = useState(isEdit);
  const [loadError, setLoadError] = useState('');
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [pending, setPending] = useState({});
  const [removing, setRemoving] = useState(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const strategies = useApi('/strategies');
  const meta = useApi('/trades/meta');
  const settings = useApi(isEdit ? null : '/settings');

  useEffect(() => {
    if (!isEdit) return;
    setLoading(true);
    api
      .get(`/trades/${id}`)
      .then((res) => {
        setTrade(res.data.trade);
        setForm(tradeToForm(res.data.trade));
        if (res.data.trade.manualGrossPnL !== null || res.data.trade.manualResult || res.data.trade.multiplier !== 1) setShowAdvanced(true);
      })
      .catch((err) => setLoadError(errorMessage(err)))
      .finally(() => setLoading(false));
  }, [id, isEdit]);

  // Pre-fill the account balance for new trades with the current realised balance.
  useEffect(() => {
    const bal = settings.data?.settings?.currentBalance;
    if (!isEdit && bal > 0) setForm((f) => (f.accountBalance === '' ? { ...f, accountBalance: String(bal) } : f));
  }, [settings.data, isEdit]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const setNote = (group, key) => (e) => setForm((f) => ({ ...f, [group]: { ...f[group], [key]: e.target.value } }));

  const strategyList = strategies.data?.strategies || [];
  const selectedStrategy = strategyList.find((x) => x._id === form.strategyId);
  const selectableStrategies = strategyList.filter((x) => x.active || x._id === form.strategyId);
  const preview = useMemo(() => previewTrade(form), [form]);
  const defaultRisk = user?.defaultRiskPercentage;
  const balanceNum = Number(form.accountBalance);

  // Condition ids that belong to the trade but are no longer on the strategy (edited later).
  const legacyConditions = useMemo(() => {
    if (!trade || !selectedStrategy || String(trade.strategyId) !== selectedStrategy._id) return [];
    const current = new Set(selectedStrategy.conditions.map((c) => c._id));
    return (trade.checklistResults || []).filter((c) => !current.has(c.conditionId)).map((c) => ({ _id: c.conditionId, text: `${c.text} (removed from strategy)` }));
  }, [trade, selectedStrategy]);
  const checklistConditions = selectedStrategy ? [...selectedStrategy.conditions, ...legacyConditions] : [];

  function validateLocal() {
    const e = {};
    if (!form.date) e.date = 'Trade date is required';
    if (!form.asset.trim()) e.asset = 'Asset is required';
    if (!(Number(form.entryPrice) > 0)) e.entryPrice = 'Entry price must be greater than 0';
    if (!(Number(form.positionSize) > 0)) e.positionSize = 'Position size must be greater than 0';
    return { ...e, ...preview.warnings };
  }

  async function onSubmit(e) {
    e.preventDefault();
    const local = validateLocal();
    setErrors(local);
    if (Object.keys(local).length) {
      setError('Please fix the highlighted fields.');
      topRef.current?.scrollIntoView({ behavior: 'smooth' });
      return;
    }
    setSaving(true);
    setError('');
    const { checklist, ...rest } = form;
    // If the strategy list isn't available, send the recorded answers unchanged
    // (the server validates them) rather than silently dropping the checklist.
    const checklistResults = selectedStrategy
      ? checklistConditions.filter((c) => checklist[c._id]).map((c) => ({ conditionId: c._id, value: checklist[c._id] }))
      : form.strategyId
        ? Object.entries(checklist).filter(([, v]) => v).map(([conditionId, value]) => ({ conditionId, value }))
        : [];
    const payload = { ...rest, checklistResults };
    try {
      const res = isEdit ? await api.put(`/trades/${id}`, payload) : await api.post('/trades', payload);
      const saved = res.data.trade;
      const uploadErrors = [];
      for (const [kind, file] of Object.entries(pending)) {
        if (!file) continue;
        const fd = new FormData();
        fd.append('kind', kind);
        fd.append('image', file);
        try {
          await api.post(`/trades/${saved._id}/screenshots`, fd);
        } catch (err) {
          uploadErrors.push(`${kind}: ${errorMessage(err)}`);
        }
      }
      navigate(`/trades/${saved._id}`, { replace: isEdit, state: uploadErrors.length ? { uploadErrors } : undefined });
    } catch (err) {
      setErrors(fieldErrors(err));
      setError(errorMessage(err, 'Could not save the trade'));
      topRef.current?.scrollIntoView({ behavior: 'smooth' });
    } finally {
      setSaving(false);
    }
  }

  async function removeScreenshot(kind) {
    if (!window.confirm('Delete this screenshot?')) return;
    setRemoving(kind);
    try {
      const res = await api.delete(`/trades/${id}/screenshots/${kind}`);
      setTrade(res.data.trade);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setRemoving(null);
    }
  }

  if (loading) return <Spinner />;
  if (loadError) return <ErrorBanner message={loadError} />;

  const input = (key, props = {}) => (
    <Field label={props.label} error={errors[key]} hint={props.hint} required={props.required}>
      {(fid) => (
        <input
          id={fid}
          className="input"
          value={form[key]}
          onChange={set(key)}
          inputMode={props.numeric ? 'decimal' : undefined}
          type={props.type || 'text'}
          step={props.numeric ? 'any' : undefined}
          placeholder={props.placeholder}
          list={props.list}
          aria-invalid={Boolean(errors[key])}
        />
      )}
    </Field>
  );

  const Calc = ({ label, value, className = 'text-ink', note }) => (
    <div className="flex items-baseline justify-between gap-3 py-1.5 text-sm">
      <span className="text-muted">{label}</span>
      <span className={`num text-right font-medium ${className}`}>
        {value}
        {note && <span className="block text-[11px] font-normal text-muted">{note}</span>}
      </span>
    </div>
  );

  const riskNote = { manual: 'from risk amount', stopLoss: 'from stop loss', percentage: 'from risk % × balance' }[preview.riskSource];
  const aboveDefault = defaultRisk > 0 && preview.riskPercentage > defaultRisk + 1e-9;

  return (
    <form onSubmit={onSubmit} noValidate>
      <div ref={topRef} className="scroll-mt-20" />
      <PageHeader
        title={isEdit ? 'Edit trade' : 'Add trade'}
        subtitle="Leave the exit price empty while the trade is open."
        actions={
          <Link to={isEdit ? `/trades/${id}` : '/trades'} className="btn-ghost">
            Cancel
          </Link>
        }
      />
      {error && (
        <div className="mb-4">
          <ErrorBanner message={error} />
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card title="Basic information">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {input('date', { label: 'Trade date', type: 'date', required: true })}
              {input('time', { label: 'Trade time', type: 'time' })}
              {input('asset', { label: 'Asset', required: true, placeholder: 'e.g. BTCUSDT', list: 'assets-list' })}
              <Field label="Market" error={errors.market}>
                {(fid) => (
                  <select id={fid} className="input" value={form.market} onChange={set('market')}>
                    {MARKETS.map((m) => (
                      <option key={m.value} value={m.value}>{m.label}</option>
                    ))}
                  </select>
                )}
              </Field>
              <div>
                <span className="label">Direction</span>
                <div className="grid grid-cols-2 gap-1 rounded-lg border border-line bg-bg p-1" role="radiogroup" aria-label="Direction">
                  {['long', 'short'].map((d) => (
                    <button
                      key={d}
                      type="button"
                      role="radio"
                      aria-checked={form.direction === d}
                      onClick={() => setForm((f) => ({ ...f, direction: d }))}
                      className={`rounded-md py-1.5 text-sm font-medium ${form.direction === d ? 'bg-raised text-ink' : 'text-muted'}`}
                    >
                      {d === 'long' ? '▲ Long' : '▼ Short'}
                    </button>
                  ))}
                </div>
              </div>
              <Field label="Strategy" error={errors.strategyId}>
                {(fid) => (
                  <select id={fid} className="input" value={form.strategyId} onChange={(e) => setForm((f) => ({ ...f, strategyId: e.target.value, checklist: {} }))}>
                    <option value="">{trade?.strategyName && !trade.strategyId ? `${trade.strategyName} (deleted)` : 'No strategy'}</option>
                    {selectableStrategies.map((x) => (
                      <option key={x._id} value={x._id}>
                        {x.name}
                        {!x.active ? ' (inactive)' : ''}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
              {input('setup', { label: 'Setup', list: 'setups-list', placeholder: 'Optional' })}
              {input('timeframe', { label: 'Timeframe', list: 'timeframes-list', placeholder: 'e.g. 15m' })}
              {input('session', { label: 'Trading session', list: 'sessions-list', placeholder: 'e.g. London' })}
            </div>
            <datalist id="assets-list">{(meta.data?.assets || []).map((a) => <option key={a} value={a} />)}</datalist>
            <datalist id="setups-list">{(meta.data?.setups || []).map((a) => <option key={a} value={a} />)}</datalist>
            <datalist id="timeframes-list">{[...new Set([...TIMEFRAMES, ...(meta.data?.timeframes || [])])].map((a) => <option key={a} value={a} />)}</datalist>
            <datalist id="sessions-list">{[...new Set([...SESSIONS, ...(meta.data?.sessions || [])])].map((a) => <option key={a} value={a} />)}</datalist>
            {strategyList.length === 0 && !strategies.loading && (
              <p className="mt-3 text-xs text-muted">
                Tip: <Link to="/strategies/new" className="text-accent hover:underline">create a strategy</Link> to journal trades against your own checklist.
              </p>
            )}
          </Card>

          {selectedStrategy && (
            <Card title={`Strategy checklist · ${selectedStrategy.name}`}>
              {checklistConditions.length ? (
                <ChecklistInput
                  conditions={checklistConditions}
                  value={form.checklist}
                  onChange={(checklist) => setForm((f) => ({ ...f, checklist }))}
                />
              ) : (
                <p className="text-sm text-muted">
                  This strategy has no checklist conditions.{' '}
                  <Link to={`/strategies/${selectedStrategy._id}/edit`} className="text-accent hover:underline">Add conditions</Link>
                </p>
              )}
            </Card>
          )}

          <Card title="Prices & position">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {input('entryPrice', { label: 'Entry price', numeric: true, required: true })}
              {input('stopLoss', { label: 'Stop loss', numeric: true })}
              {input('takeProfit', { label: 'Take profit', numeric: true })}
              {input('exitPrice', { label: 'Exit price', numeric: true, hint: 'Empty = open trade' })}
              {input('positionSize', { label: 'Position size', numeric: true, required: true, hint: 'Units / lots / contracts' })}
              {input('multiplier', { label: 'Multiplier', numeric: true, hint: 'Value per 1.0 price move per unit' })}
              {input('fees', { label: 'Fees', numeric: true, placeholder: '0' })}
              {input('swap', { label: 'Swap / funding', numeric: true, placeholder: '0', hint: 'Paid = positive, received = negative' })}
              {input('slippage', { label: 'Slippage', numeric: true, placeholder: '0' })}
            </div>
          </Card>

          <Card title="Risk management">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {input('accountBalance', { label: `Account balance (${currency})`, numeric: true })}
              {input('riskAmount', { label: `Risk amount (${currency})`, numeric: true, hint: 'Optional – overrides stop-loss risk' })}
              <Field
                label="Risk %"
                error={errors.riskPercentage}
                hint={
                  defaultRisk > 0 ? (
                    <button type="button" className="text-accent hover:underline" onClick={() => setForm((f) => ({ ...f, riskPercentage: String(defaultRisk) }))}>
                      Use default ({defaultRisk}%{balanceNum > 0 ? ` = ${formatMoney((balanceNum * defaultRisk) / 100, currency)}` : ''})
                    </button>
                  ) : 'Used only when no stop loss or risk amount is set'
                }
              >
                {(fid) => <input id={fid} className="input" inputMode="decimal" value={form.riskPercentage} onChange={set('riskPercentage')} />}
              </Field>
            </div>
            <p className="mt-3 text-xs text-muted">
              Risk (1R) is taken from the risk amount if entered, otherwise from the distance between entry and stop loss, otherwise from risk % × balance.
            </p>
          </Card>

          <Card
            title="Result adjustments"
            action={
              <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={() => setShowAdvanced((v) => !v)} aria-expanded={showAdvanced}>
                {showAdvanced ? 'Hide' : 'Show'}
              </button>
            }
          >
            {showAdvanced ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {input('manualGrossPnL', {
                  label: `Manual gross P&L (${currency})`,
                  numeric: true,
                  hint: 'Optional. Overrides the price-based gross P&L (e.g. currency conversion, partial closes).',
                })}
                <Field label="Manual result" hint="Optional. Overrides the automatic Win / Loss / Break-even.">
                  {(fid) => (
                    <select id={fid} className="input" value={form.manualResult} onChange={set('manualResult')}>
                      <option value="">Automatic</option>
                      {RESULTS.map((r) => (
                        <option key={r.value} value={r.value}>{r.label}</option>
                      ))}
                    </select>
                  )}
                </Field>
              </div>
            ) : (
              <p className="text-sm text-muted">P&L and result are calculated automatically. Open to adjust them manually.</p>
            )}
          </Card>

          <Card title="Notes – before the trade">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {[
                ['idea', 'Trade idea'],
                ['marketCondition', 'Market condition'],
                ['reason', 'Why am I taking this trade?'],
                ['confirmation', 'What confirms the trade?'],
                ['invalidation', 'What invalidates the trade?'],
              ].map(([k, label]) => (
                <Field key={k} label={label}>
                  {(fid) => <textarea id={fid} rows={2} className="input" value={form.beforeNotes[k]} onChange={setNote('beforeNotes', k)} />}
                </Field>
              ))}
            </div>
          </Card>

          <Card title="Notes – after the trade">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="What happened?">
                {(fid) => <textarea id={fid} rows={2} className="input" value={form.afterNotes.whatHappened} onChange={setNote('afterNotes', 'whatHappened')} />}
              </Field>
              <Field label="Did I follow my strategy?">
                {(fid) => (
                  <select id={fid} className="input" value={form.afterNotes.followedStrategy} onChange={setNote('afterNotes', 'followedStrategy')}>
                    <option value="">Not answered</option>
                    <option value="yes">Yes</option>
                    <option value="partial">Partially</option>
                    <option value="no">No</option>
                  </select>
                )}
              </Field>
              <Field label="What mistake did I make?">
                {(fid) => <textarea id={fid} rows={2} className="input" value={form.afterNotes.mistakes} onChange={setNote('afterNotes', 'mistakes')} />}
              </Field>
              <Field label="What did I learn?">
                {(fid) => <textarea id={fid} rows={2} className="input" value={form.afterNotes.lessons} onChange={setNote('afterNotes', 'lessons')} />}
              </Field>
            </div>
          </Card>

          <Card title="Screenshots">
            <ScreenshotSlots
              existing={trade?.screenshots || []}
              pending={pending}
              onPendingChange={setPending}
              onRemoveExisting={removeScreenshot}
              removing={removing}
            />
          </Card>
        </div>

        {/* Live calculation summary */}
        <div className="lg:col-span-1">
          <div className="space-y-4 lg:sticky lg:top-8">
            <Card title="Calculated">
              <div className="divide-y divide-line/60">
                <Calc label="Risk (1R)" value={formatMoney(preview.riskAmount, currency)} note={riskNote} />
                <Calc
                  label="Risk %"
                  value={formatPct(preview.riskPercentage, 2)}
                  className={aboveDefault ? 'text-[#fab219]' : 'text-ink'}
                  note={aboveDefault ? `Above your default ${defaultRisk}%` : undefined}
                />
                <Calc label="Potential reward" value={formatMoney(preview.potentialReward, currency)} />
                <Calc label="Planned R:R" value={preview.plannedRR !== null ? `1 : ${preview.plannedRR.toFixed(2)}` : '—'} />
                <Calc label="Gross P&L" value={formatMoney(preview.grossPnL, currency, { signed: true })} className={pnlClass(preview.grossPnL)} />
                <Calc label="Fees & costs" value={formatMoney(preview.totalCosts, currency)} />
                <Calc label="Net P&L" value={formatMoney(preview.netPnL, currency, { signed: true })} className={pnlClass(preview.netPnL)} />
                <Calc label="R multiple" value={formatR(preview.rMultiple)} className={pnlClass(preview.rMultiple)} />
                <div className="flex items-center justify-between py-2 text-sm">
                  <span className="text-muted">Result</span>
                  <ResultBadge result={preview.result} status={preview.status} />
                </div>
              </div>
              <p className="mt-2 text-[11px] text-muted">Preview only. Final values are recalculated and validated by the server when you save.</p>
            </Card>
            <button type="submit" className="btn-primary w-full py-2.5" disabled={saving || strategies.loading}>
              {saving && <Loader2 size={15} className="animate-spin" />}
              {isEdit ? 'Save changes' : 'Save trade'}
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}
