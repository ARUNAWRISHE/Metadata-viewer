import { useState, useEffect } from 'react';
import { useAuth, getAuthHeaders } from '@/lib/auth';
import { VideoDropzone } from '@/components/VideoDropzone';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Loader2,
  LogOut,
  Upload,
  Clock,
  CheckCircle,
  XCircle,
  FileVideo,
  Film,
  Music,
  History,
  User,
  Calendar
} from 'lucide-react';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

interface VideoAnalysisResult {
  filename: string;
  file_size: number;
  duration_seconds: number;
  duration_formatted: string;
  video_start_time: string | null;
  video_end_time: string | null;
  resolution: string | null;
  video_codec: string | null;
  audio_codec: string | null;
  is_qualified: boolean;
  matched_period: number | null;
  matched_period_time: string | null;
  validation_message: string;
}

interface PeriodTiming {
  period: number;
  start_time: string;
  end_time: string;
  display_time: string;
}

interface VideoHistory {
  id: number;
  filename: string;
  duration_seconds: number | null;
  video_start_time: string | null;
  video_end_time: string | null;
  upload_date: string;
  is_qualified: boolean;
  matched_period: number | null;
  validation_message: string | null;
}

export default function Dashboard() {
  const { user, logout } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<VideoAnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [periods, setPeriods] = useState<PeriodTiming[]>([]);
  const [history, setHistory] = useState<VideoHistory[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  useEffect(() => {
    fetchPeriods();
    fetchHistory();
  }, []);

  const fetchPeriods = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/periods`);
      if (response.ok) {
        const data = await response.json();
        setPeriods(data);
      }
    } catch (err) {
      console.error('Failed to fetch periods:', err);
    }
  };

  const fetchHistory = async () => {
    setHistoryLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/video/history`, {
        headers: getAuthHeaders(),
      });
      if (response.ok) {
        const data = await response.json();
        setHistory(data);
      }
    } catch (err) {
      console.error('Failed to fetch history:', err);
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleFileSelect = (selectedFile: File) => {
    setFile(selectedFile);
    setResult(null);
    setError(null);
  };

  const handleAnalyze = async () => {
    if (!file) return;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append('video', file);

      const response = await fetch(`${API_BASE_URL}/api/video/analyze`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Analysis failed');
      }

      const data = await response.json();
      setResult(data);
      fetchHistory(); // Refresh history after upload
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to analyze video');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setFile(null);
    setResult(null);
    setError(null);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString();
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">
              <span className="text-primary">Meta</span>View
            </h1>
            <p className="text-sm text-muted-foreground">Faculty Video Validation</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-primary" />
                <span className="font-medium">{user?.faculty_name}</span>
              </div>
              <span className="text-sm text-muted-foreground">{user?.department}</span>
            </div>
            <Button variant="outline" size="sm" onClick={logout}>
              <LogOut className="w-4 h-4 mr-2" />
              Logout
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-8">
        <Tabs defaultValue="upload" className="space-y-6">
          <TabsList className="grid w-full max-w-md grid-cols-3">
            <TabsTrigger value="upload" className="flex items-center gap-2">
              <Upload className="w-4 h-4" />
              Upload
            </TabsTrigger>
            <TabsTrigger value="periods" className="flex items-center gap-2">
              <Clock className="w-4 h-4" />
              Periods
            </TabsTrigger>
            <TabsTrigger value="history" className="flex items-center gap-2">
              <History className="w-4 h-4" />
              History
            </TabsTrigger>
          </TabsList>

          {/* Upload Tab */}
          <TabsContent value="upload" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileVideo className="w-5 h-5 text-primary" />
                  Video Upload & Validation
                </CardTitle>
                <CardDescription>
                  Upload a video to analyze its metadata and validate against period timings
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {!file && (
                  <VideoDropzone onFileSelect={handleFileSelect} isProcessing={loading} />
                )}

                {file && !result && (
                  <div className="space-y-4">
                    <div className="p-4 border rounded-lg bg-muted/50">
                      <div className="flex items-center gap-3">
                        <FileVideo className="w-10 h-10 text-primary" />
                        <div>
                          <p className="font-medium">{file.name}</p>
                          <p className="text-sm text-muted-foreground">
                            {formatFileSize(file.size)} • {file.type}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-3">
                      <Button onClick={handleAnalyze} disabled={loading} className="flex-1">
                        {loading ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Analyzing...
                          </>
                        ) : (
                          <>
                            <Upload className="w-4 h-4 mr-2" />
                            Analyze & Validate
                          </>
                        )}
                      </Button>
                      <Button variant="outline" onClick={handleReset}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}

                {error && (
                  <Alert variant="destructive">
                    <XCircle className="w-4 h-4" />
                    <AlertTitle>Analysis Failed</AlertTitle>
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                {result && (
                  <div className="space-y-6">
                    {/* Validation Result */}
                    <Alert variant={result.is_qualified ? "default" : "destructive"} className={result.is_qualified ? "border-green-500 bg-green-500/10" : ""}>
                      {result.is_qualified ? (
                        <CheckCircle className="w-5 h-5 text-green-500" />
                      ) : (
                        <XCircle className="w-5 h-5" />
                      )}
                      <AlertTitle className="text-lg">
                        {result.is_qualified ? 'Video Qualified!' : 'Video Not Qualified'}
                      </AlertTitle>
                      <AlertDescription className="text-base">
                        {result.validation_message}
                      </AlertDescription>
                    </Alert>

                    {/* Metadata Display */}
                    <div className="grid md:grid-cols-3 gap-4">
                      <Card>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm flex items-center gap-2">
                            <FileVideo className="w-4 h-4 text-primary" />
                            File Information
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2">
                          <div>
                            <dt className="text-xs text-muted-foreground">Filename</dt>
                            <dd className="text-sm font-mono truncate">{result.filename}</dd>
                          </div>
                          <div>
                            <dt className="text-xs text-muted-foreground">Size</dt>
                            <dd className="text-sm font-mono">{formatFileSize(result.file_size)}</dd>
                          </div>
                          <div>
                            <dt className="text-xs text-muted-foreground">Duration</dt>
                            <dd className="text-sm font-mono">{result.duration_formatted}</dd>
                          </div>
                        </CardContent>
                      </Card>

                      <Card>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm flex items-center gap-2">
                            <Film className="w-4 h-4 text-primary" />
                            Video Stream
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2">
                          <div>
                            <dt className="text-xs text-muted-foreground">Resolution</dt>
                            <dd className="text-sm font-mono">{result.resolution || 'N/A'}</dd>
                          </div>
                          <div>
                            <dt className="text-xs text-muted-foreground">Codec</dt>
                            <dd className="text-sm font-mono">{result.video_codec || 'N/A'}</dd>
                          </div>
                          <div>
                            <dt className="text-xs text-muted-foreground">Audio Codec</dt>
                            <dd className="text-sm font-mono">{result.audio_codec || 'N/A'}</dd>
                          </div>
                        </CardContent>
                      </Card>

                      <Card>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm flex items-center gap-2">
                            <Clock className="w-4 h-4 text-primary" />
                            Recording Time
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2">
                          <div>
                            <dt className="text-xs text-muted-foreground">Start Time</dt>
                            <dd className="text-sm font-mono">{result.video_start_time || 'N/A'}</dd>
                          </div>
                          <div>
                            <dt className="text-xs text-muted-foreground">End Time</dt>
                            <dd className="text-sm font-mono">{result.video_end_time || 'N/A'}</dd>
                          </div>
                          <div>
                            <dt className="text-xs text-muted-foreground">Matched Period</dt>
                            <dd className="text-sm font-mono">
                              {result.matched_period ? `Period ${result.matched_period}` : 'None'}
                            </dd>
                          </div>
                        </CardContent>
                      </Card>
                    </div>

                    <Button onClick={handleReset} className="w-full">
                      Analyze Another Video
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Periods Tab */}
          <TabsContent value="periods">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="w-5 h-5 text-primary" />
                  Period Timings
                </CardTitle>
                <CardDescription>
                  Video recording times are validated against these period timings
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {periods.map((period) => (
                    <div
                      key={period.period}
                      className="p-4 border rounded-lg bg-muted/30 flex items-center gap-3"
                    >
                      <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                        <span className="text-primary font-bold">{period.period}</span>
                      </div>
                      <div>
                        <p className="font-medium">Period {period.period}</p>
                        <p className="text-sm text-muted-foreground">{period.display_time}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* History Tab */}
          <TabsContent value="history">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <History className="w-5 h-5 text-primary" />
                  Upload History
                </CardTitle>
                <CardDescription>
                  Your previously uploaded and validated videos
                </CardDescription>
              </CardHeader>
              <CardContent>
                {historyLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-8 h-8 animate-spin text-primary" />
                  </div>
                ) : history.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <FileVideo className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p>No videos uploaded yet</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {history.map((item) => (
                      <div
                        key={item.id}
                        className={`p-4 border rounded-lg ${
                          item.is_qualified
                            ? 'border-green-500/30 bg-green-500/5'
                            : 'border-red-500/30 bg-red-500/5'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex items-start gap-3">
                            {item.is_qualified ? (
                              <CheckCircle className="w-5 h-5 text-green-500 mt-0.5" />
                            ) : (
                              <XCircle className="w-5 h-5 text-red-500 mt-0.5" />
                            )}
                            <div>
                              <p className="font-medium">{item.filename}</p>
                              <p className="text-sm text-muted-foreground">
                                {item.validation_message}
                              </p>
                              <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                                <span className="flex items-center gap-1">
                                  <Calendar className="w-3 h-3" />
                                  {formatDate(item.upload_date)}
                                </span>
                                {item.matched_period && (
                                  <span className="flex items-center gap-1">
                                    <Clock className="w-3 h-3" />
                                    Period {item.matched_period}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                          <span
                            className={`px-2 py-1 text-xs rounded-full ${
                              item.is_qualified
                                ? 'bg-green-500/20 text-green-400'
                                : 'bg-red-500/20 text-red-400'
                            }`}
                          >
                            {item.is_qualified ? 'Qualified' : 'Not Qualified'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
