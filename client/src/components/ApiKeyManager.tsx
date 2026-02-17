import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Copy, Key, RefreshCw, CheckCircle } from 'lucide-react';

interface ApiKey {
  id: string;
  key: string;
  createdAt: string;
  usageCount: number;
}

export default function ApiKeyManager() {
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);

  // Load existing keys from localStorage
  useEffect(() => {
    const stored = localStorage.getItem('apiKeys');
    if (stored) {
      setApiKeys(JSON.parse(stored));
    }
  }, []);

  const generateApiKey = () => {
    setLoading(true);
    setTimeout(() => {
      const key = `mv_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
      const newApiKey: ApiKey = {
        id: Date.now().toString(),
        key,
        createdAt: new Date().toISOString(),
        usageCount: 0
      };
      
      const updatedKeys = [...apiKeys, newApiKey];
      setApiKeys(updatedKeys);
      localStorage.setItem('apiKeys', JSON.stringify(updatedKeys));
      setNewKey(key);
      setLoading(false);
    }, 500);
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const deleteKey = (id: string) => {
    const updatedKeys = apiKeys.filter(key => key.id !== id);
    setApiKeys(updatedKeys);
    localStorage.setItem('apiKeys', JSON.stringify(updatedKeys));
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="w-5 h-5" />
            API Key Management
          </CardTitle>
          <CardDescription>
            Generate API keys to allow external applications to submit videos for metadata extraction
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button onClick={generateApiKey} disabled={loading} className="w-full">
            {loading ? (
              <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Key className="w-4 h-4 mr-2" />
            )}
            Generate New API Key
          </Button>

          {newKey && (
            <Alert>
              <CheckCircle className="h-4 w-4" />
              <AlertDescription className="flex items-center justify-between">
                <span className="font-mono text-sm">{newKey}</span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => copyToClipboard(newKey)}
                >
                  {copied ? <CheckCircle className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </Button>
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      
    </div>
  );
}
