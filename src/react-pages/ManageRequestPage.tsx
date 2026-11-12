import { useState } from 'react';

export default function ManageRequestPage() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [sending, setSending] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    try {
      const res = await fetch('/api/alerts/send-manage-link', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const body = await res.json() as { ok: boolean; error?: string };
      if (!body.ok) {
        alert(body.error ?? 'Something went wrong');
        return;
      }
      setSubmitted(true);
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setSending(false);
    }
  };

  if (submitted) {
    return (
      <div className="mx-auto max-w-md px-6 py-12">
        <div className="rounded-xl border border-green-200 bg-green-50 p-8 dark:border-green-800 dark:bg-green-900/20">
          <h1 className="mb-3 text-xl font-semibold text-green-900 dark:text-green-100">Check your inbox</h1>
          <p className="text-sm text-green-800 dark:text-green-200">
            If <strong>{email}</strong> is subscribed to deal alerts, we've sent a link to manage them. Check your inbox (and spam folder).
          </p>
          <p className="mt-4 text-xs text-green-700 dark:text-green-300">
            The link expires in 24 hours.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md px-6 py-12">
      <h1 className="mb-2 text-2xl font-bold text-gray-900 dark:text-gray-100">Manage your deal alerts</h1>
      <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">
        Enter the email you signed up with and we'll send you a link to manage your alerts.
      </p>
      <form onSubmit={handleSubmit} className="space-y-4">
        <input
          type="email"
          required
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="your@email.com"
          className="w-full rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
        />
        <button
          type="submit"
          disabled={sending}
          className="w-full rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-50 dark:bg-gray-100 dark:text-gray-900"
        >
          {sending ? 'Sending…' : 'Send me a link'}
        </button>
      </form>
    </div>
  );
}