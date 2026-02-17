import { useEffect, useMemo, useState } from 'react';
import { useLocation, useRoute } from 'wouter';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell, Legend,
} from 'recharts';

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface TodayClass {
  period: number;
  start_time: string;
  end_time: string;
  display_time: string;
  faculty_id: number;
  faculty_name: string;
  department: string;
  has_upload: boolean;
  upload_id?: number;
  upload_date?: string;
  drive_url?: string;
  is_qualified: boolean | null;
  upload_filename?: string;
  validation_message?: string;
}

interface FillerWords { [word: string]: number }

interface SpeakingGap { start: number; end: number; duration: number }

interface SpeakerSegment {
  speaker: string; start: number; end: number; duration: number; percentage: number;
}

interface TimelinePoint { minute: number; score: number }

interface EngagementAnalysis {
  meeting_id: string;
  engagement_score: number;
  combined_engagement_score: number;
  overall_sentiment: string;
  emotional_tone: string;
  turn_taking_frequency: number;
  video_file_name?: string;
  audio_file_name?: string;
  video_analysis?: { video_engagement_score?: number };
  transcript?: string;
  summary?: string;
  filler_words?: FillerWords;
  filler_word_total?: number;
  speaking_gaps?: SpeakingGap[];
  total_gaps?: number;
  total_gap_duration?: number;
  speaker_count?: number;
  speaker_segments?: SpeakerSegment[];
  speaking_rate_wpm?: number;
  total_words?: number;
  clarity_score?: number;
  confidence_score?: number;
  engagement_timeline?: TimelinePoint[];
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const COLORS = ['#1d4ed8', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#ec4899'];

function getAdminToken(): string | null {
  const s = localStorage.getItem('adminAuth');
  if (!s) return null;
  try { return JSON.parse(s)?.token || null; } catch { return null; }
}

function drivePreviewUrl(url?: string): string | null {
  if (!url) return null;
  const m = url.match(/\/file\/d\/([^/]+)/);
  if (m?.[1]) return `https://drive.google.com/file/d/${m[1]}/preview`;
  const q = url.match(/[?&]id=([^&]+)/);
  if (q?.[1]) return `https://drive.google.com/file/d/${q[1]}/preview`;
  return null;
}

function fmtSec(s: number) {
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
}

function scoreColor(v: number) {
  if (v >= 75) return 'text-green-600';
  if (v >= 50) return 'text-yellow-600';
  return 'text-red-600';
}

function scoreBg(v: number) {
  if (v >= 75) return 'bg-green-50 border-green-200';
  if (v >= 50) return 'bg-yellow-50 border-yellow-200';
  return 'bg-red-50 border-red-200';
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function ManageClassDetail() {
  const [, setLocation] = useLocation();
  const [match, params] = useRoute('/manage/class/:date/:facultyId/:period');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [classItem, setClassItem] = useState<TodayClass | null>(null);
  const [engagement, setEngagement] = useState<EngagementAnalysis | null>(null);
  const [engError, setEngError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'transcript' | 'speech' | 'speakers'>('overview');

  const selectedDate = params?.date || '';
  const facultyId = Number(params?.facultyId || 0);
  const period = Number(params?.period || 0);

  const displayDate = useMemo(() => {
    if (!selectedDate) return '';
    return new Date(`${selectedDate}T00:00:00`).toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    });
  }, [selectedDate]);

  /* ---------- data fetching ---------- */

  useEffect(() => {
    if (!match) { setError('Invalid route'); setLoading(false); return; }
    fetchAll();
  }, [match, selectedDate, facultyId, period]);

  const autoLogin = async (): Promise<string> => {
    const r = await fetch(`${API}/api/admin/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'mail-admin@gmail.com', password: 'admin123' }),
    });
    if (!r.ok) throw new Error('Admin auth failed');
    return (await r.json()).access_token as string;
  };

  const fetchAll = async () => {
    setLoading(true); setError(null); setEngagement(null); setEngError(null);
    try {
      let token = getAdminToken();
      if (!token) token = await autoLogin();

      const res = await fetch(`${API}/api/admin/today-classes?date=${selectedDate}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to fetch class data');
      const data = await res.json();
      const found = (data.classes || []).find(
        (c: TodayClass) => c.faculty_id === facultyId && c.period === period,
      );
      if (!found) throw new Error('Class not found for selected faculty / period');
      setClassItem(found);

      if (found.has_upload && found.upload_filename) {
        await fetchEngagement(found.upload_filename);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally { setLoading(false); }
  };

  const fetchEngagement = async (filename: string) => {
    try {
      const r = await fetch(`${API}/api/engagement/all-analyses?page=1&page_size=500`);
      if (!r.ok) throw new Error('Engagement API unavailable');
      const payload = await r.json();
      const list: EngagementAnalysis[] = payload?.data || [];
      const m = list.find(a => a.video_file_name === filename || a.audio_file_name === filename);
      if (!m) { setEngError('No engagement analysis found for this video yet.'); return; }
      setEngagement(m);
    } catch (e) { setEngError(e instanceof Error ? e.message : 'Engagement fetch failed'); }
  };

  /* ---------- derived data ---------- */

  const fillerChartData = useMemo(() => {
    if (!engagement?.filler_words) return [];
    return Object.entries(engagement.filler_words)
      .filter(([, v]) => v > 0)
      .sort(([, a], [, b]) => b - a)
      .map(([word, count]) => ({ word, count }));
  }, [engagement]);

  const gapChartData = useMemo(() => {
    if (!engagement?.speaking_gaps?.length) return [];
    return engagement.speaking_gaps.map((g, i) => ({
      label: `Gap ${i + 1}`,
      duration: g.duration,
      startAt: fmtSec(g.start),
    }));
  }, [engagement]);

  const speakerPieData = useMemo(() => {
    if (!engagement?.speaker_segments?.length) return [];
    return engagement.speaker_segments.map(s => ({
      name: s.speaker,
      value: Math.round(s.percentage * 10) / 10,
    }));
  }, [engagement]);

  const timelineData = useMemo(() => engagement?.engagement_timeline || [], [engagement]);

  /* ---------- render helpers ---------- */

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-blue-700 font-medium">Loading class details…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      {/* -------- Header -------- */}
      <header className="sticky top-0 z-10 bg-blue-700 shadow-lg">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-white">Class Upload Details</h1>
            <p className="text-xs text-white/80">{displayDate}</p>
          </div>
          <Button variant="outline" size="sm"
            className="border-white text-white hover:bg-white hover:text-blue-700"
            onClick={() => setLocation('/manage')}>
            ← Back to Manage
          </Button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {error && <Alert className="border-red-200 bg-red-50"><AlertDescription>{error}</AlertDescription></Alert>}

        {classItem && (
          <>
            {/* -------- Faculty + Period cards -------- */}
            <div className="grid gap-4 md:grid-cols-2">
              <Card className="border-blue-200">
                <CardHeader className="pb-2"><CardTitle className="text-sm text-blue-700">Faculty Details</CardTitle></CardHeader>
                <CardContent className="space-y-1 text-sm">
                  <p><span className="font-medium">Name:</span> {classItem.faculty_name}</p>
                  <p><span className="font-medium">Faculty ID:</span> {classItem.faculty_id}</p>
                  <p><span className="font-medium">Department:</span> {classItem.department}</p>
                </CardContent>
              </Card>
              <Card className="border-blue-200">
                <CardHeader className="pb-2"><CardTitle className="text-sm text-blue-700">Period Details</CardTitle></CardHeader>
                <CardContent className="space-y-1 text-sm">
                  <p><span className="font-medium">Period:</span> {classItem.period}</p>
                  <p><span className="font-medium">Time:</span> {classItem.display_time}</p>
                  <p><span className="font-medium">Date:</span> {displayDate}</p>
                  <p><span className="font-medium">Status:</span>{' '}
                    {classItem.has_upload
                      ? (classItem.is_qualified
                        ? <span className="text-green-600 font-semibold">Qualified ✓</span>
                        : <span className="text-yellow-600 font-semibold">Not Qualified</span>)
                      : <span className="text-gray-500">No Upload</span>}
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* -------- Video Preview -------- */}
            <Card className="border-blue-200">
              <CardHeader className="pb-2"><CardTitle className="text-sm text-blue-700">Uploaded Video</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap gap-4 text-sm">
                  <p><span className="font-medium">File:</span> {classItem.upload_filename || 'N/A'}</p>
                  <p><span className="font-medium">Uploaded:</span> {classItem.upload_date ? new Date(classItem.upload_date).toLocaleString() : 'N/A'}</p>
                  {classItem.validation_message && (
                    <p><span className="font-medium">Validation:</span> {classItem.validation_message}</p>
                  )}
                </div>

                {classItem.drive_url && drivePreviewUrl(classItem.drive_url) && (
                  <div className="rounded-lg overflow-hidden border border-blue-200 bg-black">
                    <iframe
                      title="Video preview"
                      src={drivePreviewUrl(classItem.drive_url) as string}
                      className="w-full aspect-video"
                      allow="autoplay; encrypted-media"
                      allowFullScreen
                    />
                  </div>
                )}
                {classItem.drive_url && (
                  <a href={classItem.drive_url} target="_blank" rel="noopener noreferrer"
                    className="inline-block text-blue-700 hover:underline text-sm font-medium">
                    Open in Google Drive ↗
                  </a>
                )}
              </CardContent>
            </Card>

            {/* -------- Engagement Section -------- */}
            {!classItem.has_upload && (
              <Card className="border-gray-200">
                <CardContent className="py-8 text-center text-gray-500">No video uploaded for this period.</CardContent>
              </Card>
            )}

            {engError && (
              <Alert className="border-yellow-200 bg-yellow-50"><AlertDescription>{engError}</AlertDescription></Alert>
            )}

            {engagement && (
              <>
                {/* ===== Summary Card ===== */}
                <Card className="border-blue-200">
                  <CardHeader className="pb-2"><CardTitle className="text-sm text-blue-700">Video Summary / Caption</CardTitle></CardHeader>
                  <CardContent className="text-sm leading-relaxed">
                    <p className="text-gray-800">{engagement.summary || 'No summary available.'}</p>
                  </CardContent>
                </Card>

                {/* ===== Score Overview Grid ===== */}
                <div className="grid gap-3 grid-cols-2 md:grid-cols-4 lg:grid-cols-6">
                  {[
                    { label: 'Combined Engagement', value: engagement.combined_engagement_score },
                    { label: 'Audio Engagement', value: engagement.engagement_score },
                    { label: 'Video Engagement', value: engagement.video_analysis?.video_engagement_score ?? 0 },
                    { label: 'Clarity', value: engagement.clarity_score ?? 0 },
                    { label: 'Confidence', value: engagement.confidence_score ?? 0 },
                    { label: 'Speaking Rate', value: engagement.speaking_rate_wpm ?? 0, suffix: ' wpm', raw: true },
                  ].map((m) => (
                    <div key={m.label} className={`p-3 rounded-lg border text-center ${m.raw ? 'bg-blue-50 border-blue-200' : scoreBg(m.value)}`}>
                      <p className="text-[11px] text-gray-500 mb-1">{m.label}</p>
                      <p className={`text-2xl font-bold ${m.raw ? 'text-blue-700' : scoreColor(m.value)}`}>
                        {m.value}{m.suffix || ''}
                      </p>
                    </div>
                  ))}
                </div>

                {/* ===== Info badges ===== */}
                <div className="flex flex-wrap gap-3 text-sm">
                  <span className="px-3 py-1 rounded-full bg-blue-100 text-blue-800 font-medium">
                    Sentiment: {engagement.overall_sentiment}
                  </span>
                  <span className="px-3 py-1 rounded-full bg-purple-100 text-purple-800 font-medium">
                    Tone: {engagement.emotional_tone}
                  </span>
                  <span className="px-3 py-1 rounded-full bg-teal-100 text-teal-800 font-medium">
                    Speakers: {engagement.speaker_count ?? 1}
                  </span>
                  <span className="px-3 py-1 rounded-full bg-amber-100 text-amber-800 font-medium">
                    Total Words: {engagement.total_words ?? 0}
                  </span>
                  <span className="px-3 py-1 rounded-full bg-rose-100 text-rose-800 font-medium">
                    Filler Words: {engagement.filler_word_total ?? 0}
                  </span>
                  <span className="px-3 py-1 rounded-full bg-gray-100 text-gray-800 font-medium">
                    Speaking Gaps: {engagement.total_gaps ?? 0} ({fmtSec(engagement.total_gap_duration ?? 0)})
                  </span>
                </div>

                {/* ===== Tab navigation ===== */}
                <div className="flex gap-1 bg-white rounded-lg border border-blue-200 p-1">
                  {(['overview', 'transcript', 'speech', 'speakers'] as const).map(tab => (
                    <button key={tab} onClick={() => setActiveTab(tab)}
                      className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors ${
                        activeTab === tab ? 'bg-blue-700 text-white' : 'text-gray-600 hover:bg-blue-50'
                      }`}>
                      {tab === 'overview' ? '📊 Overview' : tab === 'transcript' ? '📝 Transcript' : tab === 'speech' ? '🎤 Speech Analysis' : '👥 Speakers'}
                    </button>
                  ))}
                </div>

                {/* ===== TAB: Overview — Engagement Timeline ===== */}
                {activeTab === 'overview' && (
                  <div className="space-y-6">
                    {timelineData.length > 0 && (
                      <Card className="border-blue-200">
                        <CardHeader className="pb-2"><CardTitle className="text-sm text-blue-700">Engagement Over Time (per minute)</CardTitle></CardHeader>
                        <CardContent>
                          <ResponsiveContainer width="100%" height={300}>
                            <LineChart data={timelineData} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                              <XAxis dataKey="minute" tick={{ fontSize: 12 }} label={{ value: 'Minute', position: 'insideBottom', offset: -2, fontSize: 12 }} />
                              <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} label={{ value: 'Score', angle: -90, position: 'insideLeft', fontSize: 12 }} />
                              <Tooltip contentStyle={{ fontSize: 13 }} />
                              <Line type="monotone" dataKey="score" stroke="#1d4ed8" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} name="Engagement" />
                            </LineChart>
                          </ResponsiveContainer>
                        </CardContent>
                      </Card>
                    )}

                    {/* Score comparison bar chart */}
                    <Card className="border-blue-200">
                      <CardHeader className="pb-2"><CardTitle className="text-sm text-blue-700">Score Breakdown</CardTitle></CardHeader>
                      <CardContent>
                        <ResponsiveContainer width="100%" height={260}>
                          <BarChart data={[
                            { name: 'Audio\nEngagement', score: engagement.engagement_score },
                            { name: 'Video\nEngagement', score: engagement.video_analysis?.video_engagement_score ?? 0 },
                            { name: 'Combined', score: engagement.combined_engagement_score },
                            { name: 'Clarity', score: engagement.clarity_score ?? 0 },
                            { name: 'Confidence', score: engagement.confidence_score ?? 0 },
                          ]} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                            <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} />
                            <Tooltip contentStyle={{ fontSize: 13 }} />
                            <Bar dataKey="score" fill="#1d4ed8" radius={[4, 4, 0, 0]} name="Score">
                              {[0, 1, 2, 3, 4].map(i => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </CardContent>
                    </Card>
                  </div>
                )}

                {/* ===== TAB: Transcript ===== */}
                {activeTab === 'transcript' && (
                  <Card className="border-blue-200">
                    <CardHeader className="pb-2"><CardTitle className="text-sm text-blue-700">Full Transcript</CardTitle></CardHeader>
                    <CardContent>
                      <div className="bg-gray-50 rounded-lg p-4 max-h-[500px] overflow-y-auto text-sm leading-relaxed whitespace-pre-wrap font-mono">
                        {engagement.transcript || 'Transcript not available.'}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* ===== TAB: Speech Analysis (Filler Words + Gaps) ===== */}
                {activeTab === 'speech' && (
                  <div className="space-y-6">
                    {/* Filler Words */}
                    <Card className="border-blue-200">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm text-blue-700">
                          Filler Words Detected ({engagement.filler_word_total ?? 0} total)
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        {fillerChartData.length > 0 ? (
                          <div className="grid md:grid-cols-2 gap-6">
                            <ResponsiveContainer width="100%" height={280}>
                              <BarChart data={fillerChartData} layout="vertical" margin={{ top: 5, right: 20, left: 60, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                                <XAxis type="number" tick={{ fontSize: 12 }} />
                                <YAxis dataKey="word" type="category" tick={{ fontSize: 13 }} width={55} />
                                <Tooltip contentStyle={{ fontSize: 13 }} />
                                <Bar dataKey="count" fill="#f59e0b" radius={[0, 4, 4, 0]} name="Count">
                                  {fillerChartData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                                </Bar>
                              </BarChart>
                            </ResponsiveContainer>
                            <div className="space-y-2">
                              <h4 className="font-medium text-sm text-gray-700">Word Breakdown</h4>
                              <div className="grid grid-cols-2 gap-2">
                                {fillerChartData.map(f => (
                                  <div key={f.word} className="flex items-center justify-between bg-amber-50 rounded px-3 py-2 border border-amber-200">
                                    <span className="font-mono text-sm">"{f.word}"</span>
                                    <span className="font-bold text-amber-700">{f.count}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        ) : (
                          <p className="text-gray-500 text-sm">No filler words detected.</p>
                        )}
                      </CardContent>
                    </Card>

                    {/* Speaking Gaps */}
                    <Card className="border-blue-200">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm text-blue-700">
                          Speaking Gaps / Silences ({engagement.total_gaps ?? 0} gaps, {fmtSec(engagement.total_gap_duration ?? 0)} total)
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        {gapChartData.length > 0 ? (
                          <div className="grid md:grid-cols-2 gap-6">
                            <ResponsiveContainer width="100%" height={280}>
                              <BarChart data={gapChartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                                <YAxis tick={{ fontSize: 12 }} label={{ value: 'Seconds', angle: -90, position: 'insideLeft', fontSize: 12 }} />
                                <Tooltip contentStyle={{ fontSize: 13 }} formatter={(v: number | undefined) => [`${v ?? 0}s`, 'Duration']} />
                                <Bar dataKey="duration" fill="#ef4444" radius={[4, 4, 0, 0]} name="Duration (s)" />
                              </BarChart>
                            </ResponsiveContainer>
                            <div className="space-y-2 max-h-[280px] overflow-y-auto">
                              <h4 className="font-medium text-sm text-gray-700">Gap Details</h4>
                              <table className="w-full text-sm">
                                <thead>
                                  <tr className="text-left text-gray-500 border-b">
                                    <th className="py-1 pr-2">#</th>
                                    <th className="py-1 pr-2">Start</th>
                                    <th className="py-1 pr-2">End</th>
                                    <th className="py-1">Duration</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {(engagement.speaking_gaps || []).map((g, i) => (
                                    <tr key={i} className="border-b border-gray-100">
                                      <td className="py-1 pr-2 font-medium">{i + 1}</td>
                                      <td className="py-1 pr-2">{fmtSec(g.start)}</td>
                                      <td className="py-1 pr-2">{fmtSec(g.end)}</td>
                                      <td className="py-1 font-mono text-red-600">{g.duration}s</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        ) : (
                          <p className="text-gray-500 text-sm">No significant speaking gaps detected.</p>
                        )}
                      </CardContent>
                    </Card>
                  </div>
                )}

                {/* ===== TAB: Speakers ===== */}
                {activeTab === 'speakers' && (
                  <div className="space-y-6">
                    <Card className="border-blue-200">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm text-blue-700">
                          Speaker Distribution ({engagement.speaker_count ?? 1} speaker{(engagement.speaker_count ?? 1) > 1 ? 's' : ''})
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        {speakerPieData.length > 0 ? (
                          <div className="grid md:grid-cols-2 gap-6 items-center">
                            <ResponsiveContainer width="100%" height={300}>
                              <PieChart>
                                <Pie data={speakerPieData} dataKey="value" nameKey="name"
                                  cx="50%" cy="50%" outerRadius={110} innerRadius={50}
                                  label={({ name, value }) => `${value}%`}
                                  labelLine={true}>
                                  {speakerPieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                                </Pie>
                                <Tooltip formatter={(v: number | undefined) => [`${v ?? 0}%`, 'Share']} contentStyle={{ fontSize: 13 }} />
                                <Legend wrapperStyle={{ fontSize: 13 }} />
                              </PieChart>
                            </ResponsiveContainer>
                            <div className="space-y-3">
                              <h4 className="font-medium text-sm text-gray-700">Speaker Segments</h4>
                              {(engagement.speaker_segments || []).map((seg, i) => (
                                <div key={i} className="bg-gray-50 rounded-lg p-3 border border-gray-200 flex items-center gap-3">
                                  <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                                  <div className="flex-1 min-w-0">
                                    <p className="font-medium text-sm truncate">{seg.speaker}</p>
                                    <p className="text-xs text-gray-500">
                                      {fmtSec(seg.start)} – {fmtSec(seg.end)} · {fmtSec(seg.duration)}
                                    </p>
                                  </div>
                                  <span className="font-bold text-sm" style={{ color: COLORS[i % COLORS.length] }}>
                                    {seg.percentage}%
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <p className="text-gray-500 text-sm">Speaker data not available.</p>
                        )}
                      </CardContent>
                    </Card>

                    {/* Turn-taking */}
                    <Card className="border-blue-200">
                      <CardHeader className="pb-2"><CardTitle className="text-sm text-blue-700">Speaking Metrics</CardTitle></CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                          <div className="bg-blue-50 rounded-lg p-3 border border-blue-200 text-center">
                            <p className="text-[11px] text-gray-500">Turn-Taking Freq.</p>
                            <p className="text-xl font-bold text-blue-700">{engagement.turn_taking_frequency}</p>
                          </div>
                          <div className="bg-blue-50 rounded-lg p-3 border border-blue-200 text-center">
                            <p className="text-[11px] text-gray-500">Speaking Rate</p>
                            <p className="text-xl font-bold text-blue-700">{engagement.speaking_rate_wpm} <span className="text-xs font-normal">wpm</span></p>
                          </div>
                          <div className="bg-blue-50 rounded-lg p-3 border border-blue-200 text-center">
                            <p className="text-[11px] text-gray-500">Total Words</p>
                            <p className="text-xl font-bold text-blue-700">{engagement.total_words}</p>
                          </div>
                          <div className="bg-blue-50 rounded-lg p-3 border border-blue-200 text-center">
                            <p className="text-[11px] text-gray-500">Filler Ratio</p>
                            <p className="text-xl font-bold text-amber-600">
                              {engagement.total_words ? ((engagement.filler_word_total ?? 0) / engagement.total_words * 100).toFixed(1) : 0}%
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}
