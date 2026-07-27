import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient'; // 🚀 Required for direct pipeline updates

export default function CandidateModal({ 
  candidate, 
  activeJob, 
  onCandidateUpdated, 
  onClose 
}: { 
  candidate: any, 
  activeJob?: any, 
  onCandidateUpdated?: (c: any) => void, 
  onClose: () => void 
}) {
  if (!candidate) return null;

  // 🚀 Dynamically pull from your .env file
  const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL; 
  const BUCKET_NAME = import.meta.env.VITE_SUPABASE_BUCKET || "resumes"; 
  const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

  const candidateId = candidate.id || candidate._id;

  // --- STATE MANAGEMENT ---
  const [activeTab, setActiveTab] = useState<'profile' | 'workspace' | 'communications'>('profile');
  
  // 🚀 SMART CONTEXT STATES
  const [localActiveJob, setLocalActiveJob] = useState<any>(activeJob || null);
  const [candidateApplications, setCandidateApplications] = useState<any[]>([]);

  // HR Workspace State
  const [notes, setNotes] = useState<any[]>([]);
  const [newNote, setNewNote] = useState("");
  const [tags, setTags] = useState<string[]>(candidate.tags || []);
  const [newTag, setNewTag] = useState("");
  const [selectedTagColor, setSelectedTagColor] = useState<string>("auto"); 
  const [isSavingNote, setIsSavingNote] = useState(false);

  // Communications State
  const [communications, setCommunications] = useState<any[]>([]);
  const [newEmailSubject, setNewEmailSubject] = useState("");
  const [newEmailBody, setNewEmailBody] = useState("");
  const [isSendingEmail, setIsSendingEmail] = useState(false);

  // Pipeline Status State
  const [currentStatus, setCurrentStatus] = useState(candidate.status || 'Sourcing');
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);

  // 🚀 DYNAMIC TAG COLOR ENGINE
  const getTagStyle = (tag: string) => {
    const t = tag.toLowerCase();
    if (t.includes('do not hire') || t.includes('reject') || t.includes('red flag')) 
      return 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100';
    if (t.includes('hire') || t.includes('top tier') || t.includes('strong') || t.includes('offer')) 
      return 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100';
    if (t.includes('relocat') || t.includes('visa') || t.includes('remote')) 
      return 'bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100';
    if (t.includes('interview') || t.includes('screen') || t.includes('pending') || t.includes('hold')) 
      return 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100';
    
    return 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100'; // Default Blue
  };

  const parseTag = (rawTag: string) => {
    const [text, customColor] = rawTag.split('::');
    
    let style = '';
    const COLOR_CLASSES: Record<string, string> = {
      red: 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100',
      green: 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100',
      purple: 'bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100',
      yellow: 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100',
      gray: 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200',
      blue: 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100'
    };

    if (customColor && COLOR_CLASSES[customColor]) {
      style = COLOR_CLASSES[customColor];
    } else {
      style = getTagStyle(text);
    }
    return { text, style, raw: rawTag };
  };

  // 🚀 SMART CONTEXT DETECTIVE
  useEffect(() => {
    if (activeJob) {
      setLocalActiveJob(activeJob);
      setCurrentStatus(candidate.status || 'Sourcing');
      return;
    }

    const fetchCandidateContexts = async () => {
      try {
        const { data: appsData, error: appsError } = await supabase
          .from('job_applications')
          .select('*')
          .eq('candidate_id', candidateId);

        if (appsError) throw appsError;

        if (appsData && appsData.length > 0) {
          const jobIds = appsData.map(app => app.job_id).filter(Boolean);
          
          const { data: jobsData } = await supabase
            .from('jobs')
            .select('id, title')
            .in('id', jobIds);

          const formattedApps = appsData.map((app: any) => {
            const matchedJob = jobsData?.find(j => j.id === app.job_id);
            return {
              id: app.job_id,
              title: matchedJob?.title || `Job ID: ${app.job_id}`,
              status: app.status || 'Sourcing'
            };
          });

          setCandidateApplications(formattedApps);
          setLocalActiveJob(formattedApps[0]); 
          setCurrentStatus(formattedApps[0].status);
        }
      } catch (err) {
        console.error("Context Detective Error:", err);
      }
    };

    fetchCandidateContexts();
  }, [activeJob, candidateId, candidate.status]);

  useEffect(() => {
    if (activeTab === 'workspace') {
      fetchNotes();
    } else if (activeTab === 'communications') {
      fetchCommunications();
    }
  }, [activeTab, candidateId, localActiveJob]);

  // --- API ROUTINES ---
  const fetchNotes = async () => {
    try {
      const res = await fetch(`${API_URL}/api/candidates/${candidateId}/notes`);
      if (res.ok) {
        const data = await res.json();
        setNotes(data.notes || []);
      }
    } catch (error) {
      console.error("Failed to load notes", error);
    }
  };

  const fetchCommunications = async () => {
    try {
      const targetJobId = localActiveJob?.id;
      const url = targetJobId 
        ? `${API_URL}/api/communications/${candidateId}?job_id=${targetJobId}`
        : `${API_URL}/api/communications/${candidateId}`;

      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setCommunications(data.communications || data || []);
      }
    } catch (error) {
      console.error("Failed to load communications", error);
    }
  };

  const handleSaveNote = async () => {
    if (!newNote.trim()) return;
    setIsSavingNote(true);
    try {
      const res = await fetch(`${API_URL}/api/candidates/${candidateId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ author_name: "Recruiter", note_text: newNote })
      });
      if (res.ok) {
        setNewNote("");
        fetchNotes();
      }
    } catch (error) {
      console.error("Failed to save note", error);
    } finally {
      setIsSavingNote(false);
    }
  };

  const handleSendEmail = async () => {
    if (!newEmailBody.trim()) return;
    setIsSendingEmail(true);
    try {
      const res = await fetch(`${API_URL}/api/communications/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            candidate_id: candidateId,
            job_id: localActiveJob?.id, 
            subject: newEmailSubject || `Update regarding your application`,
            body: newEmailBody
        })
      });
      if (res.ok) {
        setNewEmailBody("");
        setNewEmailSubject("");
        fetchCommunications(); 
      }
    } catch (error) {
      console.error("Failed to send email", error);
    } finally {
      setIsSendingEmail(false);
    }
  };

  const handleAddTag = async (e: React.KeyboardEvent | React.MouseEvent) => {
    if ((e.type === 'keydown' && (e as React.KeyboardEvent).key !== 'Enter') || !newTag.trim()) return;
    
    e.preventDefault();
    
    const baseText = newTag.trim().toLowerCase();
    const finalTag = selectedTagColor === 'auto' ? baseText : `${baseText}::${selectedTagColor}`;

    if (tags.includes(finalTag)) {
        setNewTag("");
        return; 
    }

    const updatedTags = [...tags, finalTag];
    setTags(updatedTags); 
    setNewTag("");

    try {
      await fetch(`${API_URL}/api/candidates/${candidateId}/tags`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tags: updatedTags })
      });
    } catch (error) {
      console.error("Failed to save tags", error);
    }
  };

  const handleRemoveTag = async (rawTagToRemove: string) => {
    const updatedTags = tags.filter(t => t !== rawTagToRemove);
    setTags(updatedTags); 

    try {
      await fetch(`${API_URL}/api/candidates/${candidateId}/tags`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tags: updatedTags })
      });
    } catch (error) {
      console.error("Failed to remove tag", error);
    }
  };

  const handleStageChange = async (newStatus: string) => {
    if (!localActiveJob?.id) {
      alert("Active job context missing. Cannot update pipeline status.");
      return;
    }
    
    setIsUpdatingStatus(true);
    
    try {
      const { error } = await supabase
        .from('job_applications')
        .update({ status: newStatus })
        .eq('candidate_id', candidateId)
        .eq('job_id', localActiveJob.id);

      if (error) throw error;

      setCurrentStatus(newStatus);
      
      if (onCandidateUpdated) {
        onCandidateUpdated({ ...candidate, status: newStatus });
      }

    } catch (error: any) {
      console.error("Error updating pipeline stage:", error);
      alert(`Failed to move candidate: ${error.message}`);
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  // 🚀 URL SANITIZATION
  const cleanSupabaseUrl = (SUPABASE_URL || '').replace(/['"]/g, '').trim();

  let rawPdfUrl = candidate.resume_url;
  if (!rawPdfUrl && candidate.filename) {
    const baseUrl = cleanSupabaseUrl.replace(/\/$/, '');
    rawPdfUrl = `${baseUrl}/storage/v1/object/public/${BUCKET_NAME}/${encodeURIComponent(candidate.filename)}`;
  }

  let pdfUrl = null;
  if (rawPdfUrl) {
    let cleaned = rawPdfUrl.replace(/['"\s]+/g, '');
    if (!cleaned.startsWith('http://') && !cleaned.startsWith('https://')) {
      cleaned = `https://${cleaned.replace(/^[:/]+/, '')}`;
    }
    pdfUrl = cleaned;
  }

  const formatEmailDate = (dateString: string) => {
    if (!dateString) return "Just now";
    try {
      const d = new Date(dateString);
      if (isNaN(d.getTime())) return "Unknown Date";
      return d.toLocaleString('en-US', { 
        month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' 
      });
    } catch {
      return "Unknown Date";
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-6">
      <div className="bg-white w-full max-w-7xl h-[90vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200">
        
        {/* ================= HEADER ================= */}
        <div className="flex items-start justify-between px-8 py-6 border-b border-slate-200 bg-slate-50 relative">
          <div className="flex-1 pr-6">
            
            <div className="mb-3">
              <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight flex items-center gap-3">
                {candidate.name || "Unknown Candidate"}
                <div className="flex gap-1.5">
                    {tags.map((rawTag, i) => {
                        const { text, style } = parseTag(rawTag);
                        return (
                            <span key={i} className={`px-2.5 py-0.5 text-[10px] font-black rounded-full uppercase tracking-wider border ${style}`}>
                                #{text}
                            </span>
                        );
                    })}
                </div>
              </h2>
              {candidate.segmentation?.standardized_title && (
                <p className="text-lg font-medium text-indigo-600 mt-1">
                  {candidate.segmentation.standardized_title}
                </p>
              )}
            </div>
            
            <div className="flex flex-wrap items-center gap-2 mb-4">
              {candidate.location && (
                <span className="px-2.5 py-1 bg-slate-200 text-slate-700 border border-slate-300 text-xs font-bold rounded uppercase tracking-wide">
                  📍 {candidate.location}
                </span>
              )}
              {candidate.total_experience_years !== undefined && (
                <span className="px-2.5 py-1 bg-slate-800 text-white text-xs font-bold rounded uppercase tracking-wide shadow-sm">
                  {candidate.total_experience_years} {candidate.total_experience_years === 1 ? 'Year' : 'Years'} Exp
                </span>
              )}
              {candidate.segmentation?.seniority_level && (
                <span className="px-2.5 py-1 bg-indigo-50 text-indigo-700 border border-indigo-100 text-xs font-bold rounded uppercase tracking-wide">
                  {candidate.segmentation.seniority_level}
                </span>
              )}
              {candidate.segmentation?.department && (
                <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-100 text-xs font-bold rounded uppercase tracking-wide">
                  {candidate.segmentation.department}
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {candidate.email && (
                <a href={`mailto:${candidate.email}`} className="px-2.5 py-1.5 bg-white border border-slate-200 text-slate-600 text-xs font-semibold rounded-md hover:bg-blue-50 hover:text-blue-600 transition-colors flex items-center gap-1.5 shadow-sm">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path></svg>
                  {candidate.email}
                </a>
              )}
              {candidate.phone && (
                <a href={`tel:${candidate.phone}`} className="px-2.5 py-1.5 bg-white border border-slate-200 text-slate-600 text-xs font-semibold rounded-md hover:bg-blue-50 hover:text-blue-600 transition-colors flex items-center gap-1.5 shadow-sm">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"></path></svg>
                  {candidate.phone}
                </a>
              )}
              {candidate.social_links && candidate.social_links.map((link: any, i: number) => (
                <a key={i} href={link.url} target="_blank" rel="noopener noreferrer" className="px-2.5 py-1.5 bg-white border border-slate-200 text-slate-600 text-xs font-semibold rounded-md hover:bg-blue-50 hover:text-blue-600 transition-colors flex items-center gap-1.5 shadow-sm">
                  🔗 {link.platform} ↗
                </a>
              ))}
            </div>
          </div>

          <div className="flex flex-col items-end gap-4">
            <button onClick={onClose} className="p-2 bg-white border border-slate-200 rounded-full hover:bg-red-50 hover:text-red-600 transition-colors shadow-sm">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
            </button>

            {(candidate.email_received_at || candidate.email_sender) && (
              <div className="bg-white border border-slate-200 shadow-sm rounded-lg p-3 w-72 text-left">
                <div className="flex items-center gap-2 mb-2 pb-2 border-b border-slate-100">
                  <div className="bg-blue-100 text-blue-600 p-1.5 rounded flex items-center justify-center">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"></path></svg>
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-800">Source: Gmail Inbox</h4>
                    <p className="text-[10px] text-slate-500 font-medium">{candidate.email_received_at ? formatEmailDate(candidate.email_received_at) : 'Unknown Date'}</p>
                  </div>
                </div>
                {candidate.email_sender && (
                  <p className="text-xs text-slate-600 truncate" title={candidate.email_sender}>
                    <span className="text-slate-400 font-medium">From: </span> {candidate.email_sender}
                  </p>
                )}
                {candidate.email_subject && (
                  <p className="text-xs text-slate-600 truncate mt-1" title={candidate.email_subject}>
                    <span className="text-slate-400 font-medium">Subj: </span> {candidate.email_subject}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ================= BODY - SPLIT VIEW ================= */}
        <div className="flex-1 flex overflow-hidden">
          
          {/* LEFT SIDE: Data / Workspace / Communications Toggle */}
          <div className="w-1/2 flex flex-col border-r border-slate-200 bg-white">
            
            {/* 🚀 Navigation Tabs */}
            <div className="flex border-b border-slate-200 bg-slate-50 shrink-0">
                <button 
                  onClick={() => setActiveTab('profile')}
                  className={`flex-1 py-3 text-[11px] font-bold uppercase tracking-wider transition-colors border-b-2 ${activeTab === 'profile' ? 'border-blue-600 text-blue-700 bg-white' : 'border-transparent text-slate-500 hover:bg-slate-100'}`}
                >
                  Candidate Profile
                </button>
                <button 
                  onClick={() => setActiveTab('workspace')}
                  className={`flex-1 py-3 text-[11px] font-bold uppercase tracking-wider transition-colors border-b-2 ${activeTab === 'workspace' ? 'border-blue-600 text-blue-700 bg-white' : 'border-transparent text-slate-500 hover:bg-slate-100'}`}
                >
                  HR Workspace
                </button>
                <button 
                  onClick={() => setActiveTab('communications')}
                  className={`flex-1 py-3 text-[11px] font-bold uppercase tracking-wider transition-colors border-b-2 ${activeTab === 'communications' ? 'border-blue-600 text-blue-700 bg-white' : 'border-transparent text-slate-500 hover:bg-slate-100'}`}
                >
                  Communications
                </button>
            </div>

            {/* TAB 1: PROFILE */}
            {activeTab === 'profile' && (
              <div className="p-8 overflow-y-auto custom-scrollbar flex-1">
                
                <div className="mb-8">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">AI Executive Summary</h3>
                  <p className="text-slate-700 text-sm leading-relaxed bg-slate-50 p-4 rounded-xl border border-slate-100">
                    {candidate.summary || "No summary available."}
                  </p>
                </div>

                {/* 🚀 ADVANCED WORK EXPERIENCE TIMELINE */}
                <div className="mb-10">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-5 flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path></svg>
                    Professional Experience
                  </h3>
                  <div className="flex flex-col gap-8 relative border-l-2 border-slate-100 ml-4 pl-8">
                    {candidate.work_experience && candidate.work_experience.length > 0 ? (
                      candidate.work_experience.map((exp: any, i: number) => (
                        <div key={i} className="relative group">
                          {/* 🚀 Dynamic Company Avatar */}
                          <div className="absolute -left-[49px] top-0 w-10 h-10 rounded-xl bg-white border border-slate-200 shadow-sm flex items-center justify-center text-xs font-black text-slate-600 uppercase group-hover:border-blue-400 group-hover:text-blue-600 transition-colors">
                            {exp.company ? exp.company.substring(0, 2) : '💼'}
                          </div>
                          
                          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-1 mb-2">
                            <div>
                                <h4 className="text-base font-extrabold text-slate-900">
                                  {exp.job_title}
                                </h4>
                                <p className="text-sm font-semibold text-blue-600 flex items-center gap-2">
                                  {exp.company}
                                </p>
                            </div>
                            {/* 🚀 Sleek Duration Badge */}
                            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-2.5 py-1 rounded-md mt-1 md:mt-0">
                                <svg className="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                                <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                                    {exp.start_date ? `${exp.start_date} - ${exp.end_date || 'Present'}` : (exp.duration || exp.date)}
                                </span>
                            </div>
                          </div>
                          
                          {exp.description && (
                            <div className="text-sm text-slate-600 leading-relaxed bg-slate-50/50 p-3.5 rounded-lg border border-slate-100">
                                {exp.description}
                            </div>
                          )}
                        </div>
                      ))
                    ) : <span className="text-slate-500 italic">No experience extracted.</span>}
                  </div>
                </div>

                {/* 🚀 EDUCATION SECTION */}
                {candidate.education && candidate.education.length > 0 && (
                  <div className="mb-10">
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-5 flex items-center gap-2">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 14l9-5-9-5-9 5 9 5z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z"></path></svg>
                      Education
                    </h3>
                    <div className="flex flex-col gap-5 relative border-l-2 border-slate-100 ml-4 pl-8">
                      {candidate.education.map((edu: any, i: number) => (
                        <div key={i} className="relative group">
                          <div className="absolute -left-[41px] top-1 w-6 h-6 rounded-full bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-500">
                            🎓
                          </div>
                          <div>
                            <h4 className="text-sm font-extrabold text-slate-900">{edu.degree || 'Degree'}</h4>
                            <p className="text-xs font-semibold text-indigo-600 mt-0.5">{edu.institution || 'Unknown Institution'}</p>
                            {(edu.year || edu.score) && (
                              <p className="text-[11px] font-medium text-slate-500 mt-1">
                                {edu.year} {edu.year && edu.score ? '•' : ''} {edu.score}
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 🚀 PROJECTS SECTION */}
                {candidate.projects && candidate.projects.length > 0 && (
                  <div className="mb-10">
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-5 flex items-center gap-2">
                       <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"></path></svg>
                      Key Projects
                    </h3>
                    <div className="grid grid-cols-1 gap-4">
                      {candidate.projects.map((proj: any, i: number) => {
                        const projName = typeof proj === 'string' ? proj : proj.name || 'Project';
                        const projDesc = typeof proj === 'object' ? proj.description : null;
                        
                        return (
                          <div key={i} className="bg-slate-50 border border-slate-200 p-4 rounded-xl hover:border-blue-300 transition-colors">
                            <h4 className="text-sm font-bold text-slate-800">{projName}</h4>
                            {projDesc && <p className="text-xs text-slate-600 mt-2 leading-relaxed">{projDesc}</p>}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Skills (Hard, Soft, Languages, Interests) */}
                <div className="mb-8">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"></path></svg>
                    Skills & Attributes
                  </h3>
                  <div className="flex flex-col gap-5">
                    {candidate.technical_skills && candidate.technical_skills.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-slate-500 mb-2">Technical Skills</p>
                        <div className="flex flex-wrap gap-1.5">
                          {candidate.technical_skills.map((skill: string, i: number) => (
                            <span key={i} className="px-2.5 py-1 bg-slate-100 text-slate-700 text-[11px] font-bold rounded shadow-sm border border-slate-200">
                              {skill}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {candidate.soft_skills && candidate.soft_skills.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-slate-500 mb-2">Soft Skills</p>
                        <div className="flex flex-wrap gap-1.5">
                          {candidate.soft_skills.map((skill: string, i: number) => (
                            <span key={i} className="px-2.5 py-1 bg-emerald-50 text-emerald-700 text-[11px] font-bold rounded shadow-sm border border-emerald-100">
                              {skill}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {/* 🚀 LANGUAGES */}
                    {candidate.languages && candidate.languages.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-slate-500 mb-2">Languages</p>
                        <div className="flex flex-wrap gap-1.5">
                          {candidate.languages.map((lang: string, i: number) => (
                            <span key={i} className="px-2.5 py-1 bg-indigo-50 text-indigo-700 text-[11px] font-bold rounded shadow-sm border border-indigo-100">
                              {lang}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {/* 🚀 INTERESTS */}
                    {candidate.interests && candidate.interests.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-slate-500 mb-2">Interests</p>
                        <div className="flex flex-wrap gap-1.5">
                          {candidate.interests.map((interest: string, i: number) => (
                            <span key={i} className="px-2.5 py-1 bg-purple-50 text-purple-700 text-[11px] font-bold rounded shadow-sm border border-purple-100">
                              {interest}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

              </div>
            )}

            {/* TAB 2: HR WORKSPACE */}
            {activeTab === 'workspace' && (
                <div className="flex-1 flex flex-col p-8 bg-slate-50/50 overflow-hidden">
                    <div className="mb-8 shrink-0">
                        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"></path></svg>
                            Smart Candidate Tags
                        </h3>
                        <div className="flex flex-wrap items-center gap-2 mb-4">
                            {tags.map((rawTag, idx) => {
                                const { text, style } = parseTag(rawTag);
                                return (
                                    <div key={idx} className={`flex items-center gap-1.5 px-3 py-1 text-xs font-bold rounded-full border transition-colors ${style}`}>
                                        <span>{text}</span>
                                        <button onClick={() => handleRemoveTag(rawTag)} className="hover:bg-black/10 rounded-full p-0.5 transition-colors">
                                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12"></path></svg>
                                        </button>
                                    </div>
                                );
                            })}
                        </div>

                        <div className="flex flex-col gap-2">
                            <div className="flex items-center gap-2">
                                <input 
                                    type="text" 
                                    value={newTag}
                                    onChange={(e) => setNewTag(e.target.value)}
                                    onKeyDown={handleAddTag}
                                    placeholder="Add a tag (e.g. Reject, Strong, Relocating)..." 
                                    className="flex-1 px-4 py-2.5 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none shadow-sm"
                                />
                                <button onClick={handleAddTag} className="px-5 py-2.5 bg-slate-800 hover:bg-slate-900 text-white text-sm font-bold rounded-lg transition-colors shadow-sm">
                                    Add Tag
                                </button>
                            </div>
                            <div className="flex items-center gap-3 px-1 mt-1">
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Color:</span>
                                {[
                                    { value: 'auto', bg: 'bg-gradient-to-r from-blue-200 to-purple-200', title: 'Auto (Rule-Based)' },
                                    { value: 'red', bg: 'bg-red-500', title: 'Red' },
                                    { value: 'green', bg: 'bg-emerald-500', title: 'Green' },
                                    { value: 'yellow', bg: 'bg-amber-500', title: 'Yellow' },
                                    { value: 'purple', bg: 'bg-purple-500', title: 'Purple' },
                                    { value: 'gray', bg: 'bg-slate-400', title: 'Gray' }
                                ].map(c => (
                                    <button
                                        key={c.value}
                                        onClick={() => setSelectedTagColor(c.value)}
                                        className={`w-4 h-4 rounded-full ${c.bg} transition-all duration-200 ${selectedTagColor === c.value ? 'ring-2 ring-offset-1 ring-slate-800 scale-125 shadow-sm' : 'opacity-50 hover:opacity-100 hover:scale-110'}`}
                                        title={c.title}
                                    />
                                ))}
                            </div>
                        </div>
                    </div>

                    <hr className="border-slate-200 mb-8 shrink-0" />

                    <div className="flex-1 flex flex-col min-h-0">
                        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 shrink-0 flex items-center gap-2">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
                            Interview & HR Notes
                        </h3>
                        
                        <div className="mb-6 relative shrink-0">
                            <textarea 
                                value={newNote}
                                onChange={(e) => setNewNote(e.target.value)}
                                placeholder="Type your interview notes, technical feedback, or thoughts here..." 
                                className="w-full px-4 py-3 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none resize-none bg-white shadow-sm"
                                rows={4}
                            />
                            <button 
                                onClick={handleSaveNote}
                                disabled={isSavingNote || !newNote.trim()}
                                className="absolute bottom-3 right-3 px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white text-xs font-bold rounded shadow-sm transition-colors"
                            >
                                {isSavingNote ? 'Saving...' : 'Save Note'}
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-4">
                            {notes.length === 0 ? (
                                <div className="text-center py-10 bg-slate-100/50 rounded-xl border border-slate-200 border-dashed text-slate-400 italic text-sm">
                                    No notes have been added yet. Be the first to leave feedback!
                                </div>
                            ) : (
                                notes.map((note: any) => (
                                    <div key={note.id} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm relative hover:border-slate-300 transition-colors">
                                        <div className="flex justify-between items-center mb-2">
                                            <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                                                <div className="w-5 h-5 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center text-[9px] uppercase">
                                                    {note.author_name.substring(0, 2)}
                                                </div>
                                                {note.author_name}
                                            </span>
                                            <span className="text-[10px] font-medium text-slate-400">{formatEmailDate(note.created_at)}</span>
                                        </div>
                                        <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap ml-6">
                                            {note.note_text}
                                        </p>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* TAB 3: COMMUNICATIONS */}
            {activeTab === 'communications' && (
                <div className="flex-1 flex flex-col bg-slate-50 overflow-hidden">
                    
                    <div className="bg-white border-b border-slate-200 p-4 shadow-sm flex flex-wrap gap-4 items-center justify-between shrink-0">
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
                          
                          {!activeJob && candidateApplications.length > 0 ? (
                            <div className="flex items-center gap-2">
                                <span className="text-slate-400 font-medium">Context:</span>
                                <select 
                                  className="bg-slate-50 border border-slate-200 text-blue-700 font-bold rounded px-2 py-1 outline-none cursor-pointer hover:border-blue-300"
                                  value={localActiveJob?.id || ''}
                                  onChange={(e) => {
                                    const selected = candidateApplications.find(a => a.id === e.target.value);
                                    if (selected) {
                                      setLocalActiveJob(selected);
                                      setCurrentStatus(selected.status);
                                    }
                                  }}
                                >
                                  {candidateApplications.map((app, idx) => (
                                    <option key={idx} value={app.id}>{app.title}</option>
                                  ))}
                                </select>
                            </div>
                          ) : (
                            localActiveJob?.title || "General Application"
                          )}

                        </div>
                        <span className="text-slate-300">|</span>
                        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs font-bold uppercase tracking-wider bg-blue-100 text-blue-800 border-blue-200 transition-colors">
                          {currentStatus}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {isUpdatingStatus && <span className="text-xs text-blue-600 font-bold animate-pulse">Updating...</span>}
                        <select 
                          className="text-xs font-medium border border-slate-300 rounded-md px-2 py-1.5 bg-white text-slate-700 hover:border-blue-500 cursor-pointer outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
                          value={currentStatus}
                          onChange={(e) => handleStageChange(e.target.value)}
                          disabled={isUpdatingStatus || !localActiveJob}
                        >
                          <option value="Sourcing">Move to Sourcing</option>
                          <option value="Assessment">Move to Assessment</option>
                          <option value="Interview">Move to Interview</option>
                          <option value="Technical Review">Move to Tech Review</option>
                          <option value="Hired">Mark as Hired</option>
                          <option value="Rejected">Mark as Rejected</option>
                        </select>
                      </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
                        {communications.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center text-slate-400">
                                <svg className="w-12 h-12 mb-3 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"></path></svg>
                                <p className="text-sm font-medium">No email history found.</p>
                                <p className="text-xs mt-1">Send the first outreach below!</p>
                            </div>
                        ) : (
                            communications.map((msg: any) => {
                                const isOutbound = msg.type === 'outbound_email' || msg.type === 'outbound' || msg.sender === 'Recruiter';
                                const timestamp = msg.created_at || msg.received_at || msg.logged_at;

                                return (
                                    <div key={msg.id} className={`flex flex-col ${isOutbound ? 'items-end' : 'items-start'} mb-4 animate-in fade-in slide-in-from-bottom-2`}>
                                        <div className="flex items-center gap-2 mb-1 px-1">
                                            <span className="text-[10px] font-bold text-slate-500 uppercase">{isOutbound ? 'You' : (candidate.name || 'Candidate')}</span>
                                            <span className="text-[10px] text-slate-400">{formatEmailDate(timestamp)}</span>
                                        </div>
                                        <div className={`max-w-[85%] p-3.5 rounded-2xl shadow-sm text-sm whitespace-pre-wrap leading-relaxed
                                            ${isOutbound 
                                                ? 'bg-blue-600 text-white rounded-tr-sm' 
                                                : 'bg-white border border-slate-200 text-slate-800 rounded-tl-sm'
                                            }`}
                                        >
                                            {msg.subject && <p className={`font-bold mb-1 border-b pb-1 ${isOutbound ? 'border-blue-500/50' : 'border-slate-100'}`}>Subj: {msg.subject}</p>}
                                            {msg.content}
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>

                    <div className="border-t border-slate-200 bg-white p-4 shrink-0 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
                        <div className="flex flex-col gap-3">
                            <input 
                                type="text"
                                placeholder="Subject line..."
                                value={newEmailSubject}
                                onChange={(e) => setNewEmailSubject(e.target.value)}
                                className="w-full px-3 py-2 text-sm border-b border-slate-200 focus:border-blue-500 outline-none font-medium bg-transparent"
                            />
                            <textarea 
                                value={newEmailBody}
                                onChange={(e) => setNewEmailBody(e.target.value)}
                                placeholder={`Write an email to ${candidate.name || 'this candidate'}...`}
                                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-none min-h-[100px]"
                            />
                            <div className="flex justify-end">
                                <button 
                                    onClick={handleSendEmail}
                                    disabled={isSendingEmail || !newEmailBody.trim()}
                                    className="flex items-center gap-2 px-5 py-2 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 disabled:cursor-not-allowed text-white text-sm font-bold rounded-lg transition-all"
                                >
                                    {isSendingEmail ? (
                                        <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                    ) : (
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"></path></svg>
                                    )}
                                    {isSendingEmail ? 'Sending...' : 'Send via Gmail'}
                                </button>
                            </div>
                        </div>
                    </div>

                </div>
            )}
          </div>

          {/* RIGHT SIDE: PDF Viewer */}
          <div className="w-1/2 bg-slate-800 relative">
            {pdfUrl ? (
              <iframe src={`${pdfUrl}#toolbar=0`} className="w-full h-full border-0" title="Resume PDF" />
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 bg-slate-900 p-8 text-center">
                <svg className="w-16 h-16 mb-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                <p className="font-bold text-lg text-slate-200">PDF File Not Linked</p>
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}