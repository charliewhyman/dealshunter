import { useState } from 'react';

type State =
  | { kind: 'invalid' }
  | { kind: 'idle' }
  | { kind: 'submitting' }
  | { kind: 'done' }
  | { kind: 'error'; message: string };

interface Props {
  initialToken: string;
}

export default function UnsubscribePage({ initialToken }: Props) {
  // Derive the initial state during render from the prop. The server and
  // client both receive the same initialToken, so the initial render is
  // identical on both sides — no hydration mismatch, no effect, no lint
  // warning.
  const [state, setState] = useState<State>(
    /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(initialToken)
      ? { kind: 'idle' }
      : { kind: 'invalid' }
  );

  const handleUnsubscribe = async () => {
    setState({ kind: 'submitting' });
    try {
      const res = await fetch('/api/alerts/unsubscribe', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token: initialToken }),
      });
      if (res.status === 400) {
        setState({ kind: 'invalid' });
        return;
      }
      if (!res.ok) {
        setState({ kind: 'error', message: `Request failed (${res.status})` });
        return;
      }
      setState({ kind: 'done' });
    } catch (err) {
      setState({ kind: 'error', message: (err as Error).message });
    }
  };

  return (
    <div
      style={{
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        background: '#f9fafb',
        minHeight: '70vh',
        display: 'grid',
        placeItems: 'center',
        padding: '48px 24px',
      }}
    >
      <div
        style={{
          background: '#fff',
          border: '1px solid #e5e7eb',
          borderRadius: 12,
          maxWidth: 440,
          width: '100%',
          padding: 32,
        }}
      >
        {state.kind === 'invalid' && (
          <>
            <h1 style={{ fontSize: 20, margin: '0 0 12px' }}>
              Link expired or invalid
            </h1>
            <p style={{ color: '#6b7280', fontSize: 14 }}>
              This unsubscribe link is no longer valid. Reply to any email from us
              and we'll remove you manually.
            </p>
          </>
        )}

        {(state.kind === 'idle' || state.kind === 'submitting') && (
          <>
            <h1 style={{ fontSize: 20, margin: '0 0 12px' }}>
              Unsubscribe from deal alerts?
            </h1>
            <p style={{ color: '#6b7280', fontSize: 14 }}>
              You'll stop receiving deal alert emails. You can re-subscribe anytime.
            </p>
            <button
              onClick={handleUnsubscribe}
              disabled={state.kind === 'submitting'}
              style={{
                background: '#111827',
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                padding: '12px 20px',
                fontSize: 14,
                fontWeight: 600,
                cursor: state.kind === 'submitting' ? 'not-allowed' : 'pointer',
                width: '100%',
                fontFamily: 'inherit',
                opacity: state.kind === 'submitting' ? 0.55 : 1,
              }}
            >
              {state.kind === 'submitting' ? 'Unsubscribing…' : 'Unsubscribe'}
            </button>
          </>
        )}

        {state.kind === 'done' && (
          <>
            <h1 style={{ fontSize: 20, margin: '0 0 12px', color: '#059669' }}>
              You're unsubscribed
            </h1>
            <p style={{ color: '#6b7280', fontSize: 14 }}>
              No more deal alert emails. Thanks for giving Curated Canada a try.
            </p>
          </>
        )}

        {state.kind === 'error' && (
          <>
            <h1 style={{ fontSize: 20, margin: '0 0 12px', color: '#dc2626' }}>
              Something went wrong
            </h1>
            <p style={{ color: '#6b7280', fontSize: 14 }}>{state.message}</p>
          </>
        )}
      </div>
    </div>
  );
}