import { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
 

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

interface Department {
  id: number;
  name: string;
  code: string;
}

export default function ManagePage() {
  const [todayClasses, setTodayClasses] = useState<TodayClass[]>([]);
  const [stats, setStats] = useState<TodayStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adminToken, setAdminToken] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [allDepartments, setAllDepartments] = useState<Department[]>([]);
  const [selectedDepartments, setSelectedDepartments] = useState<string[]>([]);
  const [selectedPeriods, setSelectedPeriods] = useState<number[]>([]);

  // Get department codes (classes) from all departments
  const classes = useMemo(() => {
    return allDepartments.map(d => d.code).sort();
  }, [allDepartments]);

  // Use full period list for filtering options
  const periods = useMemo(() => {
    return [1, 2, 3, 4, 5, 6, 7, 8, 9];
  }, []);

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
        fetchDepartments();
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

  const fetchDepartments = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/departments`);
      if (response.ok) {
        const data = await response.json();
        setAllDepartments(data);
      }
    } catch (err) {
      console.error('Failed to fetch departments:', err);
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

  // Filter classes based on selected departments and periods
  const filteredClasses = useMemo(() => {
    return todayClasses.filter(classItem => {
      const deptMatch = selectedDepartments.length === 0 || selectedDepartments.includes(classItem.department);
      const periodMatch = selectedPeriods.length === 0 || selectedPeriods.includes(classItem.period);
      return deptMatch && periodMatch;
    });
  }, [todayClasses, selectedDepartments, selectedPeriods]);

  // Use useMemo to categorize classes based on selected date
  const { ended, ongoing, upcoming } = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    
    // If viewing a past date, all classes are "ended"
    if (selectedDate < today) {
      return { ended: filteredClasses, ongoing: [], upcoming: [] };
    }
    
    // If viewing a future date, all classes are "upcoming" (will be)
    if (selectedDate > today) {
      return { ended: [], ongoing: [], upcoming: filteredClasses };
    }
    
    // If viewing today, use current time to categorize
    const currentTime = getCurrentTime();
    
    const ended = filteredClasses.filter(classItem => {
      const endTime = timeToMinutes(classItem.end_time);
      return endTime < currentTime;
    });

    const ongoing = filteredClasses.filter(classItem => {
      const startTime = timeToMinutes(classItem.start_time);
      const endTime = timeToMinutes(classItem.end_time);
      return startTime <= currentTime && currentTime <= endTime;
    });

    const upcoming = filteredClasses.filter(classItem => {
      const startTime = timeToMinutes(classItem.start_time);
      return startTime > currentTime;
    });

    return { ended, ongoing, upcoming };
  }, [filteredClasses, selectedDate]); // Recalculate when filteredClasses or selectedDate changes

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

  const toggleDepartment = (dept: string) => {
    setSelectedDepartments(prev => 
      prev.includes(dept) ? prev.filter(d => d !== dept) : [...prev, dept]
    );
  };

  const togglePeriod = (period: number) => {
    setSelectedPeriods(prev => 
      prev.includes(period) ? prev.filter(p => p !== period) : [...prev, period]
    );
  };

  const clearFilters = () => {
    setSelectedDepartments([]);
    setSelectedPeriods([]);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-center">
          <p className="text-blue-700 font-medium">Loading today's classes...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white text-black">
      {/* Header */}
      <header className="border-b border-blue-700 bg-blue-700 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div>
              <h1 className="text-xl font-bold">
                <span className="text-white">Classes</span> <span className="text-white/90">Dashboard</span>
              </h1>
              <p className="text-xs text-white/80">{getDisplayDate()}</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <Input
              type="date"
              value={selectedDate}
              onChange={handleDateChange}
              className="w-40 border-blue-300 bg-white text-black"
            />
            <Button variant="outline" size="sm" className="border-white text-white hover:bg-white hover:text-blue-700" onClick={() => fetchTodayData()}>
              Refresh
            </Button>
          </div>
        </div>
      </header>

      {/* Filters Section */}
      <div className="border-b border-blue-200 bg-white">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex flex-wrap items-center gap-4">
            {/* Class/Department Filter */}
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-blue-700">Class:</span>
              <div className="flex flex-wrap gap-1">
                {classes.length === 0 ? (
                  <span className="text-xs text-blue-600">No classes</span>
                ) : (
                  classes.map(cls => (
                    <button
                      key={cls}
                      onClick={() => toggleDepartment(cls)}
                      className={`px-2 py-1 text-xs rounded-full border transition-colors ${
                        selectedDepartments.includes(cls)
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-white border-blue-200 hover:bg-blue-50'
                      }`}
                    >
                      {cls}
                    </button>
                  ))
                )}
              </div>
            </div>

            <div className="h-6 w-px bg-blue-200 hidden sm:block" />

            {/* Period Filter */}
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-blue-700">Period:</span>
              <div className="flex flex-wrap gap-1">
                {periods.length === 0 ? (
                  <span className="text-xs text-blue-600">No periods</span>
                ) : (
                  periods.map(period => (
                    <button
                      key={period}
                      onClick={() => togglePeriod(period)}
                      className={`w-7 h-7 text-xs rounded-full border transition-colors ${
                        selectedPeriods.includes(period)
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-white border-blue-200 hover:bg-blue-50'
                      }`}
                    >
                      {period}
                    </button>
                  ))
                )}
              </div>
            </div>

            {/* Clear Filters */}
            {(selectedDepartments.length > 0 || selectedPeriods.length > 0) && (
              <>
                <div className="h-6 w-px bg-blue-200 hidden sm:block" />
                <Button variant="outline" size="sm" onClick={clearFilters} className="text-xs">
                  Clear Filters
                </Button>
                <span className="text-xs text-blue-600">
                  Showing {filteredClasses.length} of {todayClasses.length} classes
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        {error && (
          <Alert className="mb-6 border-blue-200 bg-white">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Today's Stats */}
        {stats && (
          <div className="grid gap-4 md:grid-cols-4 mb-8">
            <Card className="bg-white border-blue-200">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-blue-700">Total Classes</p>
                    <p className="text-3xl font-bold">{stats.total_classes}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-white border-blue-200">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-blue-700">Faculty Uploaded</p>
                    <p className="text-3xl font-bold">{stats.faculty_with_uploads}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-white border-blue-200">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-blue-700">Qualified</p>
                    <p className="text-3xl font-bold">{stats.qualified_uploads}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-white border-blue-200">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-blue-700">Pending</p>
                    <p className="text-3xl font-bold ">{stats.pending_uploads}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Faculty Classes by Status */}
        <div className="space-y-8">
          <h2 className="text-2xl font-bold text-black">
            {selectedDate === new Date().toISOString().split('T')[0] ? "Today's" : getDisplayDate().split(',')[0] + "'s"} Class Status
          </h2>

          {/* Ongoing Classes - Only show for today */}
          {selectedDate === new Date().toISOString().split('T')[0] && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <h3 className="text-xl font-semibold text-blue-700">Currently Going On</h3>
              <span className="bg-blue-50 text-blue-700 px-2 py-1 rounded-full text-sm border border-blue-200">
                {ongoing.length} classes
              </span>
            </div>
            
            {ongoing.length === 0 ? (
              <Card>
                <CardContent className="pt-8 pb-8 text-center">
                  <p className="text-blue-600">No classes currently in session</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {ongoing.map((classItem) => (
                  <Card key={`${classItem.faculty_id}-${classItem.period}`} className="bg-white border-blue-200">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <CardTitle className="text-lg flex items-center gap-2">
                            <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                              <span className="text-sm font-bold text-blue-700">
                                {classItem.faculty_name.charAt(0)}
                              </span>
                            </div>
                            <div className="min-w-0">
                              <p className="truncate">{classItem.faculty_name}</p>
                              <p className="text-xs text-blue-600 font-normal">{classItem.department}</p>
                            </div>
                          </CardTitle>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <div className="space-y-3">
                        {/* Period Information */}
                        <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-sm font-medium">Period {classItem.period}</p>
                              <p className="text-xs text-blue-600">{classItem.display_time}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-xs text-blue-700 font-medium">LIVE NOW</p>
                              <p className="text-xs text-blue-600">
                                {classItem.start_time} - {classItem.end_time}
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* Upload Status */}
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-black">Upload Status:</span>
                          {classItem.has_upload ? (
                            <span className={classItem.is_qualified ? "text-green-600 font-medium" : "text-red-600 font-medium"}>
                              {classItem.is_qualified ? 'Qualified' : 'Not Qualified'}
                            </span>
                          ) : (
                            <span className="text-orange-600 font-medium">Pending</span>
                          )}
                        </div>

                        {/* Filename and Drive Link */}
                        {classItem.upload_filename && (
                          <div className="text-xs text-black p-2 bg-blue-50 rounded border border-blue-200">
                            <div className="flex items-center justify-between">
                              <span><span className="font-medium">File:</span> {classItem.upload_filename}</span>
                              {classItem.drive_url && (
                                <a
                                  href={classItem.drive_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-blue-700 hover:text-blue-900 ml-2"
                                >
                                  <span>View</span>
                                </a>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Validation Message / Failure Reason */}
                        {classItem.has_upload && classItem.validation_message && (
                          <div className="text-xs p-2 rounded bg-blue-50 text-black border border-blue-200">
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
          )}

          {/* Upcoming Classes - Show for today and future dates */}
          {selectedDate >= new Date().toISOString().split('T')[0] && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <h3 className="text-xl font-semibold text-blue-700">
                {selectedDate > new Date().toISOString().split('T')[0] ? 'Scheduled Classes' : 'Will Be'}
              </h3>
              <span className="bg-blue-50 text-blue-700 px-2 py-1 rounded-full text-sm border border-blue-200">
                {upcoming.length} classes
              </span>
            </div>
            
            {upcoming.length === 0 ? (
              <Card>
                <CardContent className="pt-8 pb-8 text-center">
                  <p className="text-blue-600">No more classes scheduled for today</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {upcoming.map((classItem) => (
                  <Card key={`${classItem.faculty_id}-${classItem.period}`} className="bg-white border-blue-200">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <CardTitle className="text-lg flex items-center gap-2">
                            <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                              <span className="text-sm font-bold text-blue-700">
                                {classItem.faculty_name.charAt(0)}
                              </span>
                            </div>
                            <div className="min-w-0">
                              <p className="truncate">{classItem.faculty_name}</p>
                              <p className="text-xs text-blue-600 font-normal">{classItem.department}</p>
                            </div>
                          </CardTitle>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <div className="space-y-3">
                        {/* Period Information */}
                        <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-sm font-medium">Period {classItem.period}</p>
                              <p className="text-xs text-blue-600">{classItem.display_time}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-xs text-blue-700 font-medium">UPCOMING</p>
                              <p className="text-xs text-blue-600">
                                {classItem.start_time} - {classItem.end_time}
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* Upload Status */}
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-black">Upload Status:</span>
                          {classItem.has_upload ? (
                            <span className={classItem.is_qualified ? "text-green-600 font-medium" : "text-red-600 font-medium"}>
                              {classItem.is_qualified ? 'Ready' : 'Not Qualified'}
                            </span>
                          ) : (
                            <span className="text-orange-600 font-medium">Not Uploaded</span>
                          )}
                        </div>

                        {/* Filename and Drive Link */}
                        {classItem.upload_filename && (
                          <div className="text-xs text-black p-2 bg-blue-50 rounded border border-blue-200">
                            <div className="flex items-center justify-between">
                              <span><span className="font-medium">File:</span> {classItem.upload_filename}</span>
                              {classItem.drive_url && (
                                <a
                                  href={classItem.drive_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-blue-700 hover:text-blue-900 ml-2"
                                >
                                  <span>View</span>
                                </a>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Validation Message / Failure Reason */}
                        {classItem.has_upload && classItem.validation_message && (
                          <div className="text-xs p-2 rounded bg-blue-50 text-black border border-blue-200">
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
          )}

          {/* Ended Classes - Show for today and past dates */}
          {selectedDate <= new Date().toISOString().split('T')[0] && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <h3 className="text-xl font-semibold text-blue-700">Ended</h3>
              <span className="bg-blue-50 text-blue-700 px-2 py-1 rounded-full text-sm border border-blue-200">
                {ended.length} classes
              </span>
            </div>
            
            {ended.length === 0 ? (
              <Card>
                <CardContent className="pt-8 pb-8 text-center">
                  <p className="text-blue-600">{selectedDate < new Date().toISOString().split('T')[0] ? 'No classes were scheduled for this day' : 'No classes have ended yet today'}</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                {ended.map((classItem) => (
                  <Card key={`${classItem.faculty_id}-${classItem.period}`} className="bg-white border-blue-200">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <CardTitle className="text-sm flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                              <span className="text-xs font-bold text-blue-700">
                                {classItem.faculty_name.charAt(0)}
                              </span>
                            </div>
                            <div className="min-w-0">
                              <p className="truncate text-sm">{classItem.faculty_name}</p>
                              <p className="text-xs text-blue-600 font-normal">{classItem.department}</p>
                            </div>
                          </CardTitle>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <div className="space-y-2">
                        <div className="p-2 bg-blue-50 rounded text-xs border border-blue-200">
                          <div className="flex justify-between">
                            <span>Period {classItem.period}</span>
                            <span className="text-blue-600">ENDED</span>
                          </div>
                        </div>
                        <div className="text-xs flex items-center justify-between">
                          {classItem.has_upload ? (
                            <span className={classItem.is_qualified ? "text-green-600" : "text-red-600"}>
                              {classItem.is_qualified ? "Completed" : "Failed"}
                            </span>
                          ) : (
                            <span className="text-orange-600">No Upload</span>
                          )}
                          {classItem.drive_url && (
                            <a
                              href={classItem.drive_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-700 hover:text-blue-900"
                            >
                              <span>View</span>
                            </a>
                          )}
                        </div>

                        {/* Validation Message / Failure Reason */}
                        {classItem.has_upload && !classItem.is_qualified && classItem.validation_message && (
                          <div className="text-xs p-2 rounded bg-blue-50 text-black border border-blue-200">
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
          )}
        </div>
      </main>
    </div>
  );
}