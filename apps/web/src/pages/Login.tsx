import { useState } from 'react';
import { Icon } from '../components/Icon';
import { Illustration } from '../components/Illustration';
import { Card } from '../components/ui/Card';
import { api } from '../lib/api';

/** Вход по паролю: стеклянная карточка над сиянием и горошком (PageBackdrop page="login" в App). */
export function Login({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <main className="flex min-h-dvh items-center justify-center p-gutter">
      <Card
        as="form"
        variant="glass"
        tone="accent"
        lift={false}
        className="flex w-full max-w-form flex-col gap-md"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          try {
            await api.login(password);
            onDone();
          } catch (err) {
            setError((err as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Illustration
          name="hero"
          className="blur-in mx-auto w-40 text-text"
          style={{ '--illustration-bg': 'transparent' }}
        />
        <div>
          <div className="eyebrow">Вход</div>
          <h1 className="text-h2">Память предпочтений</h1>
        </div>
        <label className="flex flex-col gap-1">
          <span className="eyebrow">Пароль</span>
          <input
            className="input"
            type="password"
            autoComplete="current-password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error && <p className="m-0 text-danger">{error}</p>}
        <button className="btn btn-primary" disabled={busy || !password}>
          <Icon name="lock" /> Войти
        </button>
      </Card>
    </main>
  );
}
