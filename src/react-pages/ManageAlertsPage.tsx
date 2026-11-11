import { useEffect, useState } from 'react';

type AlertRule = {
  id: string;
  categories: string[];
  types: string[];
  genders: string[];
  sizes: string[];
  shop_ids: string[];
  made_in_canada_only: boolean;
  max_price: number | null;
  min_discount: number;
  frequency: 'instant' | 'daily' | 'weekly';
};

type ProductWatch = {
  id: string;
  product_id: string;
  target_price: number | null;
  frequency: 'instant' | 'daily' | 'weekly';
};

type StateResponse =
  | {
      ok: true;
      subscriber: { id: number; email: string; consent_given: boolean };
      rules: AlertRule[];
      watches: ProductWatch[];
    }
  | { ok: false; error: string };

type MutationResponse =
  | { ok: true; rules?: AlertRule[]; watches?: ProductWatch[] }
  | { ok: false; error: string };

type State = {
  status: 'loading' | 'ready' | 'invalid' | 'error';
  email?: string;
  consent_given?: boolean;
  rules?: AlertRule[];
  watches?: ProductWatch[];
  errorMessage?: string;
};

interface Props {
  initialToken: string;
}

async function readJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  if (!text) {
    throw new Error(`Empty response (${res.status})`);
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Invalid JSON (${res.status}): ${text.slice(0, 120)}`);
  }
}

export default function ManageAlertsPage({ initialToken }: Props) {
  const [state, setState] = useState<State>(
    initialToken ? { status: 'loading' } : { status: 'invalid' }
  );

  useEffect(() => {
    if (!initialToken) return;
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(
          `/api/alerts/state?token=${encodeURIComponent(initialToken)}`
        );
        const body = await readJson<StateResponse>(res);
        if (cancelled) return;

        if (!body.ok) {
          setState({
            status: body.error === 'invalid token' ? 'invalid' : 'error',
            errorMessage: body.error,
          });
          return;
        }

        setState({
          status: 'ready',
          email: body.subscriber.email,
          consent_given: body.subscriber.consent_given,
          rules: body.rules,
          watches: body.watches,
        });
      } catch (err) {
        if (!cancelled) {
          setState({
            status: 'error',
            errorMessage: (err as Error).message,
          });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [initialToken]);

  const handleDeleteRule = async (ruleId: string) => {
    if (!confirm('Delete this rule? You will stop receiving alerts that match it.')) return;
    try {
      const res = await fetch(
        `/api/alerts/rules/${encodeURIComponent(ruleId)}?token=${encodeURIComponent(initialToken)}`,
        { method: 'DELETE' }
      );
      const body = await readJson<MutationResponse>(res);
      if (body.ok) {
        setState(s => (s.status === 'ready' ? { ...s, rules: body.rules ?? [] } : s));
      } else {
        alert(`Delete failed: ${body.error}`);
      }
    } catch (err) {
      alert(`Delete failed: ${(err as Error).message}`);
    }
  };

  const handleDeleteWatch = async (watchId: string) => {
    if (!confirm('Stop watching this product?')) return;
    try {
      const res = await fetch(
        `/api/alerts/watches/${encodeURIComponent(watchId)}?token=${encodeURIComponent(initialToken)}`,
        { method: 'DELETE' }
      );
      const body = await readJson<MutationResponse>(res);
      if (body.ok) {
        setState(s => (s.status === 'ready' ? { ...s, watches: body.watches ?? [] } : s));
      } else {
        alert(`Remove failed: ${body.error}`);
      }
    } catch (err) {
      alert(`Remove failed: ${(err as Error).message}`);
    }
  };

  const handleUnsubscribeAll = async () => {
    if (!confirm('Unsubscribe from ALL deal alerts? You can re-subscribe anytime.')) return;
    try {
      const res = await fetch('/api/alerts/unsubscribe', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token: initialToken }),
      });
      const body = await readJson<{ ok: boolean; error?: string }>(res);
      if (body.ok) {
        setState(s =>
          s.status === 'ready'
            ? { ...s, consent_given: false, rules: [], watches: [] }
            : s
        );
      } else {
        alert(`Unsubscribe failed: ${body.error}`);
      }
    } catch (err) {
      alert(`Unsubscribe failed: ${(err as Error).message}`);
    }
  };

  if (state.status === 'loading') {
    return (
      <div className="mx-auto max-w-3xl px-6 py-12 text-center text-gray-500 dark:text-gray-400">
        Loading your alerts…
      </div>
    );
  }

  if (state.status === 'invalid') {
    return (
      <div className="mx-auto max-w-md px-6 py-12">
        <div className="rounded-xl border border-gray-200 bg-white p-8 dark:border-gray-800 dark:bg-gray-900">
          <h1 className="mb-3 text-xl font-semibold text-gray-900 dark:text-gray-100">
            Link expired or invalid
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            This manage-alerts link is no longer valid. Reply to any email from us and we'll update your preferences manually.
          </p>
        </div>
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="mx-auto max-w-md px-6 py-12">
        <div className="rounded-xl border border-gray-200 bg-white p-8 dark:border-gray-800 dark:bg-gray-900">
          <h1 className="mb-3 text-xl font-semibold text-red-600 dark:text-red-400">
            Something went wrong
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">{state.errorMessage}</p>
        </div>
      </div>
    );
  }

  const rules = state.rules ?? [];
  const watches = state.watches ?? [];

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="mb-2 text-3xl font-bold text-gray-900 dark:text-gray-100">
        Your deal alerts
      </h1>
      <p className="mb-8 text-sm text-gray-500 dark:text-gray-400">
        Signed in as{' '}
        <strong className="text-gray-900 dark:text-gray-100">{state.email}</strong>
      </p>

      {!state.consent_given && (
        <div className="mb-6 rounded-lg border border-yellow-300 bg-yellow-50 px-4 py-3 text-sm text-yellow-900 dark:border-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-200">
          You're currently unsubscribed. Re-subscribe by adding a rule below.
        </div>
      )}

      <section className="mb-10">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Rules</h2>
          <button
            onClick={() =>
              alert('Rule editor coming soon! For now, use the homepage filters.')
            }
            className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-200"
          >
            + Add rule
          </button>
        </div>
        {rules.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            No alert rules yet! Add one to start getting deal alerts.
          </p>
        ) : (
          <ul className="space-y-2">
            {rules.map(rule => (
              <li
                key={rule.id}
                className="flex items-center justify-between rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900"
              >
                <div className="text-sm">
                  <div className="mb-1 font-semibold text-gray-900 dark:text-gray-100">
                    {rule.categories.length ? rule.categories.join(', ') : 'All categories'}
                    {rule.types.length ? ` · ${rule.types.join(', ')}` : ''}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    {rule.min_discount}%+ off · {rule.frequency}
                    {rule.made_in_canada_only ? ' · Made in Canada' : ''}
                    {rule.max_price != null ? ` · under $${rule.max_price}` : ''}
                  </div>
                </div>
                <button
                  onClick={() => handleDeleteRule(rule.id)}
                  className="rounded-md border border-gray-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 dark:border-gray-700 dark:text-red-400 dark:hover:bg-red-900/20"
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mb-10">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Product watches
          </h2>
        </div>
        {watches.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            No watches yet.
          </p>
        ) : (
          <ul className="space-y-2">
            {watches.map(w => (
              <li
                key={w.id}
                className="flex items-center justify-between rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900"
              >
                <div className="text-sm">
                  <div className="mb-1 font-semibold text-gray-900 dark:text-gray-100">
                    Product {w.product_id}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    {w.target_price != null
                      ? `Alert under $${w.target_price}`
                      : 'Alert on any price drop'}{' '}
                    · {w.frequency}
                  </div>
                </div>
                <button
                  onClick={() => handleDeleteWatch(w.id)}
                  className="rounded-md border border-gray-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 dark:border-gray-700 dark:text-red-400 dark:hover:bg-red-900/20"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="border-t border-gray-200 pt-6 dark:border-gray-800">
        <button
          onClick={handleUnsubscribeAll}
          className="text-sm text-red-600 underline hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
        >
          Unsubscribe from all deal alerts
        </button>
      </section>
    </div>
  );
}