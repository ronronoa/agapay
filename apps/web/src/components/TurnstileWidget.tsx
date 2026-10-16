import { Turnstile } from '@marsidev/react-turnstile';

export const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY ?? '';

interface TurnstileWidgetProps {
  onToken: (token: string | null) => void;
}

export function TurnstileWidget({ onToken }: TurnstileWidgetProps) {
  if (TURNSTILE_SITE_KEY.length === 0) return null;
  return (
    <div>
      <div className="mt-1" role="group" aria-labelledby="turnstile-label">
        <Turnstile
          siteKey={TURNSTILE_SITE_KEY}
          onSuccess={(token) => onToken(token)}
          onExpire={() => onToken(null)}
          onError={() => onToken(null)}
          options={{ theme: 'light' }}
        />
      </div>
    </div>
  );
}
