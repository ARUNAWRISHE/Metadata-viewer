import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { VideoDropzone } from '@/components/VideoDropzone';
import { extractVideoMetadata, type ApiResponse } from '@/lib/api';
import { Upload, Play, CheckCircle, XCircle, Loader2 } from 'lucide-react';

export default function ApiTester() {
  const [apiKey, setApiKey] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ApiResponse | null>(null);

  const handleFileSelect = async (selectedFile: File) => {
    setFile(selectedFile);
    setResult(null);
  };

  const testApi = async () => {
    if (!file || !apiKey) {
      setResult({ success: false, error: 'Please provide both API key and video file' });
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      const response = await extractVideoMetadata(file, apiKey);
      setResult(response);
    } catch (error) {
      setResult({ success: false, error: 'API call failed' });
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setFile(null);
    setApiKey('');
    setResult(null);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="w-5 h-5" />
            API Tester
          </CardTitle>
          <CardDescription>
            Test the API endpoint with your generated API key
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="api-key">API Key</Label>
            <Input
              id="api-key"
              placeholder="Enter your API key"
              value={apiKey}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setApiKey(e.target.value)}
            />
          </div>

          {!file && (
            <VideoDropzone onFileSelect={handleFileSelect} isProcessing={loading} />
          )}

          {file && (
            <div className="space-y-4">
              <div className="p-3 border rounded-lg">
                <div className="text-sm font-medium">{file.name}</div>
                <div className="text-xs text-muted-foreground">
                  {(file.size / 1024 / 1024).toFixed(2)} MB • {file.type}
                </div>
              </div>

              <div className="flex gap-2">
                <Button onClick={testApi} disabled={loading || !apiKey}>
                  {loading ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Play className="w-4 h-4 mr-2" />
                  )}
                  Test API
                </Button>
                <Button onClick={reset} variant="outline">
                  Reset
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {result && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {result.success ? (
                <CheckCircle className="w-5 h-5 text-green-500" />
              ) : (
                <XCircle className="w-5 h-5 text-red-500" />
              )}
              API Response
            </CardTitle>
          </CardHeader>
          <CardContent>
            {result.success ? (
              <div className="space-y-4">
                <Alert>
                  <CheckCircle className="h-4 w-4" />
                  <AlertDescription>
                    Successfully extracted video metadata!
                  </AlertDescription>
                </Alert>
                
                <div className="bg-muted p-4 rounded-lg">
                  <h4 className="font-medium mb-2">Metadata Preview:</h4>
                  <pre className="text-xs overflow-x-auto whitespace-pre-wrap">
                    {JSON.stringify(result.metadata, null, 2)}
                  </pre>
                </div>
              </div>
            ) : (
              <Alert variant="destructive">
                <XCircle className="h-4 w-4" />
                <AlertDescription>
                  {result.error}
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
