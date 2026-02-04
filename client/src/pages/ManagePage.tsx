import { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import {
  Loader2,
  Shield,
  CheckCircle,
  XCircle,
  Clock,
  RefreshCw,
  Calendar,
  User,
  ExternalLink
} from 'lucide-react';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

interface TodayClass {
  period: number;
  start_time: string;
  end_time: string;
  display_time: string;
  faculty_id: number;
  faculty_name: string;
  department: string;
  subject?: string;
  class_type?: string;
  has_upload: boolean;
  is_qualified: boolean | null;
  upload_filename?: string;
  validation_message?: string;
  drive_url?: string;
}

interface TodayStats {
  total_classes: number;
  faculty_with_uploads: number;
  qualified_uploads: number;
  pending_uploads: number;
}

export default function ManagePage() {
  const [todayClasses, setTodayClasses] = useState<TodayClass[]>([]);
  const [stats, setStats] = useState<TodayStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adminToken, setAdminToken] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);

  useEffect(() => {
    autoLogin();
  }, []);

  useEffect(() => {
    if (adminToken) {
      fetchTodayData(adminToken, selectedDate);
    }
  }, [selectedDate]);

  const autoLogin = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          username: 'mail-admin@gmail.com', 
          password: 'admin123' 
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setAdminToken(data.access_token);
        fetchTodayData(data.access_token);
      } else {
        throw new Error('Auto-login failed');
      }
    } catch (err) {
      setError('Failed to authenticate with admin credentials');
      setLoading(false);
    }
  };

  const fetchTodayData = async (token?: string, date?: string) => {
    const authToken = token || adminToken;
    if (!authToken) return;
    
    setLoading(true);
    setError(null);
    try {
      const headers = { 'Authorization': `Bearer ${authToken}` };
      
      // Use selected date or today's date
      const targetDate = date || selectedDate;
      const url = `${API_BASE_URL}/api/admin/today-classes?date=${targetDate}`;
      
      const response = await fetch(url, { headers });
      
      if (!response.ok) {
        const errorData = await response.text();
        throw new Error(`Failed to fetch today's data: ${response.status} - ${errorData}`);
      }

      const data = await response.json();
      setTodayClasses(data.classes || []);
      setStats(data.stats || { total_classes: 0, faculty_with_uploads: 0, qualified_uploads: 0, pending_uploads: 0 });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load today\'s data');
    } finally {
      setLoading(false);
    }
  };

  const getCurrentTime = () => {
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes(); // Convert to minutes since midnight
  };

  const timeToMinutes = (timeStr: string) => {
    // Handle AM/PM format like "08:45 AM"
    const [time, period] = timeStr.split(' ');
    const [hours, minutes] = time.split(':').map(Number);
    
    let adjustedHours = hours;
    if (period === 'PM' && hours !== 12) {
      adjustedHours += 12;
    } else if (period === 'AM' && hours === 12) {
      adjustedHours = 0;
    }
    
    return adjustedHours * 60 + minutes;
  };

  // Use useMemo to categorize classes when todayClasses changes
  const { ended, ongoing, upcoming } = useMemo(() => {
    const currentTime = getCurrentTime();
    
    const ended = todayClasses.filter(classItem => {
      const endTime = timeToMinutes(classItem.end_time);
      return endTime < currentTime;
    });

    const ongoing = todayClasses.filter(classItem => {
      const startTime = timeToMinutes(classItem.start_time);
      const endTime = timeToMinutes(classItem.end_time);
      return startTime <= currentTime && currentTime <= endTime;
    });

    const upcoming = todayClasses.filter(classItem => {
      const startTime = timeToMinutes(classItem.start_time);
      return startTime > currentTime;
    });

    return { ended, ongoing, upcoming };
  }, [todayClasses]); // Recalculate when todayClasses changes

  const getDisplayDate = () => {
    const date = new Date(selectedDate + 'T00:00:00');
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSelectedDate(e.target.value);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Loading today's classes...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="border-b border-border bg-card sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
              <Shield className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold">
                <span className="text-primary">Classes</span> Dashboard
              </h1>
              <p className="text-xs text-muted-foreground">{getDisplayDate()}</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <Input
              type="date"
              value={selectedDate}
              onChange={handleDateChange}
              className="w-40"
            />
            <Button variant="ghost" size="sm" onClick={() => fetchTodayData()}>
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        {error && (
          <Alert variant="destructive" className="mb-6">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Today's Stats */}
        {stats && (
          <div className="grid gap-4 md:grid-cols-4 mb-8">
            <Card className="bg-gradient-to-br from-blue-500/10 to-blue-600/5 border-blue-500/20">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Total Classes</p>
                    <p className="text-3xl font-bold">{stats.total_classes}</p>
                  </div>
                  <div className="w-12 h-12 rounded-full bg-blue-500/20 flex items-center justify-center">
                    <Calendar className="w-6 h-6 text-blue-500" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-green-500/10 to-green-600/5 border-green-500/20">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Faculty Uploaded</p>
                    <p className="text-3xl font-bold text-green-500">{stats.faculty_with_uploads}</p>
                  </div>
                  <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center">
                    <User className="w-6 h-6 text-green-500" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-emerald-500/10 to-emerald-600/5 border-emerald-500/20">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Qualified</p>
                    <p className="text-3xl font-bold text-emerald-500">{stats.qualified_uploads}</p>
                  </div>
                  <div className="w-12 h-12 rounded-full bg-emerald-500/20 flex items-center justify-center">
                    <CheckCircle className="w-6 h-6 text-emerald-500" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-amber-500/10 to-amber-600/5 border-amber-500/20">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Pending</p>
                    <p className="text-3xl font-bold text-amber-500">{stats.pending_uploads}</p>
                  </div>
                  <div className="w-12 h-12 rounded-full bg-amber-500/20 flex items-center justify-center">
                    <Clock className="w-6 h-6 text-amber-500" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Faculty Classes by Status */}
        <div className="space-y-8">
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Calendar className="w-6 h-6 text-primary" />
            Today's Class Status
          </h2>

          {/* Ongoing Classes */}
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
              <h3 className="text-xl font-semibold text-green-600">Currently Going On</h3>
              <span className="bg-green-100 text-green-800 px-2 py-1 rounded-full text-sm">
                {ongoing.length} classes
              </span>
            </div>
            
            {ongoing.length === 0 ? (
              <Card>
                <CardContent className="pt-8 pb-8 text-center">
                  <Clock className="w-12 h-12 mx-auto mb-4 text-muted-foreground/50" />
                  <p className="text-muted-foreground">No classes currently in session</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {ongoing.map((classItem) => (
                  <Card key={`${classItem.faculty_id}-${classItem.period}`} className="bg-green-50 border-green-200">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <CardTitle className="text-lg flex items-center gap-2">
                            <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center flex-shrink-0">
                              <span className="text-sm font-bold text-green-600">
                                {classItem.faculty_name.charAt(0)}
                              </span>
                            </div>
                            <div className="min-w-0">
                              <p className="truncate">{classItem.faculty_name}</p>
                              <p className="text-xs text-muted-foreground font-normal">{classItem.department}</p>
                            </div>
                          </CardTitle>
                        </div>
                        <div className="flex-shrink-0 ml-2">
                          {classItem.has_upload ? (
                            classItem.is_qualified ? (
                              <div className="w-8 h-8 rounded-full bg-green-500/20 flex items-center justify-center">
                                <CheckCircle className="w-5 h-5 text-green-500" />
                              </div>
                            ) : (
                              <div className="w-8 h-8 rounded-full bg-red-500/20 flex items-center justify-center">
                                <XCircle className="w-5 h-5 text-red-500" />
                              </div>
                            )
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-amber-500/20 flex items-center justify-center">
                              <Clock className="w-5 h-5 text-amber-500" />
                            </div>
                          )}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <div className="space-y-3">
                        {/* Period Information */}
                        <div className="p-3 bg-green-100/50 rounded-lg">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-sm font-medium">Period {classItem.period}</p>
                              <p className="text-xs text-muted-foreground">{classItem.display_time}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-xs text-green-600 font-medium">LIVE NOW</p>
                              <p className="text-xs text-muted-foreground">
                                {classItem.start_time} - {classItem.end_time}
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* Upload Status */}
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Upload Status:</span>
                          {classItem.has_upload ? (
                            <div className="flex items-center gap-1">
                              {classItem.is_qualified ? (
                                <>
                                  <CheckCircle className="w-4 h-4 text-green-500" />
                                  <span className="text-green-500 font-medium">Qualified</span>
                                </>
                              ) : (
                                <>
                                  <XCircle className="w-4 h-4 text-red-500" />
                                  <span className="text-red-500 font-medium">Not Qualified</span>
                                </>
                              )}
                            </div>
                          ) : (
                            <div className="flex items-center gap-1">
                              <Clock className="w-4 h-4 text-amber-500" />
                              <span className="text-amber-500 font-medium">Pending</span>
                            </div>
                          )}
                        </div>

                        {/* Filename and Drive Link */}
                        {classItem.upload_filename && (
                          <div className="text-xs text-muted-foreground p-2 bg-muted/20 rounded">
                            <div className="flex items-center justify-between">
                              <span><span className="font-medium">File:</span> {classItem.upload_filename}</span>
                              {classItem.drive_url && (
                                <a
                                  href={classItem.drive_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center gap-1 text-blue-600 hover:text-blue-800 ml-2"
                                >
                                  <ExternalLink className="w-3 h-3" />
                                  <span>View</span>
                                </a>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Validation Message / Failure Reason */}
                        {classItem.has_upload && classItem.validation_message && (
                          <div className={`text-xs p-2 rounded ${classItem.is_qualified ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                            <span className="font-medium">Reason:</span> {classItem.validation_message}
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>

          {/* Upcoming Classes */}
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
              <h3 className="text-xl font-semibold text-blue-600">Will Be</h3>
              <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded-full text-sm">
                {upcoming.length} classes
              </span>
            </div>
            
            {upcoming.length === 0 ? (
              <Card>
                <CardContent className="pt-8 pb-8 text-center">
                  <Calendar className="w-12 h-12 mx-auto mb-4 text-muted-foreground/50" />
                  <p className="text-muted-foreground">No more classes scheduled for today</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {upcoming.map((classItem) => (
                  <Card key={`${classItem.faculty_id}-${classItem.period}`} className="bg-blue-50 border-blue-200">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <CardTitle className="text-lg flex items-center gap-2">
                            <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center flex-shrink-0">
                              <span className="text-sm font-bold text-blue-600">
                                {classItem.faculty_name.charAt(0)}
                              </span>
                            </div>
                            <div className="min-w-0">
                              <p className="truncate">{classItem.faculty_name}</p>
                              <p className="text-xs text-muted-foreground font-normal">{classItem.department}</p>
                            </div>
                          </CardTitle>
                        </div>
                        <div className="flex-shrink-0 ml-2">
                          {classItem.has_upload ? (
                            classItem.is_qualified ? (
                              <div className="w-8 h-8 rounded-full bg-green-500/20 flex items-center justify-center">
                                <CheckCircle className="w-5 h-5 text-green-500" />
                              </div>
                            ) : (
                              <div className="w-8 h-8 rounded-full bg-red-500/20 flex items-center justify-center">
                                <XCircle className="w-5 h-5 text-red-500" />
                              </div>
                            )
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-amber-500/20 flex items-center justify-center">
                              <Clock className="w-5 h-5 text-amber-500" />
                            </div>
                          )}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <div className="space-y-3">
                        {/* Period Information */}
                        <div className="p-3 bg-blue-100/50 rounded-lg">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-sm font-medium">Period {classItem.period}</p>
                              <p className="text-xs text-muted-foreground">{classItem.display_time}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-xs text-blue-600 font-medium">UPCOMING</p>
                              <p className="text-xs text-muted-foreground">
                                {classItem.start_time} - {classItem.end_time}
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* Upload Status */}
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Upload Status:</span>
                          {classItem.has_upload ? (
                            <div className="flex items-center gap-1">
                              {classItem.is_qualified ? (
                                <>
                                  <CheckCircle className="w-4 h-4 text-green-500" />
                                  <span className="text-green-500 font-medium">Ready</span>
                                </>
                              ) : (
                                <>
                                  <XCircle className="w-4 h-4 text-red-500" />
                                  <span className="text-red-500 font-medium">Not Qualified</span>
                                </>
                              )}
                            </div>
                          ) : (
                            <div className="flex items-center gap-1">
                              <Clock className="w-4 h-4 text-amber-500" />
                              <span className="text-amber-500 font-medium">Not Uploaded</span>
                            </div>
                          )}
                        </div>

                        {/* Filename and Drive Link */}
                        {classItem.upload_filename && (
                          <div className="text-xs text-muted-foreground p-2 bg-muted/20 rounded">
                            <div className="flex items-center justify-between">
                              <span><span className="font-medium">File:</span> {classItem.upload_filename}</span>
                              {classItem.drive_url && (
                                <a
                                  href={classItem.drive_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center gap-1 text-blue-600 hover:text-blue-800 ml-2"
                                >
                                  <ExternalLink className="w-3 h-3" />
                                  <span>View</span>
                                </a>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Validation Message / Failure Reason */}
                        {classItem.has_upload && classItem.validation_message && (
                          <div className={`text-xs p-2 rounded ${classItem.is_qualified ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                            <span className="font-medium">Reason:</span> {classItem.validation_message}
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>

          {/* Ended Classes */}
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 bg-gray-500 rounded-full"></div>
              <h3 className="text-xl font-semibold text-gray-600">Ended</h3>
              <span className="bg-gray-100 text-gray-800 px-2 py-1 rounded-full text-sm">
                {ended.length} classes
              </span>
            </div>
            
            {ended.length === 0 ? (
              <Card>
                <CardContent className="pt-8 pb-8 text-center">
                  <CheckCircle className="w-12 h-12 mx-auto mb-4 text-muted-foreground/50" />
                  <p className="text-muted-foreground">No classes have ended yet today</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                {ended.map((classItem) => (
                  <Card key={`${classItem.faculty_id}-${classItem.period}`} className="bg-gray-50 border-gray-200">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <CardTitle className="text-sm flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-gray-500/20 flex items-center justify-center flex-shrink-0">
                              <span className="text-xs font-bold text-gray-600">
                                {classItem.faculty_name.charAt(0)}
                              </span>
                            </div>
                            <div className="min-w-0">
                              <p className="truncate text-sm">{classItem.faculty_name}</p>
                              <p className="text-xs text-muted-foreground font-normal">{classItem.department}</p>
                            </div>
                          </CardTitle>
                        </div>
                        <div className="flex-shrink-0 ml-2">
                          {classItem.has_upload ? (
                            classItem.is_qualified ? (
                              <CheckCircle className="w-5 h-5 text-green-500" />
                            ) : (
                              <XCircle className="w-5 h-5 text-red-500" />
                            )
                          ) : (
                            <XCircle className="w-5 h-5 text-gray-400" />
                          )}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <div className="space-y-2">
                        <div className="p-2 bg-gray-100/50 rounded text-xs">
                          <div className="flex justify-between">
                            <span>Period {classItem.period}</span>
                            <span className="text-gray-500">ENDED</span>
                          </div>
                        </div>
                        <div className="text-xs flex items-center justify-between">
                          {classItem.has_upload ? (
                            <span className={classItem.is_qualified ? "text-green-600" : "text-red-600"}>
                              {classItem.is_qualified ? "✓ Completed" : "✗ Failed"}
                            </span>
                          ) : (
                            <span className="text-gray-500">No Upload</span>
                          )}
                          {classItem.drive_url && (
                            <a
                              href={classItem.drive_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1 text-blue-600 hover:text-blue-800"
                            >
                              <ExternalLink className="w-3 h-3" />
                              <span>View</span>
                            </a>
                          )}
                        </div>

                        {/* Validation Message / Failure Reason */}
                        {classItem.has_upload && !classItem.is_qualified && classItem.validation_message && (
                          <div className="text-xs p-2 rounded bg-red-100 text-red-700">
                            <span className="font-medium">Reason:</span> {classItem.validation_message}
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}