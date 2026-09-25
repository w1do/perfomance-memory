import { useState } from 'react';
import { Icon } from '../components/Icon';
import { Illustration } from '../components/Illustration';
import { Card } from '../components/ui/Card';
import { api } from '../lib/api';

/**
 * Вход по email и паролю (ADMIN_EMAIL / ADMIN_PASSWORD из .env): стеклянная карточка над сиянием (PageBackdrop).
 * Сессия — httpOnly-cookie, во фронтенде токенов нет; после 5 неудачных попыток api отвечает 429.
 */
export function Login({ onDone }: { onDone: () => void }) {
  const [email, setEmail] = useState('');
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
            await api.login(email, password);
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
          <span className="eyebrow">Email</span>
          <input
            className="input"
            type="email"
            name="email"
            autoComplete="username"
            autoFocus
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="eyebrow">Пароль</span>
          <input
            className="input"
            type="password"
            name="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error && <p className="m-0 text-danger">{error}</p>}
        <button className="btn btn-primary" disabled={busy || !email || !password}>
          <Icon name="lock" /> {busy ? 'Вхожу…' : 'Войти'}
        </button>
      </Card>
    </main>
  );
}
