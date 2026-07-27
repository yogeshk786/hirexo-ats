import React, { useState, useEffect } from 'react';
import { 
  MoreVertical, Sparkles, Mail, Calendar, Loader2, X, Send, 
  ClipboardCheck, Link as LinkIcon, CheckSquare, ArrowUpDown, Reply, Users
} from 'lucide-react';
import { supabase } from '../supabaseClient'; 
import toast, { Toaster } from 'react-hot-toast';

const STAGES = ['Sourcing', 'Assessment', 'Interview', 'Technical Review', 'Hired'];

interface PipelineBoardProps {
  activeJob: any;
  onCandidateClick: (candidate: any) => void;
}

export default function PipelineBoard({ activeJob, onCandidateClick }: PipelineBoardProps) {
  // 🚀 Dynamically pull from your .env file for API requests
  const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

  const [columns, setColumns] = useState<Record<string, any[]>>({
    'Sourcing': [], 'Assessment': [], 'Interview': [], 'Technical Review': [], 'Hired': []
  });
  const [loading, setLoading] = useState(true);
  
  // New UI States
  const [sortBy, setSortBy] = useState<'date' | 'match'>('match');
  const [selectedCandidates, setSelectedCandidates] = useState<string[]>([]);
  const [communications, setCommunications] = useState<Record<string, 'outbound' | 'replied'>>({});
  
  const [draggedItem, setDraggedItem] = useState<{ id: string, sourceStage: string } | null>(null);
  
  // AI Email State
  const [draftingId, setDraftingId] = useState<string | null>(null);
  const [emailModal, setEmailModal] = useState<{ candidate: any, subject: string, body: string } | null>(null);

  // Assessment State
  const [assessmentModal, setAssessmentModal] = useState<any | null>(null);
  const [assessmentData, setAssessmentData] = useState({ score: '', link: '', status: 'Pending' });
  const [isSavingAssessment, setIsSavingAssessment] = useState(false);

  useEffect(() => {
    if (activeJob?.id) {
      fetchPipelineData();
    } else {
      setLoading(false);
    }
  }, [activeJob]);

  const fetchPipelineData = async () => {
    setLoading(true);
    try {
      // 1. Fetch Applications
      const { data, error } = await supabase
        .from('job_applications')
        .select('*')
        .eq('job_id', activeJob.id);

      if (error) throw error;

      // 2. Fetch Communication Status for these candidates
      const candidateIds = data?.map(c => c.candidate_id || c.id) || [];
      if (candidateIds.length > 0) {
        const { data: commsData } = await supabase
          .from('communications')
          .select('candidate_id, type')
          .in('candidate_id', candidateIds);

        const commsMap: Record<string, 'outbound' | 'replied'> = {};
        commsData?.forEach(c => {
          if (c.type === 'inbound_reply' || c.type === 'inbound_email') {
            commsMap[c.candidate_id] = 'replied'; // Reply takes highest precedence
          } else if (c.type === 'outbound_email' && commsMap[c.candidate_id] !== 'replied') {
            commsMap[c.candidate_id] = 'outbound';
          }
        });
        setCommunications(commsMap);
      }

      // 3. Organize Columns
      const newColumns: Record<string, any[]> = {
        'Sourcing': [], 'Assessment': [], 'Interview': [], 'Technical Review': [], 'Hired': []
      };

      (data || []).forEach(app => {
        if (newColumns[app.status]) {
          newColumns[app.status].push(app);
        } else {
          newColumns['Assessment'].push(app);
        }
      });

      setColumns(newColumns);
    } catch (error) {
      console.error("Error fetching pipeline:", error);
      toast.error("Failed to load pipeline data.");
    } finally {
      setLoading(false);
    }
  };

  // Helper to sort columns dynamically
  const getSortedColumn = (stage: string) => {
    const col = [...columns[stage]];
    if (sortBy === 'match') {
      return col.sort((a, b) => (b.match_score || b.match || 0) - (a.match_score || a.match || 0));
    }
    return col.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
  };

  const toggleSelection = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setSelectedCandidates(prev => 
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const handleDragStart = (e: React.DragEvent, id: string, sourceStage: string) => {
    setDraggedItem({ id, sourceStage });
    setTimeout(() => { (e.target as HTMLElement).style.opacity = '0.5'; }, 0);
  };

  const handleDragEnd = (e: React.DragEvent) => {
    (e.target as HTMLElement).style.opacity = '1';
    setDraggedItem(null);
  };

  const handleDragOver = (e: React.DragEvent) => e.preventDefault(); 

  const handleDrop = async (e: React.DragEvent, targetStage: string) => {
    e.preventDefault();
    if (!draggedItem) return;

    const { id, sourceStage } = draggedItem;
    if (sourceStage === targetStage) return;

    const candidate = columns[sourceStage].find(c => c.id === id);
    if (!candidate) return;

    setColumns(prev => ({
      ...prev,
      [sourceStage]: prev[sourceStage].filter(c => c.id !== id),
      [targetStage]: [candidate, ...prev[targetStage]] 
    }));

    try {
      const { error } = await supabase.from('job_applications').update({ status: targetStage }).eq('id', id); 
      if (error) throw error;
      toast.success(`Moved to ${targetStage}`, { icon: '🔄' });
    } catch (error) {
      console.error("Failed to update status:", error);
      toast.error("Failed to move candidate.");
      fetchPipelineData(); // Revert on failure
    }
  };

  const handleOutreach = async (e: React.MouseEvent, candidate: any) => {
    e.stopPropagation(); 
    const destinationEmail = candidate.email || "add-email-here@example.com";
    setDraftingId(candidate.id); 

    try {
      // 🚀 FETCH AND VERIFY SESSION
      const { data: { session } } = await supabase.auth.getSession();

      if (!session?.access_token) {
        toast.error("Session expired. Please log out and log back in.");
        setDraftingId(null);
        return;
      }

      const response = await fetch(`${API_URL}/api/generate-outreach`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}` 
        },
        body: JSON.stringify({
          candidate_name: candidate.name,
          candidate_summary: candidate.summary || "Experienced professional in the field.",
          job_title: activeJob?.title || "Open Role"
        })
      });

      if (!response.ok) throw new Error("Failed to generate email");
      const data = await response.json();
      
      setEmailModal({
        candidate: { ...candidate, email: destinationEmail },
        subject: `Regarding your experience and the ${activeJob?.title} role`,
        body: data.email_body
      });
    } catch (error) {
      console.error("AI Email Error:", error);
      toast.error("The AI failed to draft the email.");
    } finally {
      setDraftingId(null); 
    }
  };

  const executeSendEmail = async () => {
    if (!emailModal) return;
    const targetEmail = emailModal.candidate.email !== "update-email@example.com" 
                      ? emailModal.candidate.email : "test-candidate@example.com"; 

    try {
      // 🚀 FETCH AND VERIFY SESSION
      const { data: { session } } = await supabase.auth.getSession();

      if (!session?.access_token) {
        toast.error("Session expired. Please log out and log back in.");
        return;
      }

      const response = await fetch(`${API_URL}/api/send-outreach`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}` 
        },
        body: JSON.stringify({
          to_email: targetEmail,
          subject: emailModal.subject,
          body: emailModal.body
        })
      });

      if (!response.ok) throw new Error("Failed to send email");
      
      toast.success(`Email sent to ${emailModal.candidate.name}!`, { style: { background: '#1e293b', color: '#fff' }});
      
      // Instantly update UI to show outbound status
      setCommunications(prev => ({ ...prev, [emailModal.candidate.candidate_id || emailModal.candidate.id]: 'outbound' }));
      setEmailModal(null); 
    } catch (error) {
      console.error("Email API Error:", error);
      toast.error("Failed to send email. Check your server logs.");
    }
  };

  const saveAssessment = async () => {
    if (!assessmentModal) return;
    setIsSavingAssessment(true);

    try {
      const payload = {
        assessment_status: assessmentData.status,
        assessment_link: assessmentData.link || null,
        assessment_score: assessmentData.score ? parseInt(assessmentData.score) : null
      };

      const { error } = await supabase.from('job_applications').update(payload).eq('id', assessmentModal.id);
      if (error) throw error;

      if (assessmentData.status === 'Sent' && assessmentData.link) {
        toast.success(`Assessment sent to ${assessmentModal.name}!`);
      }

      setColumns(prev => {
        const stage = assessmentModal.status || 'Assessment';
        const updatedList = prev[stage].map(c => c.id === assessmentModal.id ? { ...c, ...payload } : c);
        return { ...prev, [stage]: updatedList };
      });
      
      toast.success("Assessment saved successfully.");
      setAssessmentModal(null);
    } catch (error) {
      console.error("Failed to save assessment:", error);
      toast.error("Could not save assessment details.");
    } finally {
      setIsSavingAssessment(false);
    }
  };

  const openAssessment = (e: React.MouseEvent, candidate: any) => {
    e.stopPropagation();
    setAssessmentData({
      score: candidate.assessment_score?.toString() || '',
      link: candidate.assessment_link || '',
      status: candidate.assessment_status || 'Pending'
    });
    setAssessmentModal(candidate);
  };

  if (loading) {
    return (
      <div className="flex h-[600px] items-center justify-center">
        <Loader2 size={32} className="animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="relative flex flex-col h-[650px]">
      <Toaster position="bottom-right" reverseOrder={false} />
      
      {/* Action Bar */}
      <div className="flex justify-between items-center mb-4 px-1">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setSortBy(prev => prev === 'match' ? 'date' : 'match')}
            className="flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900 bg-white border border-slate-200 px-3 py-1.5 rounded-md transition-colors"
          >
            <ArrowUpDown size={14} /> 
            Sort by: {sortBy === 'match' ? 'Match Score' : 'Date Applied'}
          </button>
        </div>
      </div>

      {/* Board */}
      <div className="flex gap-4 overflow-x-auto pb-4 w-full flex-1">
        {STAGES.map(stage => (
          <div 
            key={stage}
            className="flex flex-col bg-slate-100 rounded-lg min-w-[320px] w-[320px] shrink-0 border border-slate-200"
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, stage)}
          >
            <div className="p-3 flex justify-between items-center border-b border-slate-200 bg-slate-50/50 rounded-t-lg">
              <h3 className="font-bold text-slate-700 text-sm">{stage}</h3>
              <span className="bg-slate-200 text-slate-600 px-2 py-0.5 rounded text-xs font-bold">
                {columns[stage].length}
              </span>
            </div>

            <div className="flex-1 p-3 overflow-y-auto space-y-3">
              {getSortedColumn(stage).map(candidate => {
                const isSelected = selectedCandidates.includes(candidate.id);
                const commStatus = communications[candidate.candidate_id || candidate.id];

                return (
                <div 
                  key={candidate.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, candidate.id, stage)}
                  onDragEnd={handleDragEnd}
                  onClick={() => onCandidateClick(candidate)}
                  className={`relative bg-white p-4 rounded-lg shadow-sm border cursor-grab active:cursor-grabbing hover:shadow-md transition-all group ${isSelected ? 'border-blue-500 ring-1 ring-blue-500' : 'border-slate-200 hover:border-blue-300'}`}
                >
                  {/* 🚀 NEW: Pulsing Indicator for Inbound Replies on the Kanban Board */}
                  {commStatus === 'replied' && (
                     <div className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 bg-green-500 rounded-full border-2 border-white shadow-sm animate-pulse z-10" title="New Reply from Candidate!" />
                  )}

                  {/* Bulk Select Checkbox */}
                  <div 
                    onClick={(e) => toggleSelection(e, candidate.id)}
                    className={`absolute top-3 right-3 z-10 transition-opacity ${isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
                  >
                    <CheckSquare size={18} className={isSelected ? 'text-blue-600' : 'text-slate-300 hover:text-slate-400'} />
                  </div>

                  <div className="pr-6">
                    <h4 className="font-bold text-slate-900 text-sm truncate">{candidate.name}</h4>
                    <p className="text-xs text-slate-500 mt-0.5 truncate">{candidate.role}</p>
                  </div>
                  
                  <div className="flex items-center gap-2 mt-3 text-xs font-medium flex-wrap">
                    <div className={`flex items-center gap-1 px-2 py-1 rounded border ${candidate.match_score >= 90 ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-slate-50 border-slate-200 text-slate-600'}`}>
                      <Sparkles size={12} /> {candidate.match_score || candidate.match || 0}%
                    </div>
                    
                    {/* Communication Badges */}
                    {commStatus === 'replied' && (
                      <span className="flex items-center gap-1 px-2 py-1 bg-green-50 text-green-700 border border-green-200 rounded font-bold">
                        <Reply size={12} /> Replied
                      </span>
                    )}
                    {commStatus === 'outbound' && (
                      <span className="flex items-center gap-1 px-2 py-1 bg-amber-50 text-amber-700 border border-amber-200 rounded">
                        <Mail size={12} /> Emailed
                      </span>
                    )}
                  </div>

                  <div className="mt-4 flex gap-2 pt-3 border-t border-slate-100">
                    {stage === 'Sourcing' && (
                      <button 
                        onClick={(e) => handleOutreach(e, candidate)}
                        disabled={draftingId === candidate.id}
                        className="flex-1 bg-white border border-slate-200 text-slate-600 text-xs py-1.5 rounded hover:bg-slate-50 flex justify-center items-center gap-1 transition-colors disabled:opacity-50"
                      >
                        {draftingId === candidate.id ? <Loader2 size={12} className="animate-spin" /> : <Mail size={12} />}
                        Draft Email
                      </button>
                    )}
                    {stage === 'Assessment' && (
                      <button 
                        onClick={(e) => openAssessment(e, candidate)} 
                        className="flex-1 bg-purple-100 text-purple-700 border border-purple-200 hover:bg-purple-200 text-xs py-1.5 rounded flex justify-center items-center gap-1 font-semibold transition-colors"
                      >
                        <ClipboardCheck size={12} /> Assessment
                      </button>
                    )}
                    {stage === 'Interview' && (
                      <button onClick={(e) => e.stopPropagation()} className="flex-1 bg-blue-600 text-white text-xs py-1.5 rounded hover:bg-blue-700 flex justify-center items-center gap-1 font-semibold">
                        <Calendar size={12} /> Schedule
                      </button>
                    )}
                  </div>
                </div>
              )})}

              {columns[stage].length === 0 && (
                <div className="h-24 border-2 border-dashed border-slate-300 rounded-lg flex items-center justify-center text-slate-400 text-xs font-medium">
                  Drop candidate here
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Floating Bulk Action Bar */}
      {selectedCandidates.length > 0 && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-slate-900 text-white px-6 py-3 rounded-full shadow-2xl flex items-center gap-6 animate-in slide-in-from-bottom-8 z-50">
          <div className="flex items-center gap-2 font-semibold text-sm">
            <Users size={16} className="text-blue-400" />
            {selectedCandidates.length} Selected
          </div>
          <div className="w-px h-5 bg-slate-700" />
          <div className="flex items-center gap-2">
            <button onClick={() => toast("Bulk Email Coming Soon!", { icon: '🚀' })} className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 rounded text-sm font-medium transition-colors">
              Outreach All
            </button>
            <button onClick={() => setSelectedCandidates([])} className="px-3 py-1.5 text-slate-300 hover:text-white hover:bg-slate-800 rounded text-sm font-medium transition-colors">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Email Modal */}
      {emailModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col">
            <div className="flex justify-between items-center px-6 py-4 border-b border-slate-100 bg-slate-50">
              <h3 className="font-bold text-slate-800 flex items-center gap-2">
                <Sparkles size={16} className="text-blue-600" /> Review AI Outreach
              </h3>
              <button onClick={() => setEmailModal(null)} className="text-slate-400 hover:text-slate-600 p-1">
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 flex flex-col gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1 uppercase tracking-wider">To</label>
                <div className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-md text-sm text-slate-700 font-medium">
                  {emailModal.candidate.name} &lt;{emailModal.candidate.email}&gt;
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1 uppercase tracking-wider">Subject</label>
                <input 
                  type="text" 
                  value={emailModal.subject}
                  onChange={(e) => setEmailModal({...emailModal, subject: e.target.value})}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-md text-sm text-slate-800 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1 uppercase tracking-wider">Message Body</label>
                <textarea 
                  value={emailModal.body}
                  onChange={(e) => setEmailModal({...emailModal, body: e.target.value})}
                  rows={10}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-md text-sm text-slate-800 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 resize-none"
                />
              </div>
            </div>

            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
              <button 
                onClick={() => setEmailModal(null)}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200 rounded-md transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={executeSendEmail}
                className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-md flex items-center gap-2 transition-colors shadow-sm"
              >
                <Send size={16} /> Send Email
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Assessment Tracking Modal */}
      {assessmentModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col">
            <div className="flex justify-between items-center px-6 py-4 border-b border-slate-100 bg-slate-50">
              <h3 className="font-bold text-slate-800 flex items-center gap-2">
                <ClipboardCheck size={18} className="text-purple-600" />
                Assessment: {assessmentModal.name}
              </h3>
              <button onClick={() => setAssessmentModal(null)} className="text-slate-400 hover:text-slate-600 p-1">
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 flex flex-col gap-5">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1 uppercase tracking-wider">Status</label>
                  <select 
                    value={assessmentData.status}
                    onChange={(e) => setAssessmentData({...assessmentData, status: e.target.value})}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-md text-sm text-slate-800 outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
                  >
                    <option value="Pending">Pending</option>
                    <option value="Sent">Link Sent</option>
                    <option value="Completed">Completed</option>
                    <option value="Graded">Graded</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1 uppercase tracking-wider">Score (0-100)</label>
                  <input 
                    type="number"
                    min="0"
                    max="100"
                    value={assessmentData.score}
                    onChange={(e) => setAssessmentData({...assessmentData, score: e.target.value})}
                    placeholder="e.g. 85"
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-md text-sm text-slate-800 outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1 uppercase tracking-wider">External Link (Optional)</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <LinkIcon size={14} className="text-slate-400" />
                  </div>
                  <input 
                    type="url" 
                    value={assessmentData.link}
                    onChange={(e) => setAssessmentData({...assessmentData, link: e.target.value})}
                    placeholder="https://hackerrank.com/..."
                    className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-md text-sm text-slate-800 outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
                  />
                </div>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
              <button 
                onClick={() => setAssessmentModal(null)}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200 rounded-md transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={saveAssessment}
                disabled={isSavingAssessment}
                className="px-6 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium rounded-md flex items-center gap-2 transition-colors shadow-sm disabled:opacity-50"
              >
                {isSavingAssessment ? <Loader2 size={16} className="animate-spin" /> : <ClipboardCheck size={16} />}
                {isSavingAssessment ? 'Saving...' : 'Save Assessment'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}