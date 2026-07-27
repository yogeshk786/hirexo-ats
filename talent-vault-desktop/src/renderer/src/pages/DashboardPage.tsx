import React, { useState, useEffect, useMemo } from 'react';
import { 
  Users, ClipboardList, Clock, 
  Settings, UserCheck, ShieldCheck, Factory, MoreVertical, Loader2
} from 'lucide-react';
import { supabase } from '../supabaseClient';
import { Candidate } from '../App';
import { useAuth } from '../context/AuthContext'; // 🚀 IMPORTED AUTH CONTEXT

interface DashboardProps {
  onCandidateClick: (candidate: Candidate) => void;
}

// ============================================================================
// MICRO-COMPONENT 1: KPI CARDS
// ============================================================================
const KPICards = ({ totalApplicants, activeJobsCount }: { totalApplicants: number, activeJobsCount: number }) => (
  <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
    
    {/* Card 1: Live Total Applicants */}
    <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
      <div className="flex justify-between items-start mb-4">
        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Applicants</span>
        <Users size={18} className="text-slate-400" />
      </div>
      <div className="flex items-end gap-3">
        <span className="text-3xl font-extrabold text-slate-900">{totalApplicants}</span>
        <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded flex items-center mb-1">Live DB</span>
      </div>
      <div className="w-full bg-slate-100 h-1 mt-4 rounded-full overflow-hidden">
        <div className="bg-blue-600 h-full w-full rounded-full"></div>
      </div>
    </div>

    {/* Card 2: Live Active Requisitions */}
    <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
      <div className="flex justify-between items-start mb-4">
        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Active Requisitions</span>
        <ClipboardList size={18} className="text-slate-400" />
      </div>
      <div className="flex items-end gap-3">
        <span className="text-3xl font-extrabold text-slate-900">{activeJobsCount}</span>
        <span className="text-sm font-medium text-slate-500 mb-1">Open Positions</span>
      </div>
      <div className="flex gap-1 mt-4">
        <div className="bg-blue-600 h-1 flex-1 rounded-full"></div>
        <div className="bg-blue-200 h-1 flex-1 rounded-full"></div>
        <div className="bg-slate-100 h-1 flex-1 rounded-full"></div>
      </div>
    </div>

    {/* Card 3: Static (For now) */}
    <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
      <div className="flex justify-between items-start mb-4">
        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Avg. Time to Hire</span>
        <Clock size={18} className="text-slate-400" />
      </div>
      <div className="flex items-end gap-2">
        <span className="text-3xl font-extrabold text-slate-900">14 days</span>
      </div>
    </div>
  </div>
);

