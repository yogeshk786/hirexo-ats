import React from 'react';

interface CandidateFiltersProps {
  selectedDept: string;
  setSelectedDept: (dept: string) => void;
  minExperience: number;
  setMinExperience: (exp: number) => void;
  onClearFilters: () => void;
}

const DEPARTMENTS = [
  "All", 
  "Technical & Engineering", 
  "Operations & Floor", 
  "HR & Administration", 
  "Quality Control & Safety", 
  "Sales & Marketing", 
  "Uncategorized"
];

export default function CandidateFilters({
  selectedDept,
  setSelectedDept,
  minExperience,
  setMinExperience,
  onClearFilters
}: CandidateFiltersProps) {
  
  return (
    <div className="w-[280px] border-r border-slate-200 bg-white p-6 flex flex-col shrink-0 overflow-y-auto">
      <h3 className="font-bold text-slate-800 mb-6 text-sm uppercase tracking-wider">Filters</h3>
      
      {/* Department Filter */}
      <div className="mb-8">
        <label className="block text-xs font-bold text-slate-500 mb-3 uppercase">Department</label>
        <div className="space-y-2">
          {DEPARTMENTS.map(dept => (
            <label key={dept} className="flex items-center gap-2 cursor-pointer group">
              <input 
                type="radio" 
                name="department" 
                value={dept}
                checked={selectedDept === dept}
                onChange={(e) => setSelectedDept(e.target.value)}
                className="w-4 h-4 text-blue-600 focus:ring-blue-500 border-slate-300 cursor-pointer"
              />
              <span className={`text-sm ${selectedDept === dept ? 'font-bold text-blue-700' : 'font-medium text-slate-600 group-hover:text-slate-900'}`}>
                {dept}
              </span>
            </label>
          ))}
        </div>
      </div>

      {/* Experience Filter */}
      <div className="mb-8">
        <label className="block text-xs font-bold text-slate-500 mb-3 uppercase">Min Experience</label>
        <input 
          type="range" 
          min="0" 
          max="15" 
          value={minExperience} 
          onChange={(e) => setMinExperience(parseInt(e.target.value))}
          className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
        />
        <div className="flex justify-between mt-2 text-xs font-bold text-slate-400">
          <span>{minExperience} Years</span>
          <span>15+ Years</span>
        </div>
      </div>
      
      {/* Clear Filters Button */}
      <button 
        onClick={onClearFilters}
        className="mt-auto py-2 w-full text-sm font-bold text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
      >
        Clear All Filters
      </button>
    </div>
  );
}