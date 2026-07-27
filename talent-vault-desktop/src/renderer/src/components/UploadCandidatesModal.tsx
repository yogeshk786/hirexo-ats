import React, { useState, useCallback, useEffect } from 'react';
import { UploadCloud, FileText, X, CheckCircle, Loader2, Eye, User, Briefcase, Trash2, AlertTriangle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../supabaseClient';
import toast from 'react-hot-toast';

interface UploadCandidatesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function UploadCandidatesModal({ isOpen, onClose }: UploadCandidatesModalProps) {
  const { session, userProfile } = useAuth();
  const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

  const [isDragging, setIsDragging] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  
  // Watchlist Memory
  const [parsedCandidates, setParsedCandidates] = useState<any[]>(() => {
    const saved = localStorage.getItem('candidateWatchlist');
    if (saved) {
      try { return JSON.parse(saved); } catch (e) { return []; }
    }
    return [];
  });

  const [selectedIndices, setSelectedIndices] = useState<number[]>([]);
  const [step, setStep] = useState<1 | 2>(parsedCandidates.length > 0 ? 2 : 1);

  useEffect(() => {
    setSelectedIndices(parsedCandidates.map((_, i) => i));
    localStorage.setItem('candidateWatchlist', JSON.stringify(parsedCandidates));
    if (parsedCandidates.length === 0 && step === 2) {
      setStep(1);
    }
  }, [parsedCandidates.length, step]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFiles = Array.from(e.dataTransfer.files).filter(
      file => file.type === 'application/pdf' || file.name.endsWith('.docx') || file.name.endsWith('.doc')
    );
    setFiles(prev => [...prev, ...droppedFiles]);
  }, []);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const selectedFiles = Array.from(e.target.files);
      setFiles(prev => [...prev, ...selectedFiles]);
    }
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const removeParsedCandidate = (indexToRemove: number) => {
    setParsedCandidates(prev => prev.filter((_, idx) => idx !== indexToRemove));
    toast.success("Removed from watchlist.");
  };

  const toggleSelection = (idx: number) => {
    setSelectedIndices(prev => 
      prev.includes(idx) ? prev.filter(i => i !== idx) : [...prev, idx]
    );
  };

  // STEP 1: Parse the files
  const handleParse = async () => {
    if (files.length === 0) return;
    setIsUploading(true);
    
    const formData = new FormData();
    files.forEach(file => {
      formData.append('files', file); 
    });

    try {
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      
      const response = await fetch(`${API_URL}/api/upload-resumes`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${currentSession?.access_token}` },
        body: formData
      });

      if (!response.ok) throw new Error("Backend parsing failed");
      
      const data = await response.json();
      console.log("Raw Backend Response:", data); // Debug Tracker
      
      const successfulParses = data.parsed_results?.filter((res: any) => !res.error) || [];
      const failedParses = data.parsed_results?.filter((res: any) => res.error) || [];
      
      // 🚀 THE BULLETPROOF NOTIFICATION FIX
      if (failedParses.length > 0) {
        failedParses.forEach((fail: any) => {
          const errorMsg = fail.error || `Failed to process ${fail.filename}`;
          toast.error(errorMsg, { duration: 6000 });
          // Fallback native browser alert to guarantee you see it!
          alert(`🛑 ${errorMsg}`);
        });
      }
      
      if (successfulParses.length === 0) {
        setIsUploading(false);
        return;
      }

      setParsedCandidates(prev => [...prev, ...successfulParses]);
      
      const successFilenames = successfulParses.map((s: any) => s.filename);
      setFiles(prev => prev.filter(f => !successFilenames.includes(f.name)));
      
      setStep(2); 
      toast.success(`AI Parsing complete! Added ${successfulParses.length} to your watchlist.`);

    } catch (error) {
      console.error("Upload Error:", error);
      toast.error("There was an error parsing the resumes. Make sure the backend is running.");
    } finally {
      setIsUploading(false);
    }
  };

  // STEP 2: Approve Selected Candidates (WITH MERGE CAPABILITY)
  const handleApproveAndSave = async () => {
    if (selectedIndices.length === 0) {
      toast.error("Please select at least one candidate to approve.");
      return;
    }

    setIsUploading(true);
    const candidatesToSave = parsedCandidates.filter((_, idx) => selectedIndices.includes(idx));
    
    try {
      for (const res of candidatesToSave) {
        let candidateId = res.existing_id || crypto.randomUUID();

        // 1. Prepare the Payload
        const candidatePayload: any = {
          company_id: userProfile?.company_id,
          filename: res.filename || "Manual_Upload.pdf",
          document_hash: res.document_hash,
          resume_url: res.resume_url || null,
          ai_status: 'New',
          status: 'Active',
          name: res.name || "Unknown Candidate",
          email: res.email || null,
          phone: res.phone || null,
          location: res.location || null,
          summary: res.summary || null,
          total_experience_years: res.total_experience_years || 0,
          technical_skills: res.technical_skills || [],
          soft_skills: res.soft_skills || [],
          interests: res.interests || [],
          languages: res.languages || [],
          projects: res.projects || [],
          social_links: res.social_links || [],
          certifications: res.certifications || [],
          intelligence_layer: res.intelligence_layer || {},
          segmentation: res.segmentation || {}
        };

        // 🚀 THE MERGE LOGIC
        if (res.is_update && res.existing_id) {
          console.log(`🔄 Merging updates into existing candidate ID: ${res.existing_id}`);
          const { error: updateError } = await supabase
            .from('candidates')
            .update(candidatePayload)
            .eq('id', res.existing_id);
          
          if (updateError) throw updateError;

          // Clear out their old experience/education so we don't double-stack it
          await supabase.from('education').delete().eq('candidate_id', candidateId);
          await supabase.from('work_experience').delete().eq('candidate_id', candidateId);

        } else {
          console.log(`✨ Creating brand new candidate...`);
          candidatePayload.id = candidateId;
          const { error: insertError } = await supabase.from('candidates').insert(candidatePayload);
          if (insertError) throw insertError;
        }

        // 2. Insert fresh Education
        if (res.education && res.education.length > 0) {
          const eduPayloads = res.education.map((edu: any) => ({
            candidate_id: candidateId,
            company_id: userProfile?.company_id,
            degree: edu.degree,
            institution: edu.institution,
            year: edu.year,
            score: edu.score
          }));
          await supabase.from('education').insert(eduPayloads);
        }

        // 3. Insert fresh Work Experience
        if (res.work_experience && res.work_experience.length > 0) {
          const expPayloads = res.work_experience.map((exp: any) => ({
            candidate_id: candidateId,
            company_id: userProfile?.company_id,
            job_title: exp.job_title,
            company: exp.company,
            start_date: exp.start_date,
            end_date: exp.end_date,
            description: exp.description,
            is_internship: exp.is_internship || false,
            duration_months: exp.duration_months || 0
          }));
          await supabase.from('work_experience').insert(expPayloads);
        }
      }

      toast.success(`Successfully saved ${candidatesToSave.length} candidate(s)!`);
      
      const remainingCandidates = parsedCandidates.filter((_, idx) => !selectedIndices.includes(idx));
      setParsedCandidates(remainingCandidates);
      
      if (remainingCandidates.length === 0) {
        localStorage.removeItem('candidateWatchlist');
        setStep(1);
        onClose();
      }

      setTimeout(() => {
        window.location.reload();
      }, 750);

    } catch (error) {
      console.error("🛑 Database Save Error:", error);
      toast.error("Failed to save candidates to the database.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleCancel = () => {
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm animate-in fade-in">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh]">
        
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 shrink-0">
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            {step === 1 ? <UploadCloud className="text-blue-600" /> : <Eye className="text-blue-600" />} 
            {step === 1 ? "Upload Candidates" : `Pending Watchlist (${parsedCandidates.length})`}
          </h2>
          <button onClick={handleCancel} className="p-1 hover:bg-slate-200 rounded-md text-slate-500 transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto">
          {step === 1 && (
            <>
              <div 
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`border-2 border-dashed rounded-xl p-10 flex flex-col items-center justify-center text-center transition-colors cursor-pointer ${isDragging ? 'border-blue-500 bg-blue-50' : 'border-slate-300 bg-slate-50 hover:bg-slate-100'}`}
              >
                <input 
                  type="file" 
                  multiple 
                  accept=".pdf,.doc,.docx" 
                  onChange={handleFileInput} 
                  className="hidden" 
                  id="file-upload" 
                />
                <label htmlFor="file-upload" className="cursor-pointer flex flex-col items-center">
                  <div className="w-16 h-16 bg-white shadow-sm rounded-full flex items-center justify-center mb-4 text-blue-600">
                    <UploadCloud size={32} />
                  </div>
                  <p className="text-slate-800 font-bold text-lg mb-1">Drag & Drop Resumes Here</p>
                  <p className="text-slate-500 text-sm mb-4">Supports PDF, DOC, and DOCX files.</p>
                  <span className="px-4 py-2 bg-white border border-slate-200 text-slate-700 font-medium rounded-lg shadow-sm hover:bg-slate-50 transition-colors text-sm">
                    Browse Files
                  </span>
                </label>
              </div>

              {files.length > 0 && (
                <div className="mt-6">
                  <h3 className="text-sm font-bold text-slate-700 mb-3 flex items-center justify-between">
                    Selected Files ({files.length})
                    <button onClick={() => setFiles([])} className="text-xs text-red-500 hover:underline">Clear All</button>
                  </h3>
                  <div className="max-h-48 overflow-y-auto space-y-2 pr-2">
                    {files.map((file, idx) => (
                      <div key={idx} className="flex items-center justify-between p-3 bg-white border border-slate-200 rounded-lg shadow-sm">
                        <div className="flex items-center gap-3 overflow-hidden">
                          <FileText size={16} className="text-blue-500 shrink-0" />
                          <span className="text-sm font-medium text-slate-700 truncate">{file.name}</span>
                        </div>
                        <button onClick={() => removeFile(idx)} className="text-slate-400 hover:text-red-500">
                          <X size={16} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div className="bg-blue-50 text-blue-800 p-4 rounded-lg text-sm mb-4 border border-blue-100 flex gap-3">
                <CheckCircle className="shrink-0 text-blue-600" size={20} />
                <p>Select the candidates you want to approve. Checked candidates will be saved to the database.</p>
              </div>

              {parsedCandidates.map((candidate, idx) => (
                <div 
                  key={idx} 
                  // 🚀 VISUAL UPDATE UX: Turns Yellow if it's merging into an existing profile!
                  className={`bg-white border-2 rounded-xl p-5 shadow-sm relative group transition-colors ${
                    candidate.is_update 
                      ? (selectedIndices.includes(idx) ? 'border-amber-400 bg-amber-50/20' : 'border-amber-200 opacity-60')
                      : (selectedIndices.includes(idx) ? 'border-blue-400' : 'border-slate-200 opacity-60')
                  }`}
                >
                  
                  {/* UPDATE BADGE */}
                  {candidate.is_update && (
                    <div className="absolute -top-3 left-4 bg-amber-100 text-amber-800 text-xs font-bold px-3 py-1 rounded-full border border-amber-200 flex items-center gap-1 shadow-sm">
                      <AlertTriangle size={14} /> Profile Update Detected
                    </div>
                  )}

                  <button 
                    onClick={() => removeParsedCandidate(idx)}
                    className="absolute top-4 right-4 p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                    title="Remove from Watchlist entirely"
                  >
                    <Trash2 size={18} />
                  </button>

                  <div className="flex justify-between items-start mb-4 pr-10 mt-2">
                    <div className="flex gap-4">
                      <div className="mt-1">
                        <input 
                          type="checkbox" 
                          checked={selectedIndices.includes(idx)}
                          onChange={() => toggleSelection(idx)}
                          className={`w-5 h-5 rounded cursor-pointer ${candidate.is_update ? 'text-amber-500 focus:ring-amber-500 border-amber-300' : 'text-blue-600 focus:ring-blue-500 border-slate-300'}`}
                        />
                      </div>
                      
                      <div>
                        <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                          <User size={18} className="text-slate-400" />
                          {candidate.name || 'Unknown Candidate'}
                        </h3>
                        <div className="text-sm text-slate-500 mt-1 flex flex-col gap-1">
                          <span>{candidate.email || 'No email found'}</span>
                          <span>{candidate.phone || 'No phone found'}</span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="bg-emerald-50 text-emerald-700 px-3 py-1 rounded-full text-xs font-bold border border-emerald-100">
                      {candidate.total_experience_years} Years Exp
                    </div>
                  </div>

                  <div className="mt-4 pt-4 border-t border-slate-100 pl-9">
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                      <Briefcase size={14} /> Top Skills Extracted
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {candidate.technical_skills?.slice(0, 8).map((skill: string, i: number) => (
                        <span key={i} className="px-2.5 py-1 bg-slate-100 text-slate-700 rounded-md text-xs font-medium">
                          {skill}
                        </span>
                      ))}
                      {candidate.technical_skills?.length > 8 && (
                        <span className="px-2.5 py-1 bg-slate-50 text-slate-500 rounded-md text-xs font-medium border border-slate-200">
                          +{candidate.technical_skills.length - 8} more
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-3 shrink-0">
          
          {step === 2 && (
             <button 
               onClick={() => setStep(1)} 
               className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200 rounded-lg transition-colors mr-auto"
             >
               + Upload More
             </button>
          )}

          <button onClick={handleCancel} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200 rounded-lg transition-colors">
            Close
          </button>
          
          {step === 1 ? (
            <button 
              onClick={handleParse}
              disabled={files.length === 0 || isUploading}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg flex items-center gap-2 transition-colors shadow-sm disabled:opacity-50"
            >
              {isUploading ? <Loader2 size={16} className="animate-spin" /> : <Eye size={16} />}
              {isUploading ? 'Extracting Data...' : 'Extract Data'}
            </button>
          ) : (
            <button 
              onClick={handleApproveAndSave}
              disabled={isUploading || selectedIndices.length === 0}
              className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg flex items-center gap-2 transition-colors shadow-sm disabled:opacity-50"
            >
              {isUploading ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle size={16} />}
              {isUploading ? 'Saving...' : `Approve Selected (${selectedIndices.length})`}
            </button>
          )}
        </div>

      </div>
    </div>
  );
}