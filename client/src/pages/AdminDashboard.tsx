import { useState, useEffect } from 'react';
import { useLocation, useRoute } from 'wouter';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Loader2,
  LogOut,
  Shield,
  Users,
  FileVideo,
  CheckCircle,
  XCircle,
  TrendingUp,
  Search,
  Filter,
  Download,
  Clock,
  Calendar,
  Building,
  RefreshCw,
  ChevronDown,
  BarChart3
} from 'lucide-react';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

interface DashboardStats {
  total_uploads: number;
  qualified_uploads: number;
  not_qualified_uploads: number;
  total_faculties: number;
  active_faculties: number;
  qualification_rate: number;
}

interface Upload {
  id: number;
  filename: string;
  file_size: number | null;
  duration_seconds: number | null;
  video_start_time: string | null;
  video_end_time: string | null;
  resolution: string | null;
  upload_date: string;
  is_qualified: boolean;
  matched_period: number | null;
  validation_message: string | null;
  faculty_id: number;
  faculty_name: string;
  faculty_email: string;
  department: string | null;
}

interface Faculty {
  id: number;
  name: string;
  email: string;
  department: string | null;
  phone: string | null;
  classes?: string[] | null;
  total_uploads: number;
  qualified_uploads: number;
  not_qualified_uploads: number;
}

interface Department {
  id: number;
  name: string;
  code: string;
}

interface TodayClass {
  period: number;
  start_time: string;
  end_time: string;
  display_time: string;
  faculty_id: number;
  faculty_name: string;
  department: string;
  has_upload: boolean;
  is_qualified: boolean | null;
  upload_filename: string | null;
  validation_message: string | null;
}

interface TodayStats {
  total_classes: number;
  faculty_with_uploads: number;
  qualified_uploads: number;
  pending_uploads: number;
}

interface TodayData {
  classes: TodayClass[];
  stats: TodayStats;
}

function getAdminAuth() {
  const stored = localStorage.getItem('adminAuth');
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch {
      return null;
    }
  }
  return null;
}

function getAdminHeaders(skipAuth = false): HeadersInit {
  if (skipAuth) return {};
  const auth = getAdminAuth();
  if (auth?.token) {
    return { 'Authorization': `Bearer ${auth.token}` };
  }
  return {};
}

