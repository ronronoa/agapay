import { useState } from 'react';
import { ImageOff } from 'lucide-react';
import { imageUrl } from '../../lib/image-url';

export function CampaignCover({ src }: { src: string | null | undefined }) {
  const [failed, setFailed] = useState(false);
  return src && !failed ? (
    <img
      src={imageUrl(src)}
      alt=""
      loading="lazy"
      className="aspect-video w-full object-cover"
      onError={() => setFailed(true)}
    />
  ) : (
    <div className="flex aspect-video items-center justify-center gap-2 bg-surface-alt text-sm text-text-muted">
      <ImageOff aria-hidden="true" className="size-5" />
      No campaign image
    </div>
  );
}