// ============================================================================
// MICRO-COMPONENT 2: ROLE SEGMENTATION 
// ============================================================================
const RoleSegmentation = ({ deptCounts, totalApplicants }: { deptCounts: any, totalApplicants: number }) => {
  const getWidth = (count: number) => totalApplicants === 0 ? '0%' : `${(count / totalApplicants) * 100}%`;

  return (
    <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm col-span-1">
      <h3 className="text-base font-bold text-slate-800 mb-6">Role Segmentation</h3>
      <div className="space-y-6">
        
        <div>
          <div className="flex justify-between items-start mb-2">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-50 text-blue-600 rounded-lg"><Settings size={16}/></div>
              <div><p className="text-sm font-bold text-slate-900">Technical & Engineering</p></div>
            </div>
            <span className="text-sm font-bold text-slate-900">{deptCounts.engineering}</span>
          </div>
          <div className="w-full bg-slate-100 h-1.5 rounded-full">
            <div className="bg-blue-600 h-full rounded-full transition-all duration-1000" style={{ width: getWidth(deptCounts.engineering) }}></div>
          </div>
        </div>

        <div>
          <div className="flex justify-between items-start mb-2">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-slate-50 text-slate-600 rounded-lg"><Factory size={16}/></div>
              <div><p className="text-sm font-bold text-slate-900">Operations & Floor</p></div>
            </div>
            <span className="text-sm font-bold text-slate-900">{deptCounts.operations}</span>
          </div>
          <div className="w-full bg-slate-100 h-1.5 rounded-full">
            <div className="bg-blue-400 h-full rounded-full transition-all duration-1000" style={{ width: getWidth(deptCounts.operations) }}></div>
          </div>
        </div>

        <div>
          <div className="flex justify-between items-start mb-2">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-slate-50 text-slate-600 rounded-lg"><UserCheck size={16}/></div>
              <div><p className="text-sm font-bold text-slate-900">HR & Administration</p></div>
            </div>
            <span className="text-sm font-bold text-slate-900">{deptCounts.hr}</span>
          </div>
          <div className="w-full bg-slate-100 h-1.5 rounded-full">
            <div className="bg-blue-300 h-full rounded-full transition-all duration-1000" style={{ width: getWidth(deptCounts.hr) }}></div>
          </div>
        </div>

        <div>
          <div className="flex justify-between items-start mb-2">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-slate-50 text-slate-600 rounded-lg"><ShieldCheck size={16}/></div>
              <div><p className="text-sm font-bold text-slate-900">Quality Control & Safety</p></div>
            </div>
            <span className="text-sm font-bold text-slate-900">{deptCounts.qc}</span>
          </div>
          <div className="w-full bg-slate-100 h-1.5 rounded-full">
            <div className="bg-blue-200 h-full rounded-full transition-all duration-1000" style={{ width: getWidth(deptCounts.qc) }}></div>
          </div>
        </div>

      </div>
    </div>
  );
};

// ============================================================================
// MICRO-COMPONENT 3: TALENT PIPELINE CHART
// ============================================================================
const TalentPipelineChart = ({ deptCounts, totalApplicants }: { deptCounts: any, totalApplicants: number }) => {
  const getHeight = (count: number) => totalApplicants === 0 ? '5%' : `${(count / totalApplicants) * 100}%`;

  return (
    <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm col-span-2 flex flex-col">
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-base font-bold text-slate-800">Talent Pipeline by Role</h3>
      </div>
      <div className="flex-1 flex items-end justify-between px-4 pb-4 border-b border-slate-100 mt-4 h-48">
        <div className="flex items-end gap-1.5 h-full w-1/5 justify-center relative">
          <div className="w-4 bg-blue-600 rounded-t-sm transition-all duration-1000" style={{ height: getHeight(deptCounts.engineering) }}></div>
          <div className="w-4 bg-blue-400 rounded-t-sm transition-all duration-1000" style={{ height: getHeight(deptCounts.operations) }}></div>
          <div className="w-4 bg-blue-200 rounded-t-sm transition-all duration-1000" style={{ height: getHeight(deptCounts.hr) }}></div>
          <div className="w-4 bg-blue-100 rounded-t-sm transition-all duration-1000" style={{ height: getHeight(deptCounts.qc) }}></div>
          <span className="absolute -bottom-6 text-[10px] font-bold text-slate-400">Current Distribution</span>
        </div>
      </div>
      
      {/* Legend */}
      <div className="flex justify-center gap-6 mt-8">
        <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-sm bg-blue-600"></div><span className="text-xs font-medium text-slate-500">Engineering</span></div>
        <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-sm bg-blue-400"></div><span className="text-xs font-medium text-slate-500">Operations</span></div>
        <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-sm bg-blue-200"></div><span className="text-xs font-medium text-slate-500">HR & Admin</span></div>
        <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-sm bg-blue-100"></div><span className="text-xs font-medium text-slate-500">QC & Safety</span></div>
      </div>
    </div>
  );
};

// ============================================================================
// MICRO-COMPONENT 4: TOP TALENT TABLE
// ============================================================================

// 🚀 Helper to generate a stable fake score to prevent React UI flickering
const getDeterministicScore = (id: string = '') => {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash);
  return 75 + (Math.abs(hash) % 21); // Returns a stable number between 75 and 95
};

