import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Input, type InputProps } from '../../components/ui/input';
import { Button } from '../../components/ui/Button';

export function PasswordInput({
  id,
  revealLabel = 'password',
  ...props
}: Omit<InputProps, 'type'> & { id: string; revealLabel?: string }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="flex items-start gap-2">
      <Input {...props} id={id} type={visible ? 'text' : 'password'} className="min-w-0 flex-1" />
      <Button
        variant="outline"
        size="icon"
        disabled={props.disabled}
        aria-label={`${visible ? 'Hide' : 'Show'} ${revealLabel}`}
        aria-controls={id}
        aria-pressed={visible}
        onClick={() => setVisible((value) => !value)}
      >
        {visible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
      </Button>
    </div>
  );
}
