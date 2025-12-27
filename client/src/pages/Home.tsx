import { useState } from 'react';
import { VideoDropzone } from '@/components/VideoDropzone';
import { VideoPreview } from '@/components/VideoPreview';
import { MetadataTable } from '@/components/MetadataTable';
import { analyzeVideo, type VideoMetadata } from '@/lib/mediainfo';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import ApiKeyManager from '@/components/ApiKeyManager';
import ApiDocumentation from '@/components/ApiDocumentation';
import ApiTester from '@/components/ApiTester';

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [metadata, setMetadata] = useState<VideoMetadata | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileSelect = async (selectedFile: File) => {
    setFile(selectedFile);
    setLoading(true);
    setError(null);
    setMetadata(null);

    try {
      await new Promise<void>((resolve) => setTimeout(resolve, 100));
      const data = await analyzeVideo(selectedFile);
      setMetadata(data);
    } catch {
      setError('Failed to analyze video file.');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setFile(null);
    setMetadata(null);
    setError(null);
  };

  return (
    <div className="min-h-screen bg-background text-foreground p-6 md:p-12">
      <div className="max-w-6xl mx-auto space-y-12">
        <header className="flex flex-col md:flex-row justify-between gap-6 border-b border-border pb-8">
          <div>
            <h1 className="text-4xl font-extrabold">
              <span className="text-primary">Meta</span>View
            </h1>
            <p className="text-muted-foreground">Video Metadata Inspector & API Service</p>
          </div>
        </header>

        <main className="space-y-8">
          <Tabs defaultValue="analyze" className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="analyze">Analyze Video</TabsTrigger>
              <TabsTrigger value="api-keys">API Keys</TabsTrigger>
              <TabsTrigger value="tester">API Tester</TabsTrigger>
              <TabsTrigger value="docs">API Docs</TabsTrigger>
            </TabsList>
            
            <TabsContent value="analyze" className="space-y-8">
              {!file && (
                <VideoDropzone onFileSelect={handleFileSelect} isProcessing={loading} />
              )}

              {loading && (
                <div className="flex flex-col items-center gap-4">
                  <Loader2 className="w-12 h-12 text-primary animate-spin" />
                  <p className="text-lg text-muted-foreground">Analyzing media...</p>
                </div>
              )}

              {error && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Analysis Failed</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              {metadata && file && (
                <div className="grid gap-8">
                  <div className="flex justify-between">
                    <h2 className="text-2xl font-bold">Analysis Report</h2>
                    <Button onClick={handleReset} variant="secondary">
                      Analyze New File
                    </Button>
                  </div>
                  <div className="grid lg:grid-cols-[350px_1fr] gap-8">
                    <VideoPreview file={file} />
                    <MetadataTable data={metadata} />
                  </div>
                </div>
              )}
            </TabsContent>
            
            <TabsContent value="api-keys">
              <ApiKeyManager />
            </TabsContent>
            
            <TabsContent value="tester">
              <ApiTester />
            </TabsContent>
            
            <TabsContent value="docs">
              <ApiDocumentation />
            </TabsContent>
          </Tabs>
        </main>
      </div>
    </div>
  );
}