import { useEffect, useState } from 'react';
import RuleEditor, { type RuleDraft, type Option } from './RuleEditor';

interface Props {
  initialToken: string;
}

type Status = 'loading' | 'ready' | 'saved' | 'invalid' | 'error';

export default function WelcomePage({ initialToken }: Props) {
  const [status, setStatus] = useState<Status>('loading');
  const [email, setEmail] = useState('');
  const [rule, setRule] = useState<RuleDraft | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [options, setOptions] = useState<{
    categories: Option[];
    types: Option[];
    genders: Option[];
    sizes: Option[];
    shops: Option[];
  } | null>(null);

  useEffect(() => {
    if (!initialToken) {
      setStatus('invalid');
      return;
    }

    (async () => {
      try {
        const stateRes = await fetch(`/api/alerts/state?token=${encodeURIComponent(initialToken)}`);
        const stateBody = await stateRes.json() as
        | {
            ok: true;
            subscriber: { id: number; email: string; consent_given: boolean };
            rules: RuleDraft[];
            watches: unknown[];
            }
        | { ok: false; error: string };
        if (!stateBody.ok) {
          setStatus(stateBody.error === 'invalid token' ? 'invalid' : 'error');
          setErrorMessage(stateBody.error);
          return;
        }

        setEmail(stateBody.subscriber.email);
        const currentRule = stateBody.rules?.[0];
        if (currentRule) {
          setRule({ ...currentRule, frequency: 'weekly' });
        }

        const [cats, types, genders, sizes, shops] = await Promise.all([
          fetch('/api/categories').then(r => r.json()) as Promise<Array<{ top_level_category: string }>>,
          fetch('/api/types').then(r => r.json()) as Promise<Array<{ grouped_product_type: string }>>,
          fetch('/api/genders').then(r => r.json()) as Promise<Array<{ gender_age: string }>>,
          fetch('/api/sizes').then(r => r.json()) as Promise<Array<{ size_group: string }>>,
          fetch('/api/shops').then(r => r.json()) as Promise<Array<{ id: number; shop_name: string }>>,
        ]);
        setOptions({
          categories: cats.map(r => ({ value: r.top_level_category, label: r.top_level_category })),
          types: types.map(r => ({ value: r.grouped_product_type, label: r.grouped_product_type })),
          genders: genders.map(r => ({ value: r.gender_age, label: r.gender_age })),
          sizes: sizes.map(r => ({ value: r.size_group, label: r.size_group })),
          shops: shops.map(r => ({ value: String(r.id), label: r.shop_name })),
        });
        setStatus('ready');
      } catch (err) {
        setStatus('error');
        setErrorMessage((err as Error).message);
      }
    })();
  }, [initialToken]);

  const handleSave = async (updatedRule: RuleDraft) => {
    try {
      const res = await fetch('/api/alerts/rules', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token: initialToken, rule: updatedRule }),
        });
        const body = await res.json() as
        | { ok: true; rules: RuleDraft[] }
        | { ok: false; error: string };
      if (!body.ok) {
        alert(`Save failed: ${body.error}`);
        return;
      }
      setStatus('saved');
    } catch (err) {
      alert(`Save failed: ${(err as Error).message}`);
    }
  };

  const handleSkip = () => {
    window.location.href = '/';
  };

  if (status === 'loading') {
    return (
      <div className="mx-auto max-w-2xl px-6 py-12 text-center text-gray-500 dark:text-gray-400">
        Loading…
      </div>
    );
  }

  if (status === 'invalid') {
    return (
      <div className="mx-auto max-w-2xl px-6 py-12">
        <div className="rounded-xl border border-gray-200 bg-white p-8 dark:border-gray-800 dark:bg-gray-900">
          <h1 className="mb-3 text-xl font-semibold text-gray-900 dark:text-gray-100">Link expired</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            This welcome link has expired. You're still subscribed with a default rule — you can customize it anytime from a digest email.
          </p>
          <a href="/" className="mt-4 inline-block text-blue-600 underline dark:text-blue-400">Back to homepage</a>
        </div>
      </div>
    );
  }

  if (status === 'saved') {
    return (
      <div className="mx-auto max-w-2xl px-6 py-12">
        <div className="rounded-xl border border-green-200 bg-green-50 p-8 dark:border-green-800 dark:bg-green-900/20">
          <h1 className="mb-3 text-xl font-semibold text-green-900 dark:text-green-100">You're all set!</h1>
          <p className="text-sm text-green-800 dark:text-green-200">
            We'll send your first digest on Monday. You can change your alerts anytime from the footer of any email.
          </p>
          <a href="/" className="mt-4 inline-block text-blue-600 underline dark:text-blue-400">Back to homepage</a>
        </div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="mx-auto max-w-2xl px-6 py-12">
        <div className="rounded-xl border border-red-200 bg-red-50 p-8 dark:border-red-800 dark:bg-red-900/20">
          <h1 className="mb-3 text-xl font-semibold text-red-900 dark:text-red-100">Something went wrong</h1>
          <p className="text-sm text-red-800 dark:text-red-200">{errorMessage}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="mb-2 text-3xl font-bold text-gray-900 dark:text-gray-100">
        What deals do you want?
      </h1>
      <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">
        You're subscribed as <strong>{email}</strong>. Pick what you care about and we'll send matching deals every Monday.
      </p>
      <p className="mb-8 text-sm text-gray-500 dark:text-gray-400">
        <button onClick={handleSkip} className="text-blue-600 underline hover:text-blue-800 dark:text-blue-400">
          Skip for now
        </button>
        {' '}— you can customize anytime.
      </p>

      {options && rule && (
        <RuleEditor
          initialRule={rule}
          token={initialToken}
          categories={options.categories}
          types={options.types}
          genders={options.genders}
          sizes={options.sizes}
          shops={options.shops}
          onSave={handleSave}
          onCancel={handleSkip}
        />
      )}
    </div>
  );
}