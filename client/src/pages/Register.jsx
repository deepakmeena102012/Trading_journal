import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { errorMessage, fieldErrors } from '../lib/api';
import { ErrorBanner, Field } from '../components/ui';
import AuthShell from './AuthShell';

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function onSubmit(e) {
    e.preventDefault();
    const local = {};
    if (!form.name.trim()) local.name = 'Name is required';
    if (!/^\S+@\S+\.\S+$/.test(form.email)) local.email = 'Enter a valid email';
    if (form.password.length < 8) local.password = 'Password must be at least 8 characters';
    setErrors(local);
    if (Object.keys(local).length) return;

    setBusy(true);
    setError('');
    try {
      await register(form.name.trim(), form.email.trim(), form.password);
      navigate('/settings?welcome=1', { replace: true });
    } catch (err) {
      setErrors(fieldErrors(err));
      setError(errorMessage(err, 'Registration failed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell
      title="Create your journal"
      subtitle="Record trades and review your own historical performance."
      footer={
        <>
          Already have an account? <Link to="/login" className="text-accent hover:underline">Log in</Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <ErrorBanner message={error} />
        <Field label="Name" error={errors.name}>
          {(id) => <input id={id} className="input" autoComplete="name" value={form.name} onChange={set('name')} />}
        </Field>
        <Field label="Email" error={errors.email}>
          {(id) => <input id={id} type="email" className="input" autoComplete="email" value={form.email} onChange={set('email')} />}
        </Field>
        <Field label="Password" error={errors.password} hint="At least 8 characters">
          {(id) => <input id={id} type="password" className="input" autoComplete="new-password" value={form.password} onChange={set('password')} />}
        </Field>
        <button type="submit" className="btn-primary w-full" disabled={busy}>
          {busy && <Loader2 size={15} className="animate-spin" />} Create account
        </button>
      </form>
    </AuthShell>
  );
}
