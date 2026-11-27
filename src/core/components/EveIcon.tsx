import { useEffect, useState } from 'react';
import { Box, Palette } from 'lucide-react';
import { EVE_IMAGE_SERVER } from '@shared/constants/eve';

interface EveIconProps {
  path: string;
  size?: number;
  alt?: string;
  className?: string;
}

export function EveIcon({ path, size = 32, alt = '', className = '' }: EveIconProps) {
  const [stage, setStage] = useState<'cache' | 'direct' | 'failed'>('cache');
  const isSkin = /\bskin\b/i.test(alt);

  useEffect(() => {
    setStage('cache');
  }, [path]);

  if (isSkin || stage === 'failed') {
    return (
      <div
        title={alt || undefined}
        className={`flex items-center justify-center border border-eve-border bg-eve-elevated ${
          isSkin ? 'text-eve-accent' : 'text-eve-muted'
        } ${className}`}
        style={{ width: size, height: size }}
      >
        {isSkin ? <Palette className="h-1/2 w-1/2" /> : <Box className="h-1/2 w-1/2" />}
      </div>
    );
  }

  const src =
    stage === 'cache'
      ? `eve-img://${path}`
      : `${EVE_IMAGE_SERVER}/${path.replace(/^\/+/, '')}`;

  return (
    <img
      src={src}
      alt={alt}
      width={size}
      height={size}
      loading="lazy"
      onError={() => setStage((prev) => (prev === 'cache' ? 'direct' : 'failed'))}
      className={`shrink-0 object-cover ${className}`}
      style={{ width: size, height: size }}
    />
  );
}
