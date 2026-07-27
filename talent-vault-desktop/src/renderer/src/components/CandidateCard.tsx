import React from 'react';
import { FileText, Calendar, Share2, Download } from 'lucide-react';

interface CandidateCardProps {
  candidate: any;
  onViewClick: () => void;
}

export default function CandidateCard({ candidate, onViewClick }: CandidateCardProps) {
  if (!candidate) return null;

  // Fallbacks for data mapping
  const name = candidate.name || 'Unknown Candidate';
  const role = candidate.segmentation?.standardized_title || candidate.role || 'Applicant';
  const summary = candidate.summary || candidate.work_experience?.[0]?.description || 'No summary provided for this candidate.';
  
  // 🚀 Look for a real score from your Python backend (No more random fake scores)
  const matchScore = candidate.match_score || candidate.match || candidate.job_match_score; 
  
  // Combine skills for the pills (take up to 5)
  const allSkills = [...(candidate.technical_skills || []), ...(candidate.soft_skills || [])].slice(0, 5);
  
  // Dynamic pill colors to match the design (alternating styles)
  const pillStyles = [
    'bg-emerald-50 text-emerald-700',
    'bg-blue-50 text-blue-700',
    'bg-purple-50 text-purple-700',
    'bg-indigo-50 text-indigo-700',
    'bg-slate-100 text-slate-700'
  ];

  return (
    <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm hover:shadow-md transition-shadow mb-4">
      
      {/* HEADER: Avatar, Name, Role, and Match Score */}
      <div className="flex justify-between items-start mb-4">
        <div className="flex items-center gap-4">
          <div className="relative">
            <div className="w-12 h-12 rounded-full overflow-hidden bg-slate-100 border border-slate-200">
              {/* Using Dicebear initials as a fallback avatar */}
              <img 
                src={`https://api.dicebear.com/7.x/initials/svg?seed=${name}&backgroundColor=f1f5f9&textColor=0f172a`} 
                alt={name} 
                className="w-full h-full object-cover"
              />
            </div>
            {/* Online Status Dot */}
            <div className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 border-2 border-white rounded-full"></div>
          </div>
          
          <div>
            <h3 className="text-lg font-bold text-slate-900 leading-tight">{name}</h3>
            <p className="text-sm text-slate-500">
              {role} • applied recently
            </p>
          </div>
        </div>

        {/* 🚀 ONLY render the badge if a real matchScore exists */}
        {matchScore && (
          <div className="bg-blue-50/80 border border-blue-100 text-blue-700 px-3 py-1.5 rounded-full flex items-center gap-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wide">Match Score</span>
            <span className="text-sm font-black">{typeof matchScore === 'number' ? Math.round(matchScore) : matchScore}%</span>
          </div>
        )}
      </div>

      {/* BODY: Summary Text */}
      <p className="text-sm text-slate-600 leading-relaxed mb-5 line-clamp-3">
        {summary}
      </p>

      {/* SKILL PILLS */}
      {allSkills.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-6">
          {allSkills.map((skill, index) => (
            <span 
              key={index} 
              className={`px-3 py-1 rounded-full text-xs font-semibold ${pillStyles[index % pillStyles.length]}`}
            >
              {skill}
            </span>
          ))}
        </div>
      )}

      {/* FOOTER: Action Buttons */}
      <div className="flex items-center justify-between pt-1">
        <div className="flex gap-3">
          <button 
            onClick={onViewClick} 
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-lg text-sm font-bold transition-colors"
          >
            <FileText size={16} />
            Review Resume
          </button>
          
          <button 
            className="flex items-center gap-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 px-5 py-2.5 rounded-lg text-sm font-bold transition-colors"
          >
            <Calendar size={16} className="text-slate-500" />
            Interview
          </button>
        </div>

        <div className="flex items-center gap-1 text-slate-400">
          <button className="p-2 hover:bg-slate-50 hover:text-slate-600 rounded-md transition-colors">
            <Share2 size={18} />
          </button>
          <button className="p-2 hover:bg-slate-50 hover:text-slate-600 rounded-md transition-colors">
            <Download size={18} />
          </button>
        </div>
      </div>

    </div>
  );
}