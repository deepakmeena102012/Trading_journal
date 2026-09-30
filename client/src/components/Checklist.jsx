import { Check, Minus, X } from 'lucide-react';
import { CHECK_VALUES } from '../lib/constants';

export function complianceOf(results = []) {
  const applicable = results.filter((r) => r.value !== 'na').length;
  const satisfied = results.filter((r) => r.value === 'yes').length;
  return { satisfied, applicable };
}

/** Yes / No / N/A selector per strategy condition. `value` maps conditionId -> 'yes'|'no'|'na'. */
export function ChecklistInput({ conditions, value, onChange }) {
  const results = conditions.filter((c) => value[c._id]).map((c) => ({ value: value[c._id] }));
  const { satisfied, applicable } = complianceOf(results);
  const unanswered = conditions.length - results.length;

  return (
    <div>
      <ul className="divide-y divide-line rounded-lg border border-line">
        {conditions.map((c, i) => (
          <li key={c._id} className="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-sm">
              <span className="mr-2 text-muted">{i + 1}.</span>
              {c.text}
            </span>
            <div className="inline-flex shrink-0 gap-1 self-start rounded-lg border border-line bg-bg p-1 sm:self-auto" role="radiogroup" aria-label={c.text}>
              {CHECK_VALUES.map((opt) => {
                const active = value[c._id] === opt.value;
                const tone =
                  opt.value === 'yes' ? 'bg-profit/20 text-profit' : opt.value === 'no' ? 'bg-loss/20 text-loss' : 'bg-raised text-soft';
                return (
                  <button
                    key={opt.value}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => onChange({ ...value, [c._id]: active ? undefined : opt.value })}
                    className={`min-w-[48px] rounded-md px-2.5 py-1 text-xs font-medium ${active ? tone : 'text-muted hover:text-soft'}`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-muted">
        <span className="num font-medium text-soft">
          {satisfied} / {applicable}
        </span>{' '}
        applicable conditions satisfied
        {unanswered > 0 && ` · ${unanswered} not answered (not saved)`}
      </p>
    </div>
  );
}

/** Read-only compliance list for the trade detail page. */
export function ChecklistView({ results }) {
  const { satisfied, applicable } = complianceOf(results);
  return (
    <div>
      <ul className="space-y-1.5">
        {results.map((r) => (
          <li key={r.conditionId} className="flex items-start gap-2 text-sm">
            {r.value === 'yes' ? (
              <Check size={16} className="mt-0.5 shrink-0 text-profit" aria-label="Yes" />
            ) : r.value === 'no' ? (
              <X size={16} className="mt-0.5 shrink-0 text-loss" aria-label="No" />
            ) : (
              <Minus size={16} className="mt-0.5 shrink-0 text-muted" aria-label="Not applicable" />
            )}
            <span className={r.value === 'na' ? 'text-muted' : ''}>
              {r.text}
              {r.value === 'na' && ' (N/A)'}
            </span>
          </li>
        ))}
      </ul>
      <p className="num mt-3 text-sm font-medium">
        {satisfied} / {applicable} conditions satisfied
      </p>
    </div>
  );
}
