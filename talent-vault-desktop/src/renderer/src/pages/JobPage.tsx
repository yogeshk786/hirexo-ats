import React, { useState, useEffect } from 'react';
import { MapPin, Banknote, Sparkles, Star, MoreVertical, LayoutList, KanbanSquare, Loader2, Mail, Send, X } from 'lucide-react';
import PipelineBoard from '../components/PipelineBoard';
import CandidateModal from '../components/CandidateModal';
import { supabase } from "../supabaseClient";

// 🚀 ADDED: Import the Auth Context so we can grab the token
import { useAuth } from '../context/AuthContext'; 

export default function JobPage() {
  // 🚀 Dynamically pull from your .env file for API requests
  const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

  // 🚀 ADDED: Grab the active session
  const { session } = useAuth();

  const [viewMode, setViewMode] = useState<'list' | 'pipeline'>(
    (localStorage.getItem('talentvault_viewMode') as 'list' | 'pipeline') || 'list'
  );
  
  const [selectedCandidate, setSelectedCandidate] = useState<any | null>(null);
  
  // REAL DATABASE STATE
  const [jobs, setJobs] = useState<any[]>([]);
  const [activeJob, setActiveJob] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  // AI MATCHING STATE
  const [candidates, setCandidates] = useState<any[]>([]);
  const [isScoring, setIsScoring] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);

  // BULK OUTREACH STATE
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [pipelineCandidates, setPipelineCandidates] = useState<any[]>([]);
  const [selectedCandidateIds, setSelectedCandidateIds] = useState<Set<string>>(new Set());
  const [bulkSubject, setBulkSubject] = useState("");
  const [bulkBody, setBulkBody] = useState("Hi [Name],\n\nWe were incredibly impressed by your profile and would love to chat with you about our open role.\n\nAre you available for a quick call this week?\n\nBest,\nThe Hiring Team");
  const [isBulkSending, setIsBulkSending] = useState(false);

  // Fetch jobs & Listen for New Jobs
  useEffect(() => {
    fetchJobs();

    const handleNewJob = () => {
      localStorage.removeItem('talentvault_activeJobId');
      fetchJobs();
    };
    
    window.addEventListener('job-created', handleNewJob);
    return () => window.removeEventListener('job-created', handleNewJob);
  }, []);

  // Trigger AI Match whenever the active job changes
  useEffect(() => {
    // 🚀 THE FIX: Only fetch if we have both an active job AND a session token
    if (activeJob?.id && session?.access_token) {
      fetchMatches(activeJob.id, false);
    }
  }, [activeJob, session?.access_token]);

  const handleViewModeChange = (mode: 'list' | 'pipeline') => {
    setViewMode(mode);
    localStorage.setItem('talentvault_viewMode', mode);
  };

  const handleJobChange = (jobId: string) => {
    const found = jobs.find(j => j.id === jobId);
    if (found) {
      setActiveJob(found);
      localStorage.setItem('talentvault_activeJobId', found.id);
    }
  };

  const fetchJobs = async () => {
    const cachedJobs = localStorage.getItem('talentvault_jobs_cache');
    
    if (cachedJobs) {
      try {
        const parsedJobs = JSON.parse(cachedJobs);
        setJobs(parsedJobs);
        
        const savedJobId = localStorage.getItem('talentvault_activeJobId');
        const jobToSelect = parsedJobs.find((j: any) => j.id === savedJobId) || parsedJobs[0];
        if (jobToSelect) {
          setActiveJob(jobToSelect);
          if (!savedJobId) localStorage.setItem('talentvault_activeJobId', jobToSelect.id);
        }
        
        setLoading(false); 
      } catch (e) {
        console.error("Cache parsing error, falling back to network", e);
        setLoading(true);
      }
    } else {
      setLoading(true);
    }

    try {
      const { data, error } = await supabase
        .from('jobs')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      if (data && data.length > 0) {
        setJobs(data);
        localStorage.setItem('talentvault_jobs_cache', JSON.stringify(data)); 
        
        const savedJobId = localStorage.getItem('talentvault_activeJobId');
        const jobToSelect = data.find((j: any) => j.id === savedJobId) || data[0];
        
        setActiveJob(jobToSelect);
        localStorage.setItem('talentvault_activeJobId', jobToSelect.id);
      }
    } catch (error) {
      console.error('Error fetching jobs:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchMatches = async (jobId: string, forceRefresh: boolean = false) => {
    // 🚀 1. Check for token to avoid 401 Unauthorized Race Conditions
    const token = session?.access_token;
    if (!token) {
        console.log("Waiting for auth token...");
        return; 
    }

    setIsScoring(true);
    if (forceRefresh) setCandidates([]); 
    
    try {
      const response = await fetch(`${API_URL}/api/match-candidates`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}` // 🚀 2. Attach the token here!
        },
        body: JSON.stringify({ 
          job_id: jobId,
          force_refresh: forceRefresh 
        })
      });

      if (!response.ok) {
        throw new Error('Failed to fetch matches from the AI engine');
      }

      const data = await response.json();
      setCandidates(data.candidates || []);
    } catch (error) {
      console.error("AI Matching Error:", error);
    } finally {
      setIsScoring(false);
    }
  };

  const handleAddToPipeline = async (e: React.MouseEvent, candidate: any) => {
    e.stopPropagation(); 
    if (!activeJob) return;
    
    setProcessingId(candidate.id);

    try {
      // 🚀 Use .maybeSingle() to safely handle 0 rows without throwing an error
      const { data: existing, error: checkError } = await supabase
        .from('job_applications')
        .select('id')
        .eq('job_id', activeJob.id)
        .eq('candidate_id', candidate.id)
        .maybeSingle();

      if (checkError) throw checkError;

      if (existing) {
        alert(`${candidate.name} is already in the pipeline for this job!`);
        setProcessingId(null);
        return;
      }

      // 🚀 THE FIX: Inject company_id and user_id to satisfy Supabase Row Level Security (RLS)
      const { error: insertError } = await supabase
        .from('job_applications')
        .insert({
          job_id: activeJob.id,
          candidate_id: candidate.id,
          company_id: activeJob.company_id, // Helps pass RLS if policy checks company
          user_id: session?.user?.id,       // Helps pass RLS if policy checks user ownership
          name: candidate.name,
          role: candidate.role,
          exp: candidate.exp,
          match_score: candidate.match,
          status: 'Sourcing', 
          email: candidate.email !== "update-email@example.com" ? candidate.email : null,
          phone: candidate.phone || null,
          filename: candidate.filename || null,
          social_links: candidate.social_links || null,
          projects: candidate.projects || null
        });

      if (insertError) throw insertError;
      
      alert(`${candidate.name} was successfully moved to the pipeline!`);
      handleViewModeChange('pipeline');

    } catch (error: any) {
      console.error("Error adding to pipeline:", error.message || error);
      alert(`Failed to add candidate: ${error.message || 'Check console for details.'}`);
    } finally {
      setProcessingId(null);
    }
  };

  const openBulkOutreach = async () => {
    if (!activeJob) return;
    setIsBulkModalOpen(true);
    
    const { data } = await supabase
      .from('job_applications')
      .select('id, name, email')
      .eq('job_id', activeJob.id)
      .eq('status', 'Sourcing') 
      .neq('email', 'update-email@example.com') 
      .not('email', 'is', null);
      
    const fetchedCandidates = data || [];
    setPipelineCandidates(fetchedCandidates);
    setSelectedCandidateIds(new Set(fetchedCandidates.map(c => c.id)));
  };

  const toggleCandidateSelection = (id: string) => {
    const newSelection = new Set(selectedCandidateIds);
    if (newSelection.has(id)) {
      newSelection.delete(id);
    } else {
      newSelection.add(id);
    }
    setSelectedCandidateIds(newSelection);
  };

  const executeBulkSend = async () => {
    // 🚀 Add token check here too!
    const token = session?.access_token;
    if (!token) return alert("Please log in to send emails.");

    const finalRecipients = pipelineCandidates.filter(c => selectedCandidateIds.has(c.id));

    if (finalRecipients.length === 0) return alert("Please select at least one candidate.");
    setIsBulkSending(true);

    try {
      const response = await fetch(`${API_URL}/api/send-bulk-outreach`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}` // 🚀 Attach the token to the email sender!
        },
        body: JSON.stringify({
          candidates: finalRecipients,
          subject: bulkSubject || `Update regarding the ${activeJob?.title} role`,
          body: bulkBody
        })
      });

      if (!response.ok) throw new Error("Bulk send failed");
      
      const result = await response.json();
      alert(`✅ Successfully sent ${result.sent_count} personalized emails!`);
      setIsBulkModalOpen(false);
    } catch (error) {
      console.error(error);
      alert("Failed to send bulk emails.");
    } finally {
      setIsBulkSending(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 size={32} className="animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-6 relative">
      
      {/* JOB REQUISITION SELECTOR HEADER */}
      <div className="mb-8 flex justify-between items-start flex-wrap gap-4 border-b border-slate-100 pb-6">
        <div>
          <label className="block text-xs text-slate-500 font-bold mb-2 uppercase tracking-wider">Active Requisition</label>
          {jobs.length === 0 ? (
            <span className="text-sm text-slate-400 font-medium">No active requisitions found.</span>
          ) : (
            <select 
              className="px-4 py-2.5 border border-slate-300 rounded-lg bg-white text-slate-800 font-bold outline-none min-w-[320px] shadow-sm text-sm"
              value={activeJob?.id || ''}
              onChange={(e) => handleJobChange(e.target.value)}
            >
              {jobs.map((job) => (
                <option key={job.id} value={job.id}>{job.title} • {job.department}</option>
              ))}
            </select>
          )}
        </div>

        {activeJob && (
          <div className="flex items-center gap-3">
            <div className="flex bg-gray-100 p-1 rounded-lg border border-gray-200 mr-2">
              <button 
                onClick={() => handleViewModeChange('list')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${viewMode === 'list' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >
                <LayoutList size={16} /> Overview
              </button>
              <button 
                onClick={() => handleViewModeChange('pipeline')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${viewMode === 'pipeline' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >
                <KanbanSquare size={16} /> Pipeline
              </button>
            </div>

            <button 
              onClick={openBulkOutreach}
              className="px-4 py-2 bg-white border border-gray-300 rounded-md font-medium text-gray-700 shadow-sm hover:bg-gray-50 transition-colors"
            >
              Bulk Outreach
            </button>
            <button className="px-4 py-2 bg-gray-900 text-white rounded-md font-medium flex items-center gap-2 shadow-sm hover:bg-gray-800">
              <Sparkles size={16} /> Generate AI Assessment
            </button>
          </div>
        )}
      </div>

      {activeJob && (
        <>
          {/* Header Section */}
          <div className="mb-8">
            <div className="text-sm text-blue-600 font-medium mb-1">Jobs <span className="text-gray-400 mx-1">›</span> REQ-{activeJob.id?.substring(0, 6).toUpperCase() || 'NA'}</div>
            <h2 className="text-3xl font-bold text-gray-900 mb-3">{activeJob.title}</h2>
            <div className="flex items-center gap-4 text-sm text-gray-600 flex-wrap">
              <span className="flex items-center gap-1"><MapPin size={16} /> {activeJob.location}</span>
              <span className="flex items-center gap-1"><Banknote size={16} /> Competitive Salary</span>
              <span className="bg-blue-100 text-blue-800 px-2 py-0.5 rounded text-xs font-bold tracking-wide uppercase">{activeJob.status || 'Active'}</span>
            </div>
          </div>

          {/* Conditional Rendering: Switch Views */}
          {viewMode === 'pipeline' ? (
            <div className="animate-in fade-in duration-300 mt-4">
              <PipelineBoard activeJob={activeJob} onCandidateClick={(candidate) => setSelectedCandidate(candidate)} />
            </div>
          ) : (
            <div className="animate-in fade-in duration-300">
              <div className="flex border-b border-gray-200 mb-8 overflow-x-auto">
                <button className="px-6 py-3 border-b-2 border-blue-600 text-blue-600 font-medium bg-blue-50/50">Sourcing</button>
                <button className="px-6 py-3 border-b-2 border-transparent text-gray-500 hover:text-gray-700 font-medium">Assessment</button>
                <button className="px-6 py-3 border-b-2 border-transparent text-gray-500 hover:text-gray-700 font-medium">Interview</button>
                <button className="px-6 py-3 border-b-2 border-transparent text-gray-500 hover:text-gray-700 font-medium">Technical Review</button>
                <button className="px-6 py-3 border-b-2 border-transparent text-gray-500 hover:text-gray-700 font-medium">Hired</button>
              </div>

              {/* Two Column Layout */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                
                {/* Left Column: DB Requirements */}
                <div className="lg:col-span-1 space-y-6">
                  <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm">
                    <h3 className="font-semibold text-lg flex items-center gap-2 mb-4">📄 Job Requirements</h3>
                    <div className="text-sm space-y-4 text-gray-600 leading-relaxed">
                      <div>
                        <h4 className="font-bold text-gray-900 text-xs tracking-wider mb-2 uppercase">The Role</h4>
                        <p>{activeJob.description}</p>
                      </div>
                      <div>
                        <h4 className="font-bold text-gray-900 text-xs tracking-wider mb-2 uppercase">Core Responsibilities</h4>
                        <p className="whitespace-pre-line">{activeJob.responsibilities}</p>
                      </div>
                      <div>
                        <h4 className="font-bold text-gray-900 text-xs tracking-wider mb-2 uppercase">Required Skills</h4>
                        <p className="whitespace-pre-line">{activeJob.skills}</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Right Column: Candidate Matching Pool */}
                <div className="lg:col-span-2">
                  <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
                    <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-gray-50/50">
                      <h3 className="font-semibold text-lg flex items-center gap-2 text-gray-900">
                        <Sparkles size={18} className="text-blue-600"/> Top AI Matches
                      </h3>
                      
                      <div className="flex items-center gap-3">
                        <button 
                          onClick={() => fetchMatches(activeJob.id, true)}
                          disabled={isScoring}
                          className="text-sm font-medium text-blue-600 hover:text-blue-800 bg-blue-50 px-3 py-1.5 rounded-md transition-colors disabled:opacity-50 flex items-center gap-1"
                        >
                          {isScoring ? <Loader2 size={14} className="animate-spin" /> : '↻'} 
                          {isScoring ? 'Scanning...' : 'Refresh AI Matches'}
                        </button>
                        
                        <select className="text-sm border-gray-300 rounded-md shadow-sm focus:border-blue-500 focus:ring-blue-500 text-gray-600 bg-white px-2 py-1.5">
                          <option>Match Score (High to Low)</option>
                          <option>Experience (High to Low)</option>
                        </select>
                      </div>
                    </div>

                    <div className="divide-y divide-gray-100">
                      {isScoring && candidates.length === 0 ? (
                        <div className="p-12 flex flex-col items-center justify-center text-gray-500">
                          <Loader2 className="animate-spin mb-4 text-blue-600" size={32} />
                          <p className="font-medium text-slate-700">AI is analyzing resumes and calculating vector matches...</p>
                        </div>
                      ) : candidates.length === 0 ? (
                        <div className="p-12 text-center text-gray-500 font-medium">
                          No matching candidates found in the database.
                        </div>
                      ) : (
                        candidates.map((candidate, idx) => (
                          <div 
                            key={idx} 
                            onClick={() => setSelectedCandidate(candidate)}
                            className="p-5 hover:bg-blue-50 cursor-pointer transition-colors animate-in fade-in slide-in-from-bottom-2"
                            style={{ animationDelay: `${idx * 50}ms` }}
                          >
                            <div className="flex justify-between items-start mb-3">
                              <div className="flex gap-4">
                                <div className="w-12 h-12 bg-gray-200 rounded-md overflow-hidden flex-shrink-0">
                                  <img src={`https://api.dicebear.com/7.x/initials/svg?seed=${candidate.name}`} alt={candidate.name} className="w-full h-full object-cover opacity-80" />
                                </div>
                                <div>
                                  <h4 className="font-semibold text-gray-900 text-lg">{candidate.name}</h4>
                                  <p className="text-sm text-gray-500">{candidate.role} • {candidate.exp}</p>
                                </div>
                              </div>
                              <div className="flex gap-2">
                                <button className="p-1.5 border border-gray-200 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-50"><Star size={16}/></button>
                                <button className="p-1.5 border border-gray-200 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-50"><MoreVertical size={16}/></button>
                              </div>
                            </div>

                            <div className="bg-blue-100/50 border-l-4 border-blue-600 p-3 rounded-r-md mb-4 ml-16">
                              <h5 className="text-xs font-bold text-blue-800 flex items-center gap-1 mb-1 uppercase tracking-wider">
                                <Sparkles size={12}/> AI Match Logic
                              </h5>
                              <p className="text-sm text-blue-900/80 italic">"{candidate.note}"</p>
                            </div>

                            <div className="flex items-center gap-4 ml-16">
                              <div className="w-10 h-10 rounded-full border-2 border-blue-500 flex items-center justify-center font-bold text-blue-600 text-sm shadow-sm bg-white">
                                {candidate.match}%
                              </div>
                              
                              <button 
                                className="bg-gray-900 text-white px-4 py-2 rounded font-medium text-sm hover:bg-gray-800 transition-colors flex items-center gap-2 disabled:opacity-50"
                                onClick={(e) => handleAddToPipeline(e, candidate)}
                                disabled={processingId === candidate.id}
                              >
                                {processingId === candidate.id ? <Loader2 size={14} className="animate-spin" /> : null}
                                {processingId === candidate.id ? 'Adding...' : 'Request Interview'}
                              </button>

                              <button 
                                className="bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded font-medium text-sm hover:bg-gray-50 transition-colors shadow-sm"
                                onClick={(e) => e.stopPropagation()}
                              >
                                View Assessment
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>

              </div>
            </div>
          )}
        </>
      )}

      {selectedCandidate && (
        <CandidateModal 
          candidate={selectedCandidate} 
          onClose={() => setSelectedCandidate(null)} 
        />
      )}

      {/* 🚀 BULK OUTREACH MODAL */}
      {isBulkModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col">
            <div className="flex justify-between items-center px-6 py-4 border-b border-slate-100 bg-slate-50">
              <h3 className="font-bold text-slate-800 flex items-center gap-2">
                <Mail size={16} className="text-blue-600" /> Bulk Outreach Campaign
              </h3>
            </div>
            
            <div className="p-6 flex flex-col gap-4">
              <div className="bg-blue-50 border border-blue-100 text-blue-800 p-3 rounded-md text-sm">
                <strong>{selectedCandidateIds.size} Candidates</strong> will receive this email. Use <strong>[Name]</strong> in the body to automatically insert their first name.
              </div>

              {/* The Candidate Selection Checklist */}
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-wider">
                  Select Recipients ({selectedCandidateIds.size} / {pipelineCandidates.length})
                </label>
                <div className="max-h-40 overflow-y-auto border border-slate-200 rounded-md bg-white divide-y divide-slate-100">
                  {pipelineCandidates.length === 0 ? (
                    <div className="p-3 text-sm text-slate-500 text-center">No candidates found in Sourcing with valid emails.</div>
                  ) : (
                    pipelineCandidates.map(candidate => (
                      <label key={candidate.id} className="flex items-center gap-3 p-3 hover:bg-slate-50 cursor-pointer transition-colors">
                        <input 
                          type="checkbox" 
                          checked={selectedCandidateIds.has(candidate.id)}
                          onChange={() => toggleCandidateSelection(candidate.id)}
                          className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
                        />
                        <span className="text-sm font-medium text-slate-800">{candidate.name}</span>
                        <span className="text-xs text-slate-400 ml-auto">&lt;{candidate.email}&gt;</span>
                      </label>
                    ))
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1 uppercase tracking-wider">Subject</label>
                <input 
                  type="text" 
                  value={bulkSubject}
                  placeholder={`Regarding the ${activeJob?.title} role`}
                  onChange={(e) => setBulkSubject(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-md text-sm text-slate-800 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1 uppercase tracking-wider">Message Body</label>
                <textarea 
                  value={bulkBody}
                  onChange={(e) => setBulkBody(e.target.value)}
                  rows={6}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-md text-sm text-slate-800 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 resize-none"
                />
              </div>
            </div>

            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
              <button 
                onClick={() => setIsBulkModalOpen(false)}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200 rounded-md transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={executeBulkSend}
                disabled={isBulkSending || selectedCandidateIds.size === 0}
                className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-md flex items-center gap-2 transition-colors shadow-sm disabled:opacity-50"
              >
                {isBulkSending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                {isBulkSending ? 'Sending...' : `Send to ${selectedCandidateIds.size} Candidates`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}