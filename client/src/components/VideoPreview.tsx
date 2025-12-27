import { useRef, useEffect } from 'react';
import { Card } from '@/components/ui/card';

export function VideoPreview({ file }: { file: File }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const urlRef = useRef<string | null>(null);

  useEffect(() => {
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
    }
    
    const url = URL.createObjectURL(file);
    urlRef.current = url;
    if (videoRef.current) {
      videoRef.current.src = url;
    }

    return () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
  }, [file]);

  return (
    <Card className="overflow-hidden bg-black border-border">
      <div className="aspect-video">
        <video ref={videoRef} controls className="w-full h-full object-contain" />
      </div>
    </Card>
  );
}