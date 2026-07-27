import React, { useState, useMemo, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query'; 
import { Bell, Check, Mail, UserPlus } from 'lucide-react'; 
import toast, { Toaster } from 'react-hot-toast'; 

import Sidebar from './components/Sidebar';
import TopNav from './components/TopNav';
import CandidateCard from './components/CandidateCard';
import CandidateModal from './components/CandidateModal'; 
import DashboardPage from './pages/DashboardPage';
import JobPage from './pages/JobPage'; 
import SettingsPage from './pages/SettingsPage'; 
import ActivityPage from './pages/ActivityPage';
import UserProfile from './pages/UserProfile'; 
import CreateJobModal from './components/CreateJobModal';
import CandidateDataGrid from './components/CandidateDataGrid';
import BulkActionBar from './components/BulkActionBar'; 

import { supabase } from './supabaseClient'; 

import { AuthProvider, useAuth } from './context/AuthContext';
import LoginPage from './pages/LoginPage';
import Onboarding from './pages/Onboarding'; 
import { useActivityLogger } from './hooks/useActivityLogger'; 

// --- TYPE DEFINITIONS ---
export interface Education {
  degree?: string;
  institution?: string;
  year?: string;
  score?: string;
}

export interface Experience {
  job_title?: string;
  company?: string;
  duration?: string;
  date?: string;
  description?: string;
  duration_months?: number;
}

export interface SocialLink {
  platform: string;
  url: string;
}

export interface Candidate {
  _id?: string;
  id?: string;
  name?: string;
  email?: string;
  phone?: string;
  location?: string;
  summary?: string;
  resume_url?: string;
  technical_skills?: string[];
  soft_skills?: string[];
  languages?: string[];
  interests?: string[];
  projects?: string[];
  education?: Education[];
  work_experience?: Experience[];
  match_score?: number; 
  job_match_score?: number; 
  total_experience_years?: number;
  social_links?: SocialLink[];
  segmentation?: any;
  intelligence_layer?: any;
  job_applications?: any[]; 
  created_at?: string;
  has_unread_reply?: boolean; 
  status?: string; 
}

export interface AppNotification {
  id: string;
  candidate_id: string;
  type: string;
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
}

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000/api/search";

function MainApp() {
  const queryClient = useQueryClient();
  
  // GRAB USER PROFILE
  const { session, signOut, userProfile } = useAuth();
  
  // INITIALIZE LOGGER
  const { logActivity } = useActivityLogger();

  // DEFINE ACCESS RULES
  const userRole = userProfile?.role || 'Interviewer';
  const canManagePipeline = ['Admin', 'Lead HR', 'Hiring Manager', 'Recruiter'].includes(userRole);

  // --- NAVIGATION STATE ---
  const [activePage, setActivePage] = useState<string>("applicants"); 
  const [viewMode, setViewMode] = useState<'cards' | 'grid'>('grid'); 

  // --- SEARCH & UI STATES ---
  const [query, setQuery] = useState<string>(""); 
  const [submittedQuery, setSubmittedQuery] = useState<string>(""); 
  const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedRows, setSelectedRows] = useState<Candidate[]>([]);

  // --- TOP NAV STATES ---
  const [searchMode, setSearchMode] = useState<'semantic' | 'keyword'>('semantic');
  const [sortOption, setSortOption] = useState<string>('match');

  // --- FILTER STATES ---
  const [selectedDept, setSelectedDept] = useState<string>("All");
  const [minExperience, setMinExperience] = useState<number>(0);
  const [statusTab, setStatusTab] = useState<string>("Active"); 

  // --- GLOBAL NOTIFICATIONS STATE ---
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const unreadCount = notifications.filter(n => !n.is_read).length;

  const handleLogout = async () => {
    localStorage.removeItem('talentvault_dashboard_candidates');
    localStorage.removeItem('talentvault_dashboard_job_count');
    localStorage.removeItem('talentvault_jobs_cache');
    localStorage.removeItem('talentvault_activeJobId');
    localStorage.removeItem('talentvault_viewMode');

    await signOut();
  };

  // 🚀 RESTORED: INSTANT OPTIMISTIC BULK ADVANCE
  const handleBulkAdvance = async () => {
    if (selectedRows.length === 0) return;

    const targetCandidates = selectedRows.filter(c => c.status !== 'Advanced');
    if (targetCandidates.length === 0) {
      toast.error("Selected candidates are already in the Advanced stage.");
      return;
    }

    const candidateIds = targetCandidates.map(c => c.id || c._id);
    // Snapshot current state for rollback
    const previousCandidatesState = queryClient.getQueryData(['candidates', submittedQuery, searchMode]);

    // 1. INSTANT UI UPDATE
    queryClient.setQueryData(['candidates', submittedQuery, searchMode], (oldData: any) => {
      if (!oldData) return [];
      const results = oldData.results || oldData;
      const updatedResults = results.map((c: any) => {
        const id = c.id || c._id;
        if (candidateIds.includes(id)) {
          return { ...c, status: 'Advanced' };
        }
        return c;
      });
      return Array.isArray(oldData) ? updatedResults : { ...oldData, results: updatedResults };
    });

    setSelectedRows([]);
    toast.success(`Advanced ${targetCandidates.length} candidate(s) to the next round!`);

    // 2. BACKGROUND DATABASE WRITE
    try {
      const { error } = await supabase
        .from('candidates')
        .update({ status: 'Advanced' }) 
        .in('id', candidateIds);

      if (error) throw error;

      await logActivity('BULK_ADVANCE', 'Candidate', 'multiple', { 
        count: targetCandidates.length,
        candidate_ids: candidateIds,
        candidate_names: targetCandidates.map(c => c.name || 'Unknown'),
        to_stage: 'Advanced'
      });

    } catch (err) {
      console.error(err);
      toast.error("Database sync failed. Reverting changes.");
      // Rollback UI on error
      queryClient.setQueryData(['candidates', submittedQuery, searchMode], previousCandidatesState);
    }
  };

  // 🚀 RESTORED: INSTANT OPTIMISTIC BULK REJECT
  const handleBulkReject = async () => {
    if (selectedRows.length === 0) return;

    const targetCandidates = selectedRows.filter(c => c.status !== 'Rejected');
    if (targetCandidates.length === 0) {
      toast.error("Selected candidates are already Rejected.");
      return;
    }

    const candidateIds = targetCandidates.map(c => c.id || c._id);
    const previousCandidatesState = queryClient.getQueryData(['candidates', submittedQuery, searchMode]);

    // 1. INSTANT UI UPDATE
    queryClient.setQueryData(['candidates', submittedQuery, searchMode], (oldData: any) => {
      if (!oldData) return [];
      const results = oldData.results || oldData;
      const updatedResults = results.map((c: any) => {
        const id = c.id || c._id;
        if (candidateIds.includes(id)) {
          return { ...c, status: 'Rejected' };
        }
        return c;
      });
      return Array.isArray(oldData) ? updatedResults : { ...oldData, results: updatedResults };
    });

    setSelectedRows([]);
    toast.success(`Rejected ${targetCandidates.length} candidate(s).`);

    // 2. BACKGROUND DATABASE WRITE
    try {
      const { error } = await supabase
        .from('candidates')
        .update({ status: 'Rejected' }) 
        .in('id', candidateIds);

      if (error) throw error;

      await logActivity('BULK_REJECT', 'Candidate', 'multiple', { 
        count: targetCandidates.length,
        candidate_ids: candidateIds,
        candidate_names: targetCandidates.map(c => c.name || 'Unknown')
      });

    } catch (err) {
      console.error(err);
      toast.error("Database sync failed. Reverting changes.");
      // Rollback UI on error
      queryClient.setQueryData(['candidates', submittedQuery, searchMode], previousCandidatesState);
    }
  };

  // 🚀 RESTORED: INSTANT OPTIMISTIC BULK ARCHIVE
  const handleBulkArchive = async () => {
    if (selectedRows.length === 0) return;

    const targetCandidates = selectedRows.filter(c => c.status !== 'Archived');
    if (targetCandidates.length === 0) {
      toast.error("Selected candidates are already Archived.");
      return;
    }

    const candidateIds = targetCandidates.map(c => c.id || c._id);
    const previousCandidatesState = queryClient.getQueryData(['candidates', submittedQuery, searchMode]);

    // 1. INSTANT UI UPDATE
    queryClient.setQueryData(['candidates', submittedQuery, searchMode], (oldData: any) => {
      if (!oldData) return [];
      const results = oldData.results || oldData;
      const updatedResults = results.map((c: any) => {
        const id = c.id || c._id;
        if (candidateIds.includes(id)) {
          return { ...c, status: 'Archived' };
        }
        return c;
      });
      return Array.isArray(oldData) ? updatedResults : { ...oldData, results: updatedResults };
    });

    setSelectedRows([]);
    toast.success(`Archived ${targetCandidates.length} candidate(s).`);

    // 2. BACKGROUND DATABASE WRITE
    try {
      const { error } = await supabase
        .from('candidates')
        .update({ status: 'Archived' }) 
        .in('id', candidateIds);

      if (error) throw error;

      await logActivity('BULK_ARCHIVE', 'Candidate', 'multiple', { 
        count: targetCandidates.length,
        candidate_ids: candidateIds,
        candidate_names: targetCandidates.map(c => c.name || 'Unknown')
      });

    } catch (err) {
      console.error(err);
      toast.error("Database sync failed. Reverting changes.");
      // Rollback UI on error
      queryClient.setQueryData(['candidates', submittedQuery, searchMode], previousCandidatesState);
    }
  };

  // --- SUPABASE REALTIME LISTENERS ---
  useEffect(() => {
    const candidatesChannel = supabase
      .channel('candidates-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'candidates' },
        (payload) => {
          console.log('⚡ Realtime Candidate Update:', payload);
          queryClient.invalidateQueries({ queryKey: ['candidates'] });
        }
      )
      .subscribe();

    fetchNotifications();
    const notificationsChannel = supabase
      .channel('global-notifications')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications' },
        (payload) => {
          console.log('🔔 New Notification Received:', payload.new);
          const newNotif = payload.new as AppNotification;
          setNotifications((prev) => [newNotif, ...prev]);
          
          toast.success(newNotif.title, { 
            icon: newNotif.type === 'new_email' ? '📬' : '🔔',
            duration: 5000 
          });
        }
      )
      .subscribe();

    const inboundCommsChannel = supabase
      .channel('inbound-communications-realtime')
      .on(
        'postgres_changes',
        { 
            event: 'INSERT', 
            schema: 'public', 
            table: 'communications',
            filter: "type=eq.inbound_reply" 
        },
        (payload) => {
          console.log('📨 New Candidate Reply Received:', payload.new);
          
          toast.success(`New message received!`, { 
            icon: '💬',
            duration: 6000,
            style: { background: '#1e293b', color: '#fff' }
          });
          
          queryClient.invalidateQueries({ queryKey: ['candidates'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(candidatesChannel);
      supabase.removeChannel(notificationsChannel);
      supabase.removeChannel(inboundCommsChannel);
    };
  }, [queryClient]);

  const fetchNotifications = async () => {
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50); 
    if (data) setNotifications(data);
  };

  const handleNotificationClick = async (notif: AppNotification) => {
    if (!notif.is_read) {
      await supabase.from('notifications').update({ is_read: true }).eq('id', notif.id);
      setNotifications(prev => prev.map(n => n.id === notif.id ? { ...n, is_read: true } : n));
    }

    if (notif.candidate_id && notif.candidate_id !== 'UNASSIGNED') {
      const candidateToOpen = candidates.find((c: Candidate) => c.id === notif.candidate_id);
      if (candidateToOpen) {
        setSelectedCandidate(candidateToOpen);
      }
    }
  };

  const handleMarkAllRead = async () => {
    await supabase.from('notifications').update({ is_read: true }).eq('is_read', false);
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
  };

  const fetchCandidates = async () => {
    const token = session?.access_token;
    
    if (!token) {
        return []; 
    }

    const queryParam = submittedQuery ? encodeURIComponent(submittedQuery) : "";

    const response = await fetch(`${API_URL}?query=${queryParam}&mode=${searchMode}`, {
      headers: {
        'Authorization': `Bearer ${token}` 
      }
    });

    if (!response.ok) {
        throw new Error('Network response was not ok');
    }
    
    const data = await response.json();
    return data.results || [];
  };

  const { data: candidates = [], isLoading: loading } = useQuery({
    queryKey: ['candidates', submittedQuery, searchMode], 
    queryFn: fetchCandidates,
    refetchOnWindowFocus: false, 
    enabled: !!session?.access_token, 
  });

  const filteredCandidates = useMemo(() => {
    let result = candidates.filter((candidate: Candidate) => {
      const matchesDept = selectedDept === "All" || candidate.segmentation?.department === selectedDept;
      const exp = candidate.total_experience_years || 0;
      const matchesExp = exp >= minExperience;
      return matchesDept && matchesExp;
    });

    if (statusTab !== 'All') {
      if (statusTab === 'Active') {
        result = result.filter((c: Candidate) => c.status !== 'Rejected' && c.status !== 'Archived');
      } else {
        result = result.filter((c: Candidate) => c.status === statusTab);
      }
    }

    if (sortOption === 'match') {
      result = result.sort((a: Candidate, b: Candidate) => (b.match_score || 0) - (a.match_score || 0));
    } else if (sortOption === 'experience') {
      result = result.sort((a: Candidate, b: Candidate) => (b.total_experience_years || 0) - (a.total_experience_years || 0));
    }

    return result;
  }, [candidates, selectedDept, minExperience, sortOption, statusTab]);

  return (
    <div className="flex h-screen w-full bg-slate-50 font-sans overflow-hidden relative">
      <Toaster position="bottom-right" reverseOrder={false} />
      
      <Sidebar 
        activePage={activePage} 
        setActivePage={setActivePage} 
        onOpenCreateJob={() => setIsCreateModalOpen(true)}
        unreadCount={unreadCount} 
        onLogout={handleLogout} 
      />

      <div className="flex-1 flex flex-col h-full bg-[#f8fafc] overflow-hidden relative">
        
        {activePage === 'dashboard' && (
          <div className="flex-1 overflow-y-auto">
             <DashboardPage 
               onCandidateClick={(candidate: Candidate) => setSelectedCandidate(candidate)} 
             />
          </div>
        )}

        {activePage === 'inbox' && (
          <div className="flex-1 overflow-y-auto p-8 animate-in fade-in">
            <div className="max-w-5xl mx-auto w-full flex flex-col h-full min-h-[700px]">
              <div className="flex justify-between items-end mb-8 shrink-0">
                <div>
                  <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                    <Mail className="text-blue-600" /> Unified Inbox
                  </h2>
                  <p className="text-slate-500 mt-1 text-sm">Manage and track all candidate email threads centrally.</p>
                </div>
              </div>
              
              <div className="bg-white flex-1 rounded-xl border border-slate-200 shadow-sm flex items-center justify-center flex-col">
                <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mb-4 border border-slate-100 shadow-inner">
                  <Mail size={32} className="text-slate-300" />
                </div>
                <p className="text-slate-800 font-bold text-lg">Inbox Module is Active</p>
                <p className="text-slate-500 text-sm mt-2 max-w-sm text-center">
                  To view and reply to an email thread, open a candidate's profile from the <b>Applicants</b> or <b>Jobs</b> pipeline tabs and click on the "Communications" tab.
                </p>
              </div>
            </div>
          </div>
        )}

        {activePage === 'notifications' && (
          <div className="flex-1 overflow-y-auto p-8 animate-in fade-in">
            <div className="max-w-4xl mx-auto w-full">
              
              <div className="flex justify-between items-end mb-8">
                <div>
                  <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                    <Bell className="text-blue-600" /> System Notifications
                  </h2>
                  <p className="text-slate-500 mt-1 text-sm">Track candidate replies and ATS activity.</p>
                </div>
                {unreadCount > 0 && (
                  <button onClick={handleMarkAllRead} className="text-sm font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 px-4 py-2 rounded-lg transition-colors flex items-center gap-2">
                    <Check size={16}/> Mark all as read
                  </button>
                )}
              </div>

              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                {notifications.length === 0 ? (
                  <div className="py-20 text-center flex flex-col items-center justify-center">
                    <div className="w-16 h-16 bg-slate-50 text-slate-300 rounded-full flex items-center justify-center mb-4"><Bell size={32}/></div>
                    <p className="text-slate-500 font-bold text-lg">You're all caught up!</p>
                    <p className="text-slate-400 text-sm mt-1">No new alerts to display.</p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {notifications.map((n) => (
                      <div 
                        key={n.id} 
                        onClick={() => handleNotificationClick(n)}
                        className={`p-5 flex gap-4 items-start cursor-pointer transition-colors ${!n.is_read ? 'bg-blue-50/40 hover:bg-blue-50/70' : 'hover:bg-slate-50'}`}
                      >
                        <div className={`p-2.5 rounded-xl shrink-0 ${n.type === 'new_email' || n.type === 'inbound_reply' ? 'bg-blue-100 text-blue-600' : 'bg-emerald-100 text-emerald-600'}`}>
                          {n.type === 'new_email' || n.type === 'inbound_reply' ? <Mail size={18} /> : <UserPlus size={18} />}
                        </div>
                        <div className="flex-1">
                          <div className="flex justify-between items-start">
                            <h4 className={`text-sm ${!n.is_read ? 'font-bold text-slate-900' : 'font-semibold text-slate-700'}`}>{n.title}</h4>
                            <span className="text-xs text-slate-400 font-medium whitespace-nowrap ml-4">
                              {new Date(n.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute:'2-digit' })}
                            </span>
                          </div>
                          <p className={`text-sm mt-1 line-clamp-2 ${!n.is_read ? 'text-slate-700' : 'text-slate-500'}`}>{n.message}</p>
                        </div>
                        {!n.is_read && <div className="w-2.5 h-2.5 bg-blue-600 rounded-full mt-2 shrink-0"></div>}
                      </div>
                    ))}
                  </div>
                )}
              </div>

            </div>
          </div>
        )}

        {activePage === 'applicants' && (
          <>
            <TopNav 
              query={query} 
              setQuery={setQuery} 
              searchCandidates={() => setSubmittedQuery(query)} 
              matchCount={filteredCandidates.length} 
              searchMode={searchMode}
              setSearchMode={setSearchMode}
              sortOption={sortOption}
              setSortOption={setSortOption}
              isLoading={loading} 
              selectedDept={selectedDept}
              setSelectedDept={setSelectedDept}
              minExperience={minExperience}
              setMinExperience={setMinExperience}
              onClearFilters={() => { 
                  setSelectedDept("All"); 
                  setMinExperience(0); 
                  setSortOption('match'); 
                  setQuery(""); 
                  setSubmittedQuery(""); 
              }} 
              viewMode={viewMode}
              setViewMode={setViewMode}
              onOpenProfile={() => setActivePage('profile')}
              onOpenSettings={() => setActivePage('settings')}
            />

            <div className="bg-white border-b border-slate-200 px-6 py-3 flex gap-4">
              {['Active', 'Advanced', 'Rejected', 'Archived', 'All'].map((tab) => (
                <button
                  key={tab}
                  onClick={() => setStatusTab(tab)}
                  className={`px-4 py-1.5 rounded-full text-sm font-bold transition-colors ${
                    statusTab === tab 
                      ? 'bg-blue-600 text-white shadow-sm' 
                      : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>

            <div className={`flex-1 flex flex-col w-full overflow-hidden relative ${viewMode === 'grid' ? 'p-0' : 'p-6 overflow-y-auto'}`}>
                
                {canManagePipeline && (
                  <BulkActionBar 
                    selectedCount={selectedRows.length}
                    onClearSelection={() => setSelectedRows([])} 
                    onBulkAdvance={handleBulkAdvance}
                    onBulkReject={handleBulkReject}
                    onBulkArchive={handleBulkArchive}
                  />
                )}

                {loading ? (
                    <div className="flex justify-center py-32 w-full"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div></div>
                ) : filteredCandidates.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-64 text-slate-400 mt-10 w-full">
                    <p className="font-bold text-slate-500 text-lg">No candidates match these filters.</p>
                    <p className="text-sm mt-2">Try adjusting the sliders or clearing your search.</p>
                    </div>
                ) : viewMode === 'grid' ? (
                    <CandidateDataGrid 
                      rowData={filteredCandidates} 
                      onRowDoubleClicked={(candidate: Candidate) => setSelectedCandidate(candidate)} 
                      onSelectionChanged={(rows: Candidate[]) => setSelectedRows(rows)}
                    />
                ) : (
                    <div className="flex flex-col gap-4 max-w-4xl mx-auto w-full pb-10">
                    {filteredCandidates.map((candidate: Candidate, index: number) => (
                        <CandidateCard 
                          key={candidate._id || candidate.id || index} 
                          candidate={candidate} 
                          onViewClick={() => setSelectedCandidate(candidate)} 
                        />
                    ))}
                    </div>
                )}
            </div>
          </>
        )}

        {activePage === 'jobs' && (
          <div className="flex-1 overflow-y-auto p-8">
            <JobPage />
          </div>
        )}

        {activePage === 'activity' && (
          <div className="flex-1 overflow-y-auto bg-slate-50/50">
            <ActivityPage />
          </div>
        )}

        {activePage === 'settings' && (
          <div className="flex-1 overflow-y-auto bg-slate-50/50">
            <SettingsPage />
          </div>
        )}

        {activePage === 'profile' && (
          <div className="flex-1 overflow-y-auto bg-slate-50/50">
            <UserProfile />
          </div>
        )}

      </div>

      {/* MODALS */}
      {selectedCandidate && (
        <CandidateModal 
          candidate={candidates.find((c: Candidate) => c.id === selectedCandidate.id) || selectedCandidate} 
          onClose={() => setSelectedCandidate(null)} 
        />
      )}

      <CreateJobModal 
        isOpen={isCreateModalOpen} 
        onClose={() => setIsCreateModalOpen(false)} 
      />

    </div>
  );
}

function AuthWrapper() {
  const { session, userProfile } = useAuth();
  
  if (!session) {
    return <LoginPage />;
  }

  if (session && !userProfile?.company_id) {
    return <Onboarding />;
  }

  return <MainApp />;
}

export default function App() {
  return (
    <AuthProvider>
      <AuthWrapper />
    </AuthProvider>
  );
}