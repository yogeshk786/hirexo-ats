import React, { useState, useCallback } from 'react';
import { UploadCloud, FileText, X, CheckCircle, Loader2, Eye, User, Briefcase } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../supabaseClient';
import { useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';

interface UploadCandidatesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function UploadCandidatesModal({ isOpen, onClose }: UploadCandidatesModalProps) {
  const { session, userProfile } = useAuth();
  const queryClient = useQueryClient();
  const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

  const [step, setStep] = useState<1 | 2>(1);
  const [isDragging, setIsDragging] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  
  // Holds the AI extracted data for review
  const [parsedCandidates, setParsedCandidates] = useState<any[]>([]);

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

  // STEP 1: Parse the files (Does NOT save to DB yet)
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
      
      // Keep only successful parses
      const successfulParses = data.parsed_results.filter((res: any) => !res.error);
      
      if (successfulParses.length === 0) {
        toast.error("Failed to extract data from the provided files.");
        setIsUploading(false);
        return;
      }

      setParsedCandidates(successfulParses);
      setStep(2); // Move to review step
      toast.success("AI Parsing complete! Please review the data.");

    } catch (error) {
      console.error("Upload Error:", error);
      toast.error("There was an error parsing the resumes. Make sure the backend is running.");
    } finally {
      setIsUploading(false);
    }
  };

  // STEP 2: Approve and Save to Supabase
  const handleApproveAndSave = async () => {
    setIsUploading(true);
    try {
      const candidatesToInsert = parsedCandidates.map((res: any) => ({
        company_id: userProfile?.company_id,
        name: res.name || "Unknown Candidate",
        email: res.email || null,
        phone: res.phone || null,
        location: res.location || null,
        summary: res.summary || null,
        total_experience_years: res.total_experience_years || 0,
        technical_skills: res.technical_skills || [],
        soft_skills: res.soft_skills || [],
        work_experience: res.work_experience || [],
        education: res.education || [],
        status: 'Sourcing', 
        source: 'Manual Upload' 
      }));

      if (candidatesToInsert.length > 0) {
        const { error } = await supabase.from('candidates').insert(candidatesToInsert);
        if (error) throw error;
      }

      toast.success(`Successfully approved and saved ${candidatesToInsert.length} candidate(s)!`);
      
      // Reset state and close
      setFiles([]);
      setParsedCandidates([]);
      setStep(1);
      onClose();
      queryClient.invalidateQueries({ queryKey: ['candidates'] });

    } catch (error) {
      console.error("Database Save Error:", error);
      toast.error("Failed to save candidates to the database.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleCancel = () => {
    setFiles([]);
    setParsedCandidates([]);
    setStep(1);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm animate-in fade-in">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 shrink-0">
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            {step === 1 ? <UploadCloud className="text-blue-600" /> : <Eye className="text-blue-600" />} 
            {step === 1 ? "Upload Candidates" : "Review Extracted Data"}
          </h2>
          <button onClick={handleCancel} className="p-1 hover:bg-slate-200 rounded-md text-slate-500 transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Content Area */}
        <div className="p-6 overflow-y-auto">
          
          {step === 1 && (
            <>
              {/* Drag & Drop Zone */}
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

              {/* File List */}
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
                <p>Please review the data extracted by the AI below. Once approved, they will be inserted into your active pipeline.</p>
              </div>

              {parsedCandidates.map((candidate, idx) => (
                <div key={idx} className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
                  <div className="flex justify-between items-start mb-4">
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
                    <div className="bg-emerald-50 text-emerald-700 px-3 py-1 rounded-full text-xs font-bold border border-emerald-100">
                      {candidate.total_experience_years} Years Exp
                    </div>
                  </div>

                  <div className="mt-4 pt-4 border-t border-slate-100">
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

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-3 shrink-0">
          <button onClick={handleCancel} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200 rounded-lg transition-colors">
            Cancel
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
              disabled={isUploading}
              className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg flex items-center gap-2 transition-colors shadow-sm disabled:opacity-50"
            >
              {isUploading ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle size={16} />}
              {isUploading ? 'Saving...' : 'Approve & Save'}
            </button>
          )}
        </div>

      </div>
    </div>
  );
}