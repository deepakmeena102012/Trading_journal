import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Download, Loader2, LogOut, Upload } from 'lucide-react';
import api, { downloadFile, errorMessage, fieldErrors } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { CURRENCIES, MARKETS, TIMEFRAMES } from '../lib/constants';
import { TIMEZONES } from '../lib/dates';
import { formatMoney } from '../lib/format';
import { Card, ErrorBanner, Field, Modal, PageHeader, Spinner } from '../components/ui';

function Notice({ tone = 'ok', children }) {
  const cls = tone === 'ok' ? 'border-profit/30 bg-profit/10 text-profit' : 'border-loss/30 bg-loss/10 text-loss';
  return <div className={`rounded-lg border px-3 py-2 text-sm ${cls}`} role="status">{children}</div>;
}

function PasswordModal({ open, title, message, confirmLabel, onClose, onConfirm }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) {
      setPassword('');
      setError('');
    }
  }, [open]);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await onConfirm(password);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={busy ? undefined : onClose} title={title}>
      <form onSubmit={submit} className="space-y-3">
        <p className="text-sm text-soft">{message}</p>
        <Field label="Confirm with your password" error={error}>
          {(id) => <input id={id} type="password" className="input" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />}
        </Field>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="btn-danger" disabled={busy || !password}>
            {busy && <Loader2 size={14} className="animate-spin" />} {confirmLabel}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export default function Settings() {
  const { user, setUser, logout } = useAuth();
  const [params] = useSearchParams();
  const [form, setForm] = useState(null);
  const [balance, setBalance] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [errors, setErrors] = useState({});
  const [status, setStatus] = useState(null);
  const [saving, setSaving] = useState(false);

  const [pw, setPw] = useState({ currentPassword: '', newPassword: '' });
  const [pwStatus, setPwStatus] = useState(null);
  const [pwBusy, setPwBusy] = useState(false);

  const [dataStatus, setDataStatus] = useState(null);
  const [dataBusy, setDataBusy] = useState('');
  const [importResult, setImportResult] = useState(null);
  const [restoreFile, setRestoreFile] = useState(null);
  const [restoreSettings, setRestoreSettings] = useState(true);
  const [danger, setDanger] = useState(null); // 'trades' | 'account'

  function load() {
    return api
      .get('/settings')
      .then((res) => {
        const s = res.data.settings;
        setBalance({ current: s.currentBalance, realized: s.realizedPnL });
        setForm({
          name: s.name,
          accountName: s.accountName || '',
          baseCurrency: s.baseCurrency,
          startingBalance: String(s.startingBalance ?? 0),
          defaultRiskPercentage: String(s.defaultRiskPercentage ?? ''),
          timezone: s.timezone,
          defaultMarket: s.defaultMarket,
          defaultTimeframe: s.defaultTimeframe || '',
        });
      })
      .catch((err) => setLoadError(errorMessage(err)));
  }
  useEffect(() => {
    load();
  }, []);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function saveSettings(e) {
    e.preventDefault();
    setSaving(true);
    setStatus(null);
    setErrors({});
    try {
      const res = await api.put('/settings', form);
      setUser(res.data.user);
      setBalance({ current: res.data.settings.currentBalance, realized: res.data.settings.realizedPnL });
      setStatus({ tone: 'ok', text: 'Settings saved.' });
    } catch (err) {
      setErrors(fieldErrors(err));
      setStatus({ tone: 'error', text: errorMessage(err) });
    } finally {
      setSaving(false);
    }
  }

  async function changePassword(e) {
    e.preventDefault();
    setPwBusy(true);
    setPwStatus(null);
    try {
      await api.put('/auth/password', pw);
      setPw({ currentPassword: '', newPassword: '' });
      setPwStatus({ tone: 'ok', text: 'Password updated.' });
    } catch (err) {
      setPwStatus({ tone: 'error', text: errorMessage(err) });
    } finally {
      setPwBusy(false);
    }
  }

  async function withData(key, fn) {
    setDataBusy(key);
    setDataStatus(null);
    try {
      await fn();
    } catch (err) {
      setDataStatus({ tone: 'error', text: errorMessage(err) });
    } finally {
      setDataBusy('');
    }
  }

  async function importCsv(file) {
    if (!file) return;
    setImportResult(null);
    await withData('import', async () => {
      const fd = new FormData();
      fd.append('file', file);
      const res = await api.post('/data/import/csv', fd, { timeout: 120000 });
      setImportResult(res.data);
      await load();
    });
  }

  async function restore() {
    await withData('restore', async () => {
      let backup;
      try {
        backup = JSON.parse(await restoreFile.text());
      } catch {
        throw new Error('The selected file is not valid JSON');
      }
      const res = await api.post('/data/restore', { backup, restoreSettings }, { timeout: 120000 });
      setRestoreFile(null);
      if (restoreSettings) {
        const me = await api.get('/auth/me');
        setUser(me.data.user);
      }
      await load();
      setDataStatus({ tone: 'ok', text: `Restored ${res.data.restoredStrategies} strategies and ${res.data.restoredTrades} trades.` });
    }).catch(() => {});
  }

  if (loadError) return <ErrorBanner message={loadError} onRetry={load} />;
  if (!form) return <Spinner />;

  const input = (k, label, props = {}) => (
    <Field label={label} error={errors[k]} hint={props.hint}>
      {(id) => <input id={id} className="input" value={form[k]} onChange={set(k)} inputMode={props.numeric ? 'decimal' : undefined} list={props.list} />}
    </Field>
  );

  return (
    <>
      <PageHeader title="Settings" />
      {params.get('welcome') && (
        <div className="mb-4">
          <Notice>Welcome! Set your starting balance and currency first – the equity curve and risk % use them.</Notice>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <form onSubmit={saveSettings} className="space-y-4 lg:col-span-2">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="Account">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {input('name', 'Your name')}
                {input('accountName', 'Account name')}
                {input('startingBalance', 'Starting balance', { numeric: true })}
                <Field label="Base currency" error={errors.baseCurrency}>
                  {(id) => (
                    <select id={id} className="input" value={form.baseCurrency} onChange={set('baseCurrency')}>
                      {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
                    </select>
                  )}
                </Field>
                <div className="sm:col-span-2">
                  <p className="label">Current balance</p>
                  <p className="num text-lg font-semibold">{formatMoney(balance.current, form.baseCurrency)}</p>
                  <p className="text-xs text-muted">
                    Starting balance + {formatMoney(balance.realized, form.baseCurrency, { signed: true })} net P&amp;L from closed trades. Calculated automatically.
                  </p>
                </div>
              </div>
            </Card>

            <Card title="Journal defaults">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {input('defaultRiskPercentage', 'Default risk %', { numeric: true, hint: 'A reference only – never enforced' })}
                <Field label="Default timezone" error={errors.timezone}>
                  {(id) => (
                    <select id={id} className="input" value={form.timezone} onChange={set('timezone')}>
                      {(TIMEZONES.includes(form.timezone) ? TIMEZONES : [form.timezone, ...TIMEZONES]).map((tz) => <option key={tz}>{tz}</option>)}
                    </select>
                  )}
                </Field>
                <Field label="Default market">
                  {(id) => (
                    <select id={id} className="input" value={form.defaultMarket} onChange={set('defaultMarket')}>
                      {MARKETS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                    </select>
                  )}
                </Field>
                {input('defaultTimeframe', 'Default timeframe', { list: 'tf-list' })}
                <datalist id="tf-list">{TIMEFRAMES.map((t) => <option key={t} value={t} />)}</datalist>
              </div>
            </Card>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-3">
            {status && <Notice tone={status.tone}>{status.text}</Notice>}
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving && <Loader2 size={15} className="animate-spin" />} Save settings
            </button>
          </div>
        </form>

        <Card title="Data">
          <div className="space-y-5">
            {dataStatus && <Notice tone={dataStatus.tone}>{dataStatus.text}</Notice>}

            <div>
              <p className="text-sm font-medium">Export trades</p>
              <p className="mb-2 text-xs text-muted">Download every trade as a CSV file (opens in Excel / Google Sheets).</p>
              <button type="button" className="btn-secondary" disabled={dataBusy === 'export'} onClick={() => withData('export', () => downloadFile('/data/export/csv', 'trades.csv'))}>
                {dataBusy === 'export' ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />} Export CSV
              </button>
            </div>

            <div>
              <p className="text-sm font-medium">Import trades</p>
              <p className="mb-2 text-xs text-muted">
                Required columns: date (YYYY-MM-DD), asset, direction, entryPrice, positionSize. Use an exported CSV as a template. All values are recalculated; importing the same file twice creates duplicates.
              </p>
              <label className={`btn-secondary cursor-pointer ${dataBusy === 'import' ? 'pointer-events-none opacity-50' : ''}`}>
                {dataBusy === 'import' ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />} Import CSV
                <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => { importCsv(e.target.files?.[0]); e.target.value = ''; }} />
              </label>
              {importResult && (
                <div className="mt-2 rounded-lg bg-raised p-3 text-xs">
                  <p className="text-soft">
                    Imported <b className="text-ink">{importResult.imported}</b> trade(s)
                    {importResult.failed > 0 && <>, <b className="text-loss">{importResult.failed}</b> row(s) failed</>}.
                    {importResult.createdStrategies.length > 0 && ` Created strategies: ${importResult.createdStrategies.join(', ')}.`}
                  </p>
                  {importResult.errors.length > 0 && (
                    <ul className="mt-2 max-h-40 space-y-0.5 overflow-y-auto text-loss">
                      {importResult.errors.map((er) => <li key={er.row}>Row {er.row}: {er.message}</li>)}
                    </ul>
                  )}
                  {importResult.warnings.length > 0 && (
                    <ul className="mt-2 max-h-24 space-y-0.5 overflow-y-auto text-muted">
                      {importResult.warnings.map((w) => <li key={w}>{w}</li>)}
                    </ul>
                  )}
                </div>
              )}
            </div>

            <div>
              <p className="text-sm font-medium">Backup</p>
              <p className="mb-2 text-xs text-muted">Full JSON backup of settings, strategies and trades (screenshots are not included).</p>
              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn-secondary" disabled={dataBusy === 'backup'} onClick={() => withData('backup', () => downloadFile('/data/backup', 'backup.json'))}>
                  {dataBusy === 'backup' ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />} Download backup
                </button>
                <label className="btn-secondary cursor-pointer">
                  <Upload size={15} /> Restore backup…
                  <input type="file" accept=".json,application/json" className="sr-only" onChange={(e) => { setRestoreFile(e.target.files?.[0] || null); e.target.value = ''; }} />
                </label>
              </div>
            </div>
          </div>
        </Card>

        <div className="space-y-4">
          <Card title="Password">
            <form onSubmit={changePassword} className="space-y-3">
              {pwStatus && <Notice tone={pwStatus.tone}>{pwStatus.text}</Notice>}
              <Field label="Current password">
                {(id) => <input id={id} type="password" className="input" autoComplete="current-password" value={pw.currentPassword} onChange={(e) => setPw((p) => ({ ...p, currentPassword: e.target.value }))} />}
              </Field>
              <Field label="New password" hint="At least 8 characters">
                {(id) => <input id={id} type="password" className="input" autoComplete="new-password" value={pw.newPassword} onChange={(e) => setPw((p) => ({ ...p, newPassword: e.target.value }))} />}
              </Field>
              <button type="submit" className="btn-secondary" disabled={pwBusy || !pw.currentPassword || pw.newPassword.length < 8}>
                {pwBusy && <Loader2 size={15} className="animate-spin" />} Change password
              </button>
            </form>
          </Card>

          <Card title="Danger zone">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-soft">Delete all trades (keeps account and strategies)</p>
                <button type="button" className="btn-danger" onClick={() => setDanger('trades')}>Delete trades</button>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-soft">Delete account and all data</p>
                <button type="button" className="btn-danger" onClick={() => setDanger('account')}>Delete account</button>
              </div>
              <div className="border-t border-line pt-3">
                <button type="button" className="btn-ghost" onClick={logout}>
                  <LogOut size={15} /> Log out ({user.email})
                </button>
              </div>
            </div>
          </Card>
        </div>
      </div>

      <Modal
        open={Boolean(restoreFile)}
        onClose={dataBusy === 'restore' ? undefined : () => setRestoreFile(null)}
        title="Restore backup?"
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setRestoreFile(null)} disabled={dataBusy === 'restore'}>Cancel</button>
            <button type="button" className="btn-danger" onClick={restore} disabled={dataBusy === 'restore'}>
              {dataBusy === 'restore' && <Loader2 size={14} className="animate-spin" />} Replace my data
            </button>
          </>
        }
      >
        <p className="text-sm text-soft">
          Restoring <b className="text-ink">{restoreFile?.name}</b> will <b className="text-loss">replace all current strategies, trades and screenshots</b>. The backup is validated before anything is deleted.
        </p>
        <label className="mt-3 flex items-center gap-2 text-sm">
          <input type="checkbox" className="h-4 w-4 accent-[#3987e5]" checked={restoreSettings} onChange={(e) => setRestoreSettings(e.target.checked)} />
          Also restore account settings (balance, currency, defaults)
        </label>
        {dataStatus?.tone === 'error' && <div className="mt-3"><Notice tone="error">{dataStatus.text}</Notice></div>}
      </Modal>

      <PasswordModal
        open={danger === 'trades'}
        title="Delete all trades?"
        message="Every trade and screenshot will be permanently deleted. Strategies and settings are kept. Consider downloading a backup first."
        confirmLabel="Delete all trades"
        onClose={() => setDanger(null)}
        onConfirm={async (password) => {
          const res = await api.delete('/data/trades', { data: { password } });
          setDanger(null);
          setDataStatus({ tone: 'ok', text: `Deleted ${res.data.deleted} trade(s).` });
          await load();
        }}
      />
      <PasswordModal
        open={danger === 'account'}
        title="Delete account?"
        message="Your account, strategies, trades and screenshots will be permanently deleted. This cannot be undone."
        confirmLabel="Delete account"
        onClose={() => setDanger(null)}
        onConfirm={async (password) => {
          await api.delete('/auth/account', { data: { password } });
          logout();
        }}
      />
    </>
  );
}
