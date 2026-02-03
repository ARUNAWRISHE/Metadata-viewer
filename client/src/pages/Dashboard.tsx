import { useState, useEffect } from 'react';
import { useAuth, getAuthHeaders } from '@/lib/auth';
import { VideoDropzone } from '@/components/VideoDropzone';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Loader2,
  LogOut,
  Upload,
  Clock,
  CheckCircle,
  XCircle,
  FileVideo,
  Film,
  User,
  Calendar,
  ArrowLeft
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

interface PeriodUploadInfo {
  id: number;
  filename: string;
  is_qualified: boolean;
  upload_date: string;
  validation_message: string;
}

interface TodayPeriodStatus {
  period: number;
  start_time: string;
  end_time: string;
  display_time: string;
  subject: string;
  class_type: string;
  department: string;
  uploaded: boolean;
  upload_info: PeriodUploadInfo | null;
}

interface TodayStatus {
  date: string;
  day: string;
  faculty_name: string;
  periods: TodayPeriodStatus[];
}

export default function Dashboard() {
  const { user, logout } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<VideoAnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [todayStatus, setTodayStatus] = useState<TodayStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [selectedPeriod, setSelectedPeriod] = useState<TodayPeriodStatus | null>(null);

  useEffect(() => {
    fetchTodayStatus();
  }, []);

  const fetchTodayStatus = async () => {
    setStatusLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/video/today-status`, {
        headers: getAuthHeaders(),
      });
      if (response.ok) {
        const data = await response.json();
        setTodayStatus(data);
      }
    } catch (err) {
      console.error('Failed to fetch today status:', err);
    } finally {
      setStatusLoading(false);
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
      fetchTodayStatus(); // Refresh status after upload
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

  const handleBackToPeriods = () => {
    setSelectedPeriod(null);
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

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="border-b border-blue-600 bg-blue-500">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">
              <span className="text-white">Meta</span><span className="text-black">View</span>
            </h1>
            <p className="text-sm text-black/70">Faculty Video Validation</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-black" />
                <span className="font-medium text-black">{user?.faculty_name}</span>
              </div>
              <span className="text-sm text-black/70">{user?.department}</span>
            </div>
            <Button variant="outline" size="sm" onClick={logout} className="bg-white text-black border-white hover:bg-blue-100">
              <LogOut className="w-4 h-4 mr-2" />
              Logout
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-5xl mx-auto px-4 py-8">
        {/* Today's Date Header */}
        {todayStatus && (
          <div className="mb-6 text-center">
            <h2 className="text-2xl font-bold text-black flex items-center justify-center gap-2">
              <Calendar className="w-6 h-6 text-blue-600" />
              {todayStatus.day}, {new Date(todayStatus.date).toLocaleDateString('en-IN', { 
                day: 'numeric', 
                month: 'long', 
                year: 'numeric' 
              })}
            </h2>
            <p className="text-black/60 mt-1">Upload your class videos for today's periods (12 AM - 12 AM)</p>
          </div>
        )}

        {statusLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
          </div>
        ) : !selectedPeriod ? (
          /* Period Selection View */
          <div className="space-y-6">
            {todayStatus && todayStatus.periods.length > 0 ? (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {todayStatus.periods.map((period) => (
                  <Card 
                    key={period.period}
                    className={`cursor-pointer transition-all hover:shadow-lg ${
                      period.uploaded 
                        ? 'bg-white border-2 border-blue-500' 
                        : 'bg-white border-2 border-blue-200 hover:border-blue-400'
                    }`}
                    onClick={() => !period.uploaded && setSelectedPeriod(period)}
                  >
                    <CardContent className="pt-6">
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <div className={`w-14 h-14 rounded-full flex items-center justify-center ${
                            period.uploaded 
                              ? period.upload_info?.is_qualified 
                                ? 'bg-blue-500' 
                                : 'bg-blue-300'
                              : 'bg-blue-100'
                          }`}>
                            {period.uploaded ? (
                              period.upload_info?.is_qualified ? (
                                <CheckCircle className="w-8 h-8 text-white" />
                              ) : (
                                <XCircle className="w-8 h-8 text-white" />
                              )
                            ) : (
                              <span className="text-2xl font-bold text-blue-600">{period.period}</span>
                            )}
                          </div>
                          <div>
                            <h3 className="text-lg font-bold text-black">Period {period.period}</h3>
                            <p className="text-sm text-black/60">{period.display_time}</p>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-2 mb-4">
                        <div className="flex justify-between text-sm">
                          <span className="text-black/60">Subject</span>
                          <span className="font-medium text-black">{period.subject || 'N/A'}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-black/60">Type</span>
                          <span className="px-2 py-0.5 bg-blue-100 text-blue-600 rounded text-xs font-medium">
                            {period.class_type || 'N/A'}
                          </span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-black/60">Department</span>
                          <span className="font-medium text-black">{period.department}</span>
                        </div>
                      </div>

                      {period.uploaded ? (
                        <div className={`p-3 rounded-lg ${
                          period.upload_info?.is_qualified 
                            ? 'bg-blue-50 border border-blue-200' 
                            : 'bg-blue-50 border border-blue-200'
                        }`}>
                          <div className="flex items-center gap-2 mb-1">
                            {period.upload_info?.is_qualified ? (
                              <CheckCircle className="w-4 h-4 text-blue-600" />
                            ) : (
                              <XCircle className="w-4 h-4 text-blue-400" />
                            )}
                            <span className={`font-semibold ${
                              period.upload_info?.is_qualified ? 'text-blue-600' : 'text-blue-400'
                            }`}>
                              {period.upload_info?.is_qualified ? 'Qualified' : 'Disqualified'}
                            </span>
                          </div>
                          <p className="text-xs text-black/60 truncate">{period.upload_info?.filename}</p>
                          <p className="text-xs text-black/50 mt-1">{period.upload_info?.validation_message}</p>
                        </div>
                      ) : (
                        <Button className="w-full bg-blue-500 hover:bg-blue-600 text-white">
                          <Upload className="w-4 h-4 mr-2" />
                          Upload Video
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <Card className="bg-white border-blue-200">
                <CardContent className="py-12 text-center">
                  <Calendar className="w-16 h-16 mx-auto mb-4 text-blue-300" />
                  <h3 className="text-xl font-semibold text-black mb-2">No Classes Today</h3>
                  <p className="text-black/60">You don't have any scheduled classes for today ({todayStatus?.day}).</p>
                </CardContent>
              </Card>
            )}

            {/* Summary Stats */}
            {todayStatus && todayStatus.periods.length > 0 && (
              <Card className="bg-blue-50 border-blue-200">
                <CardContent className="py-4">
                  <div className="flex items-center justify-center gap-8">
                    <div className="text-center">
                      <p className="text-3xl font-bold text-black">{todayStatus.periods.length}</p>
                      <p className="text-sm text-black/60">Total Periods</p>
                    </div>
                    <div className="w-px h-12 bg-blue-200" />
                    <div className="text-center">
                      <p className="text-3xl font-bold text-blue-600">
                        {todayStatus.periods.filter(p => p.uploaded && p.upload_info?.is_qualified).length}
                      </p>
                      <p className="text-sm text-black/60">Qualified</p>
                    </div>
                    <div className="w-px h-12 bg-blue-200" />
                    <div className="text-center">
                      <p className="text-3xl font-bold text-blue-400">
                        {todayStatus.periods.filter(p => p.uploaded && !p.upload_info?.is_qualified).length}
                      </p>
                      <p className="text-sm text-black/60">Disqualified</p>
                    </div>
                    <div className="w-px h-12 bg-blue-200" />
                    <div className="text-center">
                      <p className="text-3xl font-bold text-black/40">
                        {todayStatus.periods.filter(p => !p.uploaded).length}
                      </p>
                      <p className="text-sm text-black/60">Pending</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        ) : (
          /* Upload View for Selected Period */
          <div className="space-y-6">
            {/* Back Button */}
            <Button 
              variant="outline" 
              onClick={handleBackToPeriods}
              className="border-blue-200 text-black hover:bg-blue-50"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Periods
            </Button>

            {/* Period Info Card */}
            <Card className="bg-blue-50 border-blue-200">
              <CardContent className="py-4">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-full bg-blue-500 flex items-center justify-center">
                    <span className="text-2xl font-bold text-white">{selectedPeriod.period}</span>
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-black">Period {selectedPeriod.period}</h2>
                    <p className="text-black/60">{selectedPeriod.display_time}</p>
                    <div className="flex items-center gap-4 mt-1">
                      <span className="text-sm text-black">{selectedPeriod.subject}</span>
                      <span className="px-2 py-0.5 bg-blue-200 text-blue-700 rounded text-xs">
                        {selectedPeriod.class_type}
                      </span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Upload Card */}
            <Card className="bg-white border-blue-200">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-black">
                  <FileVideo className="w-5 h-5 text-blue-600" />
                  Upload Video for Period {selectedPeriod.period}
                </CardTitle>
                <CardDescription className="text-black/60">
                  Upload your class recording. The video timestamp must match Period {selectedPeriod.period} timing ({selectedPeriod.display_time}).
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {!file && !result && (
                  <VideoDropzone onFileSelect={handleFileSelect} isProcessing={loading} />
                )}

                {file && !result && (
                  <div className="space-y-4">
                    <div className="p-4 border border-blue-200 rounded-lg bg-blue-50">
                      <div className="flex items-center gap-3">
                        <FileVideo className="w-10 h-10 text-blue-600" />
                        <div>
                          <p className="font-medium text-black">{file.name}</p>
                          <p className="text-sm text-black/60">
                            {formatFileSize(file.size)} • {file.type}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-3">
                      <Button 
                        onClick={handleAnalyze} 
                        disabled={loading} 
                        className="flex-1 bg-blue-500 hover:bg-blue-600"
                      >
                        {loading ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Analyzing...
                          </>
                        ) : (
                          <>
                            <Upload className="w-4 h-4 mr-2" />
                            Upload & Validate
                          </>
                        )}
                      </Button>
                      <Button variant="outline" onClick={handleReset} className="border-blue-200">
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}

                {error && (
                  <Alert variant="destructive">
                    <XCircle className="w-4 h-4" />
                    <AlertTitle>Upload Failed</AlertTitle>
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                {result && (
                  <div className="space-y-6">
                    {/* Validation Result */}
                    <Alert 
                      className={`${
                        result.is_qualified 
                          ? 'border-blue-500 bg-blue-50' 
                          : 'border-blue-300 bg-blue-50'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        {result.is_qualified ? (
                          <CheckCircle className="w-8 h-8 text-blue-600" />
                        ) : (
                          <XCircle className="w-8 h-8 text-blue-400" />
                        )}
                        <div>
                          <AlertTitle className={`text-xl ${
                            result.is_qualified ? 'text-blue-600' : 'text-blue-400'
                          }`}>
                            {result.is_qualified ? '✓ Video Qualified!' : '✗ Video Disqualified'}
                          </AlertTitle>
                          <AlertDescription className="text-black/70 mt-1">
                            {result.validation_message}
                          </AlertDescription>
                        </div>
                      </div>
                    </Alert>

                    {/* Metadata Display */}
                    <div className="grid md:grid-cols-3 gap-4">
                      <Card className="bg-white border-blue-200">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm flex items-center gap-2 text-black">
                            <FileVideo className="w-4 h-4 text-blue-600" />
                            File Information
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2">
                          <div>
                            <dt className="text-xs text-black/50">Filename</dt>
                            <dd className="text-sm font-mono text-black truncate">{result.filename}</dd>
                          </div>
                          <div>
                            <dt className="text-xs text-black/50">Size</dt>
                            <dd className="text-sm font-mono text-black">{formatFileSize(result.file_size)}</dd>
                          </div>
                          <div>
                            <dt className="text-xs text-black/50">Duration</dt>
                            <dd className="text-sm font-mono text-black">{result.duration_formatted}</dd>
                          </div>
                        </CardContent>
                      </Card>

                      <Card className="bg-white border-blue-200">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm flex items-center gap-2 text-black">
                            <Film className="w-4 h-4 text-blue-600" />
                            Video Stream
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2">
                          <div>
                            <dt className="text-xs text-black/50">Resolution</dt>
                            <dd className="text-sm font-mono text-black">{result.resolution || 'N/A'}</dd>
                          </div>
                          <div>
                            <dt className="text-xs text-black/50">Codec</dt>
                            <dd className="text-sm font-mono text-black">{result.video_codec || 'N/A'}</dd>
                          </div>
                          <div>
                            <dt className="text-xs text-black/50">Audio Codec</dt>
                            <dd className="text-sm font-mono text-black">{result.audio_codec || 'N/A'}</dd>
                          </div>
                        </CardContent>
                      </Card>

                      <Card className="bg-white border-blue-200">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm flex items-center gap-2 text-black">
                            <Clock className="w-4 h-4 text-blue-600" />
                            Recording Time
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2">
                          <div>
                            <dt className="text-xs text-black/50">Start Time</dt>
                            <dd className="text-sm font-mono text-black">{result.video_start_time || 'N/A'}</dd>
                          </div>
                          <div>
                            <dt className="text-xs text-black/50">End Time</dt>
                            <dd className="text-sm font-mono text-black">{result.video_end_time || 'N/A'}</dd>
                          </div>
                          <div>
                            <dt className="text-xs text-black/50">Matched Period</dt>
                            <dd className="text-sm font-mono text-black">
                              {result.matched_period ? `Period ${result.matched_period}` : 'None'}
                            </dd>
                          </div>
                        </CardContent>
                      </Card>
                    </div>

                    <Button 
                      onClick={handleBackToPeriods} 
                      className="w-full bg-blue-500 hover:bg-blue-600"
                    >
                      Back to Today's Periods
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </main>
    </div>
  );
}
