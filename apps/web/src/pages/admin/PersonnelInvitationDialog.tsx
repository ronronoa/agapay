import { toast } from 'sonner';
import { useRef } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import type { PersonnelInvitation } from '@agapay/shared';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/input';
import { Dialog, DialogTitle, DialogDescription, DialogFooter } from '../../components/ui/dialog';

export function PersonnelInvitationDialog({
  invitation,
  recipient,
  onClose,
}: {
  invitation: PersonnelInvitation;
  recipient: string;
  onClose: () => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  async function copy() {
    try {
      await navigator.clipboard.writeText(invitation.url);
      toast.success('Invitation link copied.');
    } catch {
      toast.error('Copy is unavailable. Select the invitation link and copy it manually.');
    }
  }
  function download() {
    try {
      if (!canvas.current) throw new Error('QR unavailable');
      const link = document.createElement('a');
      link.download = 'agapay-personnel-invitation.png';
      link.href = canvas.current.toDataURL('image/png');
      link.click();
      toast.success('QR image downloaded.');
    } catch {
      toast.error('Could not download the QR image. You can still copy the invitation link.');
    }
  }
  const localOnly = ['localhost', '127.0.0.1', '[::1]'].includes(new URL(invitation.url).hostname);
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogTitle>Share personnel invitation</DialogTitle>
      <DialogDescription>
        Email is queued for {recipient}. You can also share this link or QR image directly with that
        person.
      </DialogDescription>
      <div className="mt-4 space-y-4">
        <label className="block">
          Invitation link
          <Input
            readOnly
            value={invitation.url}
            onFocus={(event) => event.currentTarget.select()}
          />
        </label>
        <div className="flex justify-center">
          <QRCodeCanvas
            ref={canvas}
            value={invitation.url}
            size={224}
            marginSize={4}
            level="M"
            role="img"
            aria-label="Personnel invitation QR code"
          />
        </div>
        <p className="text-sm text-text-muted">
          Expires{' '}
          {new Date(invitation.expiresAt).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })}{' '}
          (Manila time). This link can be used once. Share it only with the intended person.
        </p>
        {localOnly && (
          <p className="text-sm">
            This link uses localhost and will not open on another device. Configure Agapay’s
            accessible web address before sharing remotely.
          </p>
        )}
        <p className="text-sm text-text-muted">
          The link is shown for this session only. After closing, regenerate an invitation if
          needed; earlier links will stop working.
        </p>
      </div>
      <DialogFooter className="flex-wrap">
        <Button variant="accent" onClick={() => void copy()}>
          Copy link
        </Button>
        <Button variant="accent" onClick={download}>
          Download QR
        </Button>
        <Button onClick={onClose}>Done</Button>
      </DialogFooter>
    </Dialog>
  );
}