export default function AdminDashboard() {
  const [, setLocation] = useLocation();
  const [match] = useRoute('/manage');
  const isManageRoute = !!match;
  const [activeTab, setActiveTab] = useState<'overview' | 'uploads' | 'faculties'>('overview');
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [faculties, setFaculties] = useState<Faculty[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingFacultyId, setEditingFacultyId] = useState<number | null>(null);
  const [classEdits, setClassEdits] = useState<Record<number, string>>({});
  
  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [departmentFilter, setDepartmentFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [todayData, setTodayData] = useState<TodayData | null>(null);
  const [todayLoading, setTodayLoading] = useState<boolean>(false);
  const [todayError, setTodayError] = useState<string | null>(null);

  const adminAuth = getAdminAuth();

  useEffect(() => {
    // Skip auth check if accessed via /manage route
    if (!isManageRoute && !adminAuth) {
      setLocation('/admin');
      return;
    }
    fetchData();
  }, [isManageRoute]);

  useEffect(() => {
    if (adminAuth || isManageRoute) {
      fetchTodayData(selectedDate);
    }
  }, [selectedDate]);

  useEffect(() => {
    if ((adminAuth || isManageRoute) && activeTab === 'uploads') {
      fetchUploads();
    }
  }, [statusFilter, departmentFilter]);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [statsRes, uploadsRes, facultiesRes, deptsRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/admin/dashboard`, { headers: getAdminHeaders(isManageRoute) }),
        fetch(`${API_BASE_URL}/api/admin/uploads`, { headers: getAdminHeaders(isManageRoute) }),
        fetch(`${API_BASE_URL}/api/admin/faculties`, { headers: getAdminHeaders(isManageRoute) }),
        fetch(`${API_BASE_URL}/api/admin/departments`)
      ]);

      if (!statsRes.ok || !uploadsRes.ok || !facultiesRes.ok) {
        if (!isManageRoute && (statsRes.status === 401 || uploadsRes.status === 401 || facultiesRes.status === 401)) {
          localStorage.removeItem('adminAuth');
          setLocation('/admin');
          return;
        }
        throw new Error('Failed to fetch data');
      }

      const [statsData, uploadsData, facultiesData, deptsData] = await Promise.all([
        statsRes.json(),
        uploadsRes.json(),
        facultiesRes.json(),
        deptsRes.json()
      ]);

      setStats(statsData);
      setUploads(uploadsData);
      setFaculties(facultiesData);
      setDepartments(deptsData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const fetchUploads = async () => {
    try {
      let url = `${API_BASE_URL}/api/admin/uploads?`;
      if (statusFilter !== 'all') {
        url += `status_filter=${statusFilter}&`;
      }
      if (departmentFilter !== 'all') {
        url += `department=${departmentFilter}&`;
      }
      
      const response = await fetch(url, { headers: getAdminHeaders(isManageRoute) });
      if (response.ok) {
        const data = await response.json();
        setUploads(data);
      }
    } catch (err) {
      console.error('Failed to fetch uploads:', err);
    }
  };

  const handleLogout = () => {
    if (!isManageRoute) {
      localStorage.removeItem('adminAuth');
      setLocation('/admin');
    }
  };

  const startEditClasses = (faculty: Faculty) => {
    const currentClass = faculty.classes?.[0] || faculty.department || '';
    setClassEdits(prev => ({ ...prev, [faculty.id]: currentClass }));
    setEditingFacultyId(faculty.id);
  };

  const cancelEditClasses = () => {
    setEditingFacultyId(null);
  };

  const saveClasses = async (facultyId: number) => {
    const selectedClass = classEdits[facultyId];
    const classes = selectedClass ? [selectedClass] : [];

    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/faculties/${facultyId}/classes`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...getAdminHeaders(isManageRoute)
        },
        body: JSON.stringify({ classes })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || 'Failed to update classes');
      }

      const updated = await response.json();
      setFaculties(prev => prev.map(f => (
        f.id === facultyId
          ? { ...f, classes: updated.classes, department: updated.department ?? f.department }
          : f
      )));
      setEditingFacultyId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update classes');
    }
  };

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return 'N/A';
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return 'N/A';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    const parts = [];
    if (h > 0) parts.push(`${h}h`);
    if (m > 0) parts.push(`${m}m`);
    parts.push(`${s}s`);
    return parts.join(' ');
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const filteredUploads = uploads.filter(upload => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      upload.filename.toLowerCase().includes(query) ||
      upload.faculty_name.toLowerCase().includes(query) ||
      upload.faculty_email.toLowerCase().includes(query) ||
      (upload.department && upload.department.toLowerCase().includes(query))
    );
  });

  const exportToCSV = () => {
    const headers = ['Faculty', 'Department', 'Filename', 'Duration', 'Upload Date', 'Status', 'Period'];
    const rows = filteredUploads.map(u => [
      u.faculty_name,
      u.department || 'N/A',
      u.filename,
      formatDuration(u.duration_seconds),
      formatDate(u.upload_date),
      u.is_qualified ? 'Qualified' : 'Not Qualified',
      u.matched_period ? `Period ${u.matched_period}` : 'N/A'
    ]);
    
    const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `uploads_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const fetchTodayData = async (date: string) => {
    setTodayLoading(true);
    setTodayError(null);
    try {
      const resp = await fetch(`${API_BASE_URL}/api/admin/today-classes?date=${date}`, { headers: getAdminHeaders(isManageRoute) });
      if (!resp.ok) {
        throw new Error('Failed to fetch date data');
      }
      const data = await resp.json();
      setTodayData(data as TodayData);
    } catch (err) {
      setTodayError(err instanceof Error ? err.message : 'Failed to load date data');
      setTodayData(null);
    } finally {
      setTodayLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="border-b border-blue-600 bg-blue-500 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-white/20 flex items-center justify-center">
              <Shield className="w-5 h-5 text-black" />
            </div>
            <div>
              <h1 className="text-xl font-bold">
                <span className="text-white">Meta</span><span className="text-black">View Admin</span>
              </h1>
              <p className="text-xs text-black/70">Dashboard</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={fetchData} className="text-black hover:bg-white/20">
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh
            </Button>
            <div className="text-right hidden sm:block">
              <span className="text-sm font-medium text-black">{adminAuth?.username}</span>
              <p className="text-xs text-black/70">Administrator</p>
            </div>
            <Button variant="outline" size="sm" onClick={handleLogout} className="bg-white text-black border-white hover:bg-blue-100">
              <LogOut className="w-4 h-4 mr-2" />
              Logout
            </Button>
          </div>
        </div>
      </header>

      {/* Tab Navigation */}
      <div className="border-b border-blue-300 bg-blue-100">
        <div className="max-w-7xl mx-auto px-4">
          <nav className="flex gap-1">
            {[
              { id: 'overview', label: 'Overview', icon: BarChart3 },
              { id: 'uploads', label: 'All Uploads', icon: FileVideo },
              { id: 'faculties', label: 'Faculties', icon: Users }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as typeof activeTab)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? 'border-blue-600 text-black'
                    : 'border-transparent text-black/60 hover:text-black'
                }`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        {error && (
          <Alert variant="destructive" className="mb-6">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Overview Tab */}
        {activeTab === 'overview' && stats && (
          <div className="space-y-6">
            {/* Stats Grid */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <Card className="bg-white border-blue-200">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-black/60">Total Uploads</p>
                      <p className="text-3xl font-bold text-black">{stats.total_uploads}</p>
                    </div>
                    <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center">
                      <FileVideo className="w-6 h-6 text-blue-600" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-white border-blue-200">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-black/60">Qualified</p>
                      <p className="text-3xl font-bold text-black">{stats.qualified_uploads}</p>
                    </div>
                    <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center">
                      <CheckCircle className="w-6 h-6 text-blue-600" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-white border-blue-200">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-black/60">Not Qualified</p>
                      <p className="text-3xl font-bold text-black">{stats.not_qualified_uploads}</p>
                    </div>
                    <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center">
                      <XCircle className="w-6 h-6 text-blue-400" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-white border-blue-200">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-black/60">Qualification Rate</p>
                      <p className="text-3xl font-bold text-black">{stats.qualification_rate}%</p>
                    </div>
                    <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center">
                      <TrendingUp className="w-6 h-6 text-blue-600" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Faculty Stats */}
            <div className="grid gap-4 md:grid-cols-2">
              <Card className="bg-white border-blue-200">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-black">
                    <Users className="w-5 h-5 text-blue-600" />
                    Faculty Overview
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center p-3 bg-blue-50 rounded-lg">
                      <span className="text-sm text-black/60">Total Faculties</span>
                      <span className="text-xl font-bold text-black">{stats.total_faculties}</span>
                    </div>
                    <div className="flex justify-between items-center p-3 bg-blue-50 rounded-lg">
                      <span className="text-sm text-black/60">Active (uploaded videos)</span>
                      <span className="text-xl font-bold text-black">{stats.active_faculties}</span>
                    </div>
                    <div className="flex justify-between items-center p-3 bg-blue-50 rounded-lg">
                      <span className="text-sm text-black/60">Inactive</span>
                      <span className="text-xl font-bold text-black">
                        {stats.total_faculties - stats.active_faculties}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-white border-blue-200">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-black">
                    <Clock className="w-5 h-5 text-blue-600" />
                    Recent Activity
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {uploads.length === 0 ? (
                    <p className="text-center py-8 text-black/60">No uploads yet</p>
                  ) : (
                    <div className="space-y-3">
                      {uploads.slice(0, 5).map(upload => (
                        <div key={upload.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-blue-50">
                          {upload.is_qualified ? (
                            <CheckCircle className="w-4 h-4 text-blue-600 flex-shrink-0" />
                          ) : (
                            <XCircle className="w-4 h-4 text-blue-400 flex-shrink-0" />
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate text-black">{upload.faculty_name}</p>
                            <p className="text-xs text-black/60 truncate">{upload.filename}</p>
                          </div>
                          <span className="text-xs text-black/60 whitespace-nowrap">
                            {formatDate(upload.upload_date).split(',')[0]}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Selected Date View */}
            <Card className="bg-white border-blue-200 mt-6">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-black">
                    <Calendar className="w-5 h-5 text-blue-600" />
                    Date View
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <Input
                      type="date"
                      value={selectedDate}
                      onChange={(e: any) => setSelectedDate(e.target.value)}
                      className="text-black"
                    />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {todayLoading ? (
                  <p className="text-black/60">Loading date data...</p>
                ) : todayError ? (
                  <p className="text-red-600">{todayError}</p>
                ) : todayData ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-4 gap-2">
                      <div className="p-3 bg-blue-50 rounded">
                        <p className="text-sm text-black/60">Total Classes</p>
                        <p className="text-lg font-bold text-black">{todayData.stats.total_classes}</p>
                      </div>
                      <div className="p-3 bg-blue-50 rounded">
                        <p className="text-sm text-black/60">Faculties Uploaded</p>
                        <p className="text-lg font-bold text-black">{todayData.stats.faculty_with_uploads}</p>
                      </div>
                      <div className="p-3 bg-blue-50 rounded">
                        <p className="text-sm text-black/60">Qualified</p>
                        <p className="text-lg font-bold text-black">{todayData.stats.qualified_uploads}</p>
                      </div>
                      <div className="p-3 bg-blue-50 rounded">
                        <p className="text-sm text-black/60">Pending</p>
                        <p className="text-lg font-bold text-black">{todayData.stats.pending_uploads}</p>
                      </div>
                    </div>

                    <div>
                      {todayData.classes.length === 0 ? (
                        <p className="text-black/60">No scheduled classes for this date.</p>
                      ) : (
                        <div className="space-y-2">
                          {todayData.classes.map(c => (
                            <div key={`${c.faculty_id}_${c.period}`} className="flex items-center justify-between p-2 rounded bg-blue-50">
                              <div>
                                <p className="text-sm font-medium text-black">Period {c.period} — {c.display_time}</p>
                                <p className="text-xs text-black/60">{c.faculty_name} • {c.department}</p>
                              </div>
                              <div className="text-right">
                                {c.has_upload ? (
                                  <p className={`text-sm ${c.is_qualified ? 'text-blue-600' : 'text-red-600'}`}>
                                    {c.is_qualified ? 'Qualified' : 'Failed'}
                                  </p>
                                ) : (
                                  <p className="text-sm text-black/60">No upload</p>
                                )}
                                {c.upload_filename && <p className="text-xs text-black/60 truncate max-w-[200px]">{c.upload_filename}</p>}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="text-black/60">Select a date to view data.</p>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* Uploads Tab */}
        {activeTab === 'uploads' && (
          <div className="space-y-4">
            {/* Filters */}
            <Card className="bg-white border-blue-200">
              <CardContent className="pt-6">
                <div className="flex flex-col sm:flex-row gap-4">
                  <div className="flex-1">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-black/40" />
                      <Input
                        placeholder="Search by faculty, filename, or department..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-10 text-black"
                      />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <select
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value)}
                      className="px-3 py-2 rounded-md border border-blue-200 bg-white text-sm text-black"
                    >
                      <option value="all">All Status</option>
                      <option value="qualified">Qualified</option>
                      <option value="not_qualified">Not Qualified</option>
                    </select>
                    <select
                      value={departmentFilter}
                      onChange={(e) => setDepartmentFilter(e.target.value)}
                      className="px-3 py-2 rounded-md border border-blue-200 bg-white text-sm text-black"
                    >
                      <option value="all">All Departments</option>
                      {departments.map(dept => (
                        <option key={dept.id} value={dept.code}>{dept.code}</option>
                      ))}
                    </select>
                    <Button variant="outline" size="sm" onClick={exportToCSV} className="border-blue-200 text-black hover:bg-blue-50">
                      <Download className="w-4 h-4 mr-2" />
                      Export
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Uploads Table */}
            <Card className="bg-white border-blue-200">
              <CardHeader>
                <CardTitle className="flex items-center justify-between text-black">
                  <span className="flex items-center gap-2">
                    <FileVideo className="w-5 h-5 text-blue-600" />
                    Video Uploads
                  </span>
                  <span className="text-sm font-normal text-black/60">
                    {filteredUploads.length} records
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {filteredUploads.length === 0 ? (
                  <div className="text-center py-12">
                    <FileVideo className="w-12 h-12 mx-auto mb-4 text-blue-300" />
                    <p className="text-black/60">No uploads found</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-blue-100">
                          <th className="text-left py-3 px-2 text-xs font-medium text-black/60">STATUS</th>
                          <th className="text-left py-3 px-2 text-xs font-medium text-black/60">FACULTY</th>
                          <th className="text-left py-3 px-2 text-xs font-medium text-black/60 hidden md:table-cell">DEPT</th>
                          <th className="text-left py-3 px-2 text-xs font-medium text-black/60">FILENAME</th>
                          <th className="text-left py-3 px-2 text-xs font-medium text-black/60 hidden lg:table-cell">VIDEO TIME</th>
                          <th className="text-left py-3 px-2 text-xs font-medium text-black/60 hidden lg:table-cell">PERIOD</th>
                          <th className="text-left py-3 px-2 text-xs font-medium text-black/60 hidden xl:table-cell">VALIDATION</th>
                          <th className="text-left py-3 px-2 text-xs font-medium text-black/60">DATE</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredUploads.map(upload => (
                          <tr key={upload.id} className={`border-b border-blue-50 hover:bg-blue-50 ${!upload.is_qualified ? 'bg-red-50/30' : ''}`}>
                            <td className="py-3 px-2">
                              {upload.is_qualified ? (
                                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-blue-100 text-blue-600">
                                  <CheckCircle className="w-3 h-3" />
                                  <span className="hidden sm:inline">Qualified</span>
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-red-100 text-red-600">
                                  <XCircle className="w-3 h-3" />
                                  <span className="hidden sm:inline">Failed</span>
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-2">
                              <div>
                                <p className="font-medium text-sm text-black">{upload.faculty_name}</p>
                                <p className="text-xs text-black/60">{upload.faculty_email}</p>
                              </div>
                            </td>
                            <td className="py-3 px-2 hidden md:table-cell">
                              <span className="px-2 py-1 rounded bg-blue-100 text-xs text-black">{upload.department || 'N/A'}</span>
                            </td>
                            <td className="py-3 px-2">
                              <p className="text-sm truncate max-w-[200px] text-black" title={upload.filename}>
                                {upload.filename}
                              </p>
                              <p className="text-xs text-black/60">{upload.resolution || 'N/A'}</p>
                            </td>
                            <td className="py-3 px-2 text-sm text-black hidden lg:table-cell">
                              <div className="text-xs">
                                {upload.video_start_time ? (
                                  <>
                                    <p className="text-black">Start: {upload.video_start_time}</p>
                                    <p className="text-black/60">End: {upload.video_end_time || 'N/A'}</p>
                                  </>
                                ) : (
                                  <span className="text-black/40">No time data</span>
                                )}
                              </div>
                            </td>
                            <td className="py-3 px-2 text-sm hidden lg:table-cell">
                              {upload.matched_period ? (
                                <span className="px-2 py-1 rounded bg-blue-100 text-blue-600 text-xs">
                                  Period {upload.matched_period}
                                </span>
                              ) : (
                                <span className="text-black/40">—</span>
                              )}
                            </td>
                            <td className="py-3 px-2 text-xs hidden xl:table-cell max-w-[300px]">
                              {upload.is_qualified ? (
                                <p className="text-blue-600 truncate" title={upload.validation_message || ''}>
                                  {upload.validation_message || 'Qualified'}
                                </p>
                              ) : (
                                <div className="bg-red-50 border border-red-200 rounded p-2">
                                  <p className="text-red-600 font-medium text-xs whitespace-normal">
                                    {upload.validation_message || 'No validation info'}
                                  </p>
                                </div>
                              )}
                            </td>
                            <td className="py-3 px-2 text-xs text-black/60 whitespace-nowrap">
                              {formatDate(upload.upload_date)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* Faculties Tab */}
        {activeTab === 'faculties' && (
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-black">
                  <Users className="w-5 h-5 text-blue-600" />
                  Faculty Members
                </CardTitle>
                <CardDescription className="text-black/60">
                  Overview of all faculty members and their upload statistics
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {faculties.map(faculty => (
                    <Card key={faculty.id} className="bg-white border-blue-200 hover:border-blue-400 transition-colors">
                      <CardContent className="pt-6">
                        <div className="flex items-start gap-4">
                          <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                            <span className="text-lg font-bold text-blue-600">
                              {faculty.name.charAt(0)}
                            </span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <h3 className="font-semibold truncate text-black">{faculty.name}</h3>
                            <p className="text-xs text-black/60 truncate">{faculty.email}</p>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="px-2 py-0.5 rounded bg-blue-100 text-xs text-black">
                                {faculty.department || 'N/A'}
                              </span>
                            </div>
                            <div className="mt-3 space-y-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-xs text-black/60">Classes:</span>
                                {faculty.classes && faculty.classes.length > 0 ? (
                                  faculty.classes.map(cls => (
                                    <span key={`${faculty.id}-${cls}`} className="px-2 py-0.5 rounded bg-gray-100 text-xs text-black">
                                      {cls}
                                    </span>
                                  ))
                                ) : (
                                  <span className="text-xs text-black/40">Not assigned</span>
                                )}
                              </div>
                              {editingFacultyId === faculty.id ? (
                                <div className="flex flex-wrap items-center gap-2">
                                  <select
                                    className="h-8 rounded border border-blue-200 bg-white px-2 text-xs text-black"
                                    value={classEdits[faculty.id] || ''}
                                    onChange={(e) => setClassEdits(prev => ({ ...prev, [faculty.id]: e.target.value }))}
                                  >
                                    <option value="">Select class</option>
                                    {departments.map(dept => (
                                      <option key={dept.code} value={dept.code}>{dept.code}</option>
                                    ))}
                                  </select>
                                  <Button size="sm" onClick={() => saveClasses(faculty.id)}>Save</Button>
                                  <Button size="sm" variant="outline" onClick={cancelEditClasses}>Cancel</Button>
                                </div>
                              ) : (
                                <Button size="sm" variant="outline" onClick={() => startEditClasses(faculty)}>
                                  Assign Class
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>
                        
                        <div className="grid grid-cols-3 gap-2 mt-4 pt-4 border-t border-blue-100">
                          <div className="text-center">
                            <p className="text-lg font-bold text-black">{faculty.total_uploads}</p>
                            <p className="text-xs text-black/60">Total</p>
                          </div>
                          <div className="text-center">
                            <p className="text-lg font-bold text-black">{faculty.qualified_uploads}</p>
                            <p className="text-xs text-black/60">Qualified</p>
                          </div>
                          <div className="text-center">
                            <p className="text-lg font-bold text-black">{faculty.not_qualified_uploads}</p>
                            <p className="text-xs text-black/60">Failed</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </main>
    </div>
  );
}
