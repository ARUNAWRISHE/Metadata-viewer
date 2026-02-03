import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Loader2,
  Shield,
  Users,
  FileVideo,
  CheckCircle,
  XCircle,
  TrendingUp,
  Search,
  Download,
  Clock,
  RefreshCw,
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
  total_uploads: number;
  qualified_uploads: number;
  not_qualified_uploads: number;
}

interface Department {
  id: number;
  name: string;
  code: string;
}

export default function ManagePage() {
  const [activeTab, setActiveTab] = useState<'overview' | 'uploads' | 'faculties'>('overview');
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [faculties, setFaculties] = useState<Faculty[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adminToken, setAdminToken] = useState<string | null>(null);
  
  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [departmentFilter, setDepartmentFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    autoLogin();
  }, []);

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
        fetchData(data.access_token);
      } else {
        throw new Error('Auto-login failed');
      }
    } catch (err) {
      setError('Failed to authenticate');
      setLoading(false);
    }
  };

  useEffect(() => {
    if (adminToken && activeTab === 'uploads') {
      fetchUploads();
    }
  }, [statusFilter, departmentFilter, adminToken]);

  const getAuthHeaders = () => {
    return adminToken ? { 'Authorization': `Bearer ${adminToken}` } : {};
  };

  const fetchData = async (token?: string) => {
    const authToken = token || adminToken;
    if (!authToken) return;
    
    setLoading(true);
    setError(null);
    try {
      const headers = { 'Authorization': `Bearer ${authToken}` };
      const [statsRes, uploadsRes, facultiesRes, deptsRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/admin/dashboard`, { headers }),
        fetch(`${API_BASE_URL}/api/admin/uploads`, { headers }),
        fetch(`${API_BASE_URL}/api/admin/faculties`, { headers }),
        fetch(`${API_BASE_URL}/api/admin/departments`)
      ]);

      if (!statsRes.ok || !uploadsRes.ok || !facultiesRes.ok) {
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
    if (!adminToken) return;
    
    try {
      let url = `${API_BASE_URL}/api/admin/uploads?`;
      if (statusFilter !== 'all') {
        url += `status_filter=${statusFilter}&`;
      }
      if (departmentFilter !== 'all') {
        url += `department=${departmentFilter}&`;
      }
      
      const response = await fetch(url, { headers: getAuthHeaders() });
      if (response.ok) {
        const data = await response.json();
        setUploads(data);
      }
    } catch (err) {
      console.error('Failed to fetch uploads:', err);
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
      <header className="border-b border-border bg-card sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
              <Shield className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold">
                <span className="text-primary">Meta</span>View Management
              </h1>
              <p className="text-xs text-muted-foreground">Dashboard</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={() => fetchData()}>
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh
            </Button>
          </div>
        </div>
      </header>

      {/* Tab Navigation */}
      <div className="border-b border-border bg-card/50">
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
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
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
              <Card className="bg-gradient-to-br from-blue-500/10 to-blue-600/5 border-blue-500/20">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Total Uploads</p>
                      <p className="text-3xl font-bold">{stats.total_uploads}</p>
                    </div>
                    <div className="w-12 h-12 rounded-full bg-blue-500/20 flex items-center justify-center">
                      <FileVideo className="w-6 h-6 text-blue-500" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-gradient-to-br from-green-500/10 to-green-600/5 border-green-500/20">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Qualified</p>
                      <p className="text-3xl font-bold text-green-500">{stats.qualified_uploads}</p>
                    </div>
                    <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center">
                      <CheckCircle className="w-6 h-6 text-green-500" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-gradient-to-br from-red-500/10 to-red-600/5 border-red-500/20">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Not Qualified</p>
                      <p className="text-3xl font-bold text-red-500">{stats.not_qualified_uploads}</p>
                    </div>
                    <div className="w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center">
                      <XCircle className="w-6 h-6 text-red-500" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-gradient-to-br from-purple-500/10 to-purple-600/5 border-purple-500/20">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Qualification Rate</p>
                      <p className="text-3xl font-bold text-purple-500">{stats.qualification_rate}%</p>
                    </div>
                    <div className="w-12 h-12 rounded-full bg-purple-500/20 flex items-center justify-center">
                      <TrendingUp className="w-6 h-6 text-purple-500" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Faculty Stats */}
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="w-5 h-5 text-primary" />
                    Faculty Overview
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center p-3 bg-muted/30 rounded-lg">
                      <span className="text-sm text-muted-foreground">Total Faculties</span>
                      <span className="text-xl font-bold">{stats.total_faculties}</span>
                    </div>
                    <div className="flex justify-between items-center p-3 bg-muted/30 rounded-lg">
                      <span className="text-sm text-muted-foreground">Active (uploaded videos)</span>
                      <span className="text-xl font-bold text-green-500">{stats.active_faculties}</span>
                    </div>
                    <div className="flex justify-between items-center p-3 bg-muted/30 rounded-lg">
                      <span className="text-sm text-muted-foreground">Inactive</span>
                      <span className="text-xl font-bold text-muted-foreground">
                        {stats.total_faculties - stats.active_faculties}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Clock className="w-5 h-5 text-primary" />
                    Recent Activity
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {uploads.length === 0 ? (
                    <p className="text-center py-8 text-muted-foreground">No uploads yet</p>
                  ) : (
                    <div className="space-y-3">
                      {uploads.slice(0, 5).map(upload => (
                        <div key={upload.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/30">
                          {upload.is_qualified ? (
                            <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
                          ) : (
                            <XCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{upload.faculty_name}</p>
                            <p className="text-xs text-muted-foreground truncate">{upload.filename}</p>
                          </div>
                          <span className="text-xs text-muted-foreground whitespace-nowrap">
                            {formatDate(upload.upload_date).split(',')[0]}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {/* Uploads Tab */}
        {activeTab === 'uploads' && (
          <div className="space-y-4">
            {/* Filters */}
            <Card>
              <CardContent className="pt-6">
                <div className="flex flex-col sm:flex-row gap-4">
                  <div className="flex-1">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        placeholder="Search by faculty, filename, or department..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-10"
                      />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <select
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value)}
                      className="px-3 py-2 rounded-md border border-input bg-background text-sm"
                    >
                      <option value="all">All Status</option>
                      <option value="qualified">Qualified</option>
                      <option value="not_qualified">Not Qualified</option>
                    </select>
                    <select
                      value={departmentFilter}
                      onChange={(e) => setDepartmentFilter(e.target.value)}
                      className="px-3 py-2 rounded-md border border-input bg-background text-sm"
                    >
                      <option value="all">All Departments</option>
                      {departments.map(dept => (
                        <option key={dept.id} value={dept.code}>{dept.code}</option>
                      ))}
                    </select>
                    <Button variant="outline" size="sm" onClick={exportToCSV}>
                      <Download className="w-4 h-4 mr-2" />
                      Export
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Uploads Table */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <FileVideo className="w-5 h-5 text-primary" />
                    Video Uploads
                  </span>
                  <span className="text-sm font-normal text-muted-foreground">
                    {filteredUploads.length} records
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {filteredUploads.length === 0 ? (
                  <div className="text-center py-12">
                    <FileVideo className="w-12 h-12 mx-auto mb-4 text-muted-foreground/50" />
                    <p className="text-muted-foreground">No uploads found</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="text-left py-3 px-2 text-xs font-medium text-muted-foreground">STATUS</th>
                          <th className="text-left py-3 px-2 text-xs font-medium text-muted-foreground">FACULTY</th>
                          <th className="text-left py-3 px-2 text-xs font-medium text-muted-foreground hidden md:table-cell">DEPT</th>
                          <th className="text-left py-3 px-2 text-xs font-medium text-muted-foreground">FILENAME</th>
                          <th className="text-left py-3 px-2 text-xs font-medium text-muted-foreground hidden lg:table-cell">DURATION</th>
                          <th className="text-left py-3 px-2 text-xs font-medium text-muted-foreground hidden lg:table-cell">PERIOD</th>
                          <th className="text-left py-3 px-2 text-xs font-medium text-muted-foreground">DATE</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredUploads.map(upload => (
                          <tr key={upload.id} className="border-b border-border/50 hover:bg-muted/30">
                            <td className="py-3 px-2">
                              {upload.is_qualified ? (
                                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-green-500/20 text-green-400">
                                  <CheckCircle className="w-3 h-3" />
                                  <span className="hidden sm:inline">Qualified</span>
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-red-500/20 text-red-400">
                                  <XCircle className="w-3 h-3" />
                                  <span className="hidden sm:inline">Failed</span>
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-2">
                              <div>
                                <p className="font-medium text-sm">{upload.faculty_name}</p>
                                <p className="text-xs text-muted-foreground">{upload.faculty_email}</p>
                              </div>
                            </td>
                            <td className="py-3 px-2 hidden md:table-cell">
                              <span className="px-2 py-1 rounded bg-muted text-xs">{upload.department || 'N/A'}</span>
                            </td>
                            <td className="py-3 px-2">
                              <p className="text-sm truncate max-w-[200px]" title={upload.filename}>
                                {upload.filename}
                              </p>
                              <p className="text-xs text-muted-foreground">{upload.resolution || 'N/A'}</p>
                            </td>
                            <td className="py-3 px-2 text-sm hidden lg:table-cell">
                              {formatDuration(upload.duration_seconds)}
                            </td>
                            <td className="py-3 px-2 text-sm hidden lg:table-cell">
                              {upload.matched_period ? (
                                <span className="px-2 py-1 rounded bg-primary/20 text-primary text-xs">
                                  Period {upload.matched_period}
                                </span>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </td>
                            <td className="py-3 px-2 text-xs text-muted-foreground whitespace-nowrap">
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
                <CardTitle className="flex items-center gap-2">
                  <Users className="w-5 h-5 text-primary" />
                  Faculty Members
                </CardTitle>
                <CardDescription>
                  Overview of all faculty members and their upload statistics
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {faculties.map(faculty => (
                    <Card key={faculty.id} className="bg-muted/20">
                      <CardContent className="pt-6">
                        <div className="flex items-start gap-4">
                          <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                            <span className="text-lg font-bold text-primary">
                              {faculty.name.charAt(0)}
                            </span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <h3 className="font-semibold truncate">{faculty.name}</h3>
                            <p className="text-xs text-muted-foreground truncate">{faculty.email}</p>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="px-2 py-0.5 rounded bg-muted text-xs">
                                {faculty.department || 'N/A'}
                              </span>
                            </div>
                          </div>
                        </div>
                        
                        <div className="grid grid-cols-3 gap-2 mt-4 pt-4 border-t border-border">
                          <div className="text-center">
                            <p className="text-lg font-bold">{faculty.total_uploads}</p>
                            <p className="text-xs text-muted-foreground">Total</p>
                          </div>
                          <div className="text-center">
                            <p className="text-lg font-bold text-green-500">{faculty.qualified_uploads}</p>
                            <p className="text-xs text-muted-foreground">Qualified</p>
                          </div>
                          <div className="text-center">
                            <p className="text-lg font-bold text-red-500">{faculty.not_qualified_uploads}</p>
                            <p className="text-xs text-muted-foreground">Failed</p>
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