const TopTalentTable = ({ topTalent, onCandidateClick }: { topTalent: Candidate[], onCandidateClick: (c: Candidate) => void }) => (
  <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden mt-8">
    <div className="flex justify-between items-center p-6 border-b border-slate-100">
      <h3 className="text-base font-bold text-slate-800">Top Matching Talent</h3>
    </div>
    
    <table className="w-full text-left border-collapse">
      <thead>
        <tr className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500 font-bold">
          <th className="p-4 pl-6 font-semibold">Candidate</th>
          <th className="p-4 font-semibold">Role Intent</th>
          <th className="p-4 font-semibold">Experience</th>
          <th className="p-4 font-semibold">Match Score</th>
          <th className="p-4 pr-6 text-right font-semibold">Action</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100 text-sm">
        {topTalent.length === 0 ? (
          <tr>
            <td colSpan={5} className="p-8 text-center text-slate-400 italic">No candidates processed yet. Check your database!</td>
          </tr>
        ) : (
          topTalent.map((candidate, idx) => {
            // 🚀 Now uses deterministic score instead of Math.random()
            const score = candidate.match_score ? Math.round(candidate.match_score) : getDeterministicScore(candidate.id || candidate.name); 
            
            // Extract role safely from segmentation JSON if it exists
            let displayRole = 'Uncategorized';
            if (typeof candidate.segmentation === 'string') {
                try {
                    const seg = JSON.parse(candidate.segmentation);
                    displayRole = seg.standardized_title || seg.department || 'Uncategorized';
                } catch { /* ignore */ }
            } else if (candidate.segmentation?.standardized_title) {
                displayRole = candidate.segmentation.standardized_title;
            } else if (candidate.role) {
                displayRole = candidate.role;
            }

            return (
              <tr key={candidate.id || idx} onClick={() => onCandidateClick(candidate)} className="hover:bg-slate-50 transition-colors cursor-pointer">
                <td className="p-4 pl-6">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-md bg-blue-100 text-blue-700 flex items-center justify-center font-bold">
                      {candidate.name ? candidate.name.charAt(0).toUpperCase() : '?'}
                    </div>
                    <div>
                      <p className="font-bold text-slate-900">{candidate.name || 'Unknown Candidate'}</p>
                      <p className="text-xs text-slate-500">{candidate.location || 'Remote'}</p>
                    </div>
                  </div>
                </td>
                <td className="p-4 text-slate-600 font-medium">
                  {displayRole}
                </td>
                <td className="p-4 text-slate-600">
                  {candidate.total_experience_years !== undefined ? `${candidate.total_experience_years} Years` : (candidate.exp || 'Unknown')}
                </td>
                <td className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div className="bg-blue-600 h-full rounded-full" style={{ width: `${score}%` }}></div>
                    </div>
                    <span className="text-xs font-bold text-slate-700">{score}%</span>
                  </div>
                </td>
                <td className="p-4 pr-6 text-right">
                  <button className="text-slate-400 hover:text-slate-600"><MoreVertical size={16} /></button>
                </td>
              </tr>
            );
          })
        )}
      </tbody>
    </table>
  </div>
);

// ============================================================================
// MAIN PAGE COMPONENT 
// ============================================================================
export default function DashboardPage({ onCandidateClick }: DashboardProps) {
  
  const { session } = useAuth(); // 🚀 1. PULL THE SESSION
  
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [activeJobsCount, setActiveJobsCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
  }, [session]); // 🚀 Added session as dependency

  const fetchDashboardData = async () => {
    // 🚀 STEP 1: INSTANT CACHE LOAD
    const cachedCandidates = localStorage.getItem('talentvault_dashboard_candidates');
    const cachedJobsCount = localStorage.getItem('talentvault_dashboard_job_count');
    
    if (cachedCandidates) {
      try {
        setCandidates(JSON.parse(cachedCandidates));
        if (cachedJobsCount) setActiveJobsCount(parseInt(cachedJobsCount, 10));
        setLoading(false); 
      } catch (e) {
        console.error("Cache parsing error", e);
        setLoading(true);
      }
    } else {
      setLoading(true);
    }

    // 🚀 STEP 2: SECURE BACKGROUND REFRESH
    try {
      if (!session?.user?.id) return;

      // 1. Get this specific user's company_id
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('company_id')
        .eq('id', session.user.id)
        .single();

      if (!profile?.company_id) {
        setLoading(false);
        setCandidates([]); // Clear out any ghost data if they have no company
        setActiveJobsCount(0);
        return; 
      }

      const myCompanyId = profile.company_id;

      // 2. Fetch candidates ONLY for this company
      const { data: candidatesData, error: candidatesError } = await supabase
        .from('candidates')
        .select('*')
        .eq('company_id', myCompanyId) // 🚀 SECURED!
        .order('email_received_at', { ascending: false, nullsFirst: false })
        .limit(200);

      if (candidatesError) throw candidatesError;
      
      if (candidatesData) {
        setCandidates(candidatesData);
        localStorage.setItem('talentvault_dashboard_candidates', JSON.stringify(candidatesData));
      }

      // 3. Fetch jobs ONLY for this company
      const { count, error: countError } = await supabase
        .from('jobs')
        .select('*', { count: 'exact', head: true })
        .eq('company_id', myCompanyId); // 🚀 SECURED!

      if (countError) throw countError;
      
      if (count !== null) {
        setActiveJobsCount(count);
        localStorage.setItem('talentvault_dashboard_job_count', count.toString());
      }

    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const { totalApplicants, deptCounts, topTalent } = useMemo(() => {
    const total = candidates.length;
    const counts = { engineering: 0, operations: 0, hr: 0, qc: 0 };

    candidates.forEach(c => {
      // Safely extract department from segmentation
      let dept = '';
      if (typeof c.segmentation === 'string') {
          try { dept = JSON.parse(c.segmentation).department || ''; } catch { /* ignore */ }
      } else if (c.segmentation?.department) {
          dept = c.segmentation.department;
      }
      
      // Fallbacks if no department is specified
      const roleStr = (dept || c.role || '').toLowerCase();

      if (roleStr.includes('developer') || roleStr.includes('engineer') || roleStr.includes('tech') || roleStr.includes('it')) counts.engineering++;
      else if (roleStr.includes('manager') || roleStr.includes('floor') || roleStr.includes('operations')) counts.operations++;
      else if (roleStr.includes('hr') || roleStr.includes('admin') || roleStr.includes('human')) counts.hr++;
      else if (roleStr.includes('quality') || roleStr.includes('safety') || roleStr.includes('qc')) counts.qc++;
      else counts.engineering++; // Default fallback for uncategorized
    });

    // Sort by match score (highest first)
    const sorted = [...candidates].sort((a, b) => {
        // 🚀 Ensure sorting uses the deterministic score to avoid flickering logic
        const scoreA = a.match_score ? a.match_score : getDeterministicScore(a.id || a.name);
        const scoreB = b.match_score ? b.match_score : getDeterministicScore(b.id || b.name);
        return scoreB - scoreA;
    });
    
    const top3 = sorted.slice(0, 3);

    return { totalApplicants: total, deptCounts: counts, topTalent: top3 };
  }, [candidates]);

  if (loading && candidates.length === 0) {
    return (
      <div className="flex h-[80vh] items-center justify-center">
        <Loader2 size={32} className="animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="p-8 w-full max-w-7xl mx-auto pb-20 animate-in fade-in duration-300">
      
      <div className="mb-8 flex justify-between items-center">
        <h2 className="text-2xl font-bold text-slate-900">Applicant Analytics Overview</h2>
        <button onClick={fetchDashboardData} className="text-sm font-medium text-blue-600 hover:text-blue-800 bg-blue-50 px-3 py-1.5 rounded-md transition-colors flex items-center gap-1">
          ↻ Refresh Data
        </button>
      </div>
      
      <KPICards totalApplicants={totalApplicants} activeJobsCount={activeJobsCount} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <RoleSegmentation deptCounts={deptCounts} totalApplicants={totalApplicants} />
        <TalentPipelineChart deptCounts={deptCounts} totalApplicants={totalApplicants} />
      </div>

      <TopTalentTable topTalent={topTalent} onCandidateClick={onCandidateClick} />

    </div>
  );
}