import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload } from 'lucide-react';
import { Card } from '@/components/ui/card';

export function VideoDropzone({
  onFileSelect,
  isProcessing,
}: {
  onFileSelect: (file: File) => void;
  isProcessing: boolean;
}) {
  const [error, setError] = useState<string | null>(null);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    setError(null);
    if (acceptedFiles.length > 0) {
      const file = acceptedFiles[0];
      if (!file.type.startsWith('video/')) {
        setError('Please upload a valid video file');
        return;
      }
      onFileSelect(file);
    }
  }, [onFileSelect]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'video/*': [] },
    maxFiles: 1,
    disabled: isProcessing
  });

  return (
    <div {...getRootProps()}>
      <input {...getInputProps()} />
      <Card className={`border-2 border-dashed h-64 flex flex-col items-center justify-center p-6
        ${isDragActive ? 'border-primary bg-primary/5' : 'border-border'}`}>
        <div className="rounded-full bg-primary/10 p-4 mb-4">
          <Upload className="w-8 h-8 text-primary" />
        </div>
        <h3 className="text-lg font-semibold">
          {isDragActive ? 'Drop video here' : 'Drag & drop video file'}
        </h3>
        <p className="text-sm text-muted-foreground text-center">
          Or click to browse. Processed entirely in browser.
        </p>
        {error && <p className="text-destructive mt-4">{error}</p>}
      </Card>
    </div>
  );
}