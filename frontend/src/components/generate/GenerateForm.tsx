import { useId, useState, type FormEvent } from 'react';
import { Sparkles } from 'lucide-react';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';

/** Client-side validation mirroring the server's basic input rules. */
function validate(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) return 'Enter an app name or developer docs URL.';
  if (value.length > 200) return 'Keep it under 200 characters.';
  return null;
}

export function GenerateForm({
  initialValue = '',
  apiConfigured,
  busy,
  showForceFresh,
  onSubmit,
}: {
  initialValue?: string;
  apiConfigured: boolean;
  busy: boolean;
  showForceFresh: boolean;
  onSubmit: (app: string, force: boolean) => void;
}) {
  const [value, setValue] = useState(initialValue);
  const [force, setForce] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const errorId = useId();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const err = validate(value);
    setError(err);
    if (err) return;
    onSubmit(value.trim(), force);
  };

  const disabled = !apiConfigured;

  return (
    <form onSubmit={submit} className="space-y-3">
      <label htmlFor="generate-input" className="block text-sm font-medium text-slate-200">
        App name or developer docs URL
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          id="generate-input"
          value={value}
          maxLength={200}
          disabled={disabled}
          placeholder="e.g. Asana, or https://developers.asana.com"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          onChange={(e) => setValue(e.target.value)}
        />
        <Button type="submit" disabled={disabled || busy}>
          <Sparkles className="h-4 w-4" aria-hidden="true" />
          {busy ? 'Working…' : 'Generate'}
        </Button>
      </div>

      {error && (
        <p id={errorId} role="alert" className="text-sm text-rose-300">
          {error}
        </p>
      )}

      {disabled && (
        <p className="text-sm text-slate-400">
          Live generation isn't configured for this deployment.
        </p>
      )}

      {!disabled && (
        <p className="text-xs text-slate-500">Uses 1 of your 5 hourly live generations.</p>
      )}

      {showForceFresh && !disabled && (
        <label className="flex items-center gap-2 text-sm text-slate-300">
          <input
            type="checkbox"
            checked={force}
            onChange={(e) => setForce(e.target.checked)}
            className="h-4 w-4 rounded border-white/20 bg-white/[0.04]"
          />
          Force fresh research
        </label>
      )}
    </form>
  );
}
