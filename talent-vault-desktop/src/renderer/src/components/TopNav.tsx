import React, { useState } from 'react';
import { Search, UserPlus, FileUp, Settings, LogOut, User as UserIcon } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import UploadCandidatesModal from './UploadCandidatesModal';

interface TopNavProps {
  query: string;
  setQuery: (val: string) => void;
  searchCandidates: () => void;
  matchCount: number;
  
  searchMode?: 'semantic' | 'keyword';
  setSearchMode?: (mode: 'semantic' | 'keyword') => void;
  sortOption?: string;
  setSortOption?: (option: string) => void;
  isLoading?: boolean; 

  selectedDept: string;
  setSelectedDept: (dept: string) => void;
  minExperience: number;
  setMinExperience: (exp: number) => void;
  onClearFilters: () => void;

  viewMode: 'cards' | 'grid';
  setViewMode: (mode: 'cards' | 'grid') => void;

  // 🚀 Navigation props to open profile/settings
  onOpenProfile?: () => void;
  onOpenSettings?: () => void;
}

const DEPARTMENTS = [
  "All", "Technical & Engineering", "Operations & Floor", 
  "HR & Administration", "Quality Control & Safety", "Sales & Marketing", "Uncategorized"
];

export default function TopNav({ 
  query, setQuery, searchCandidates, matchCount,
  searchMode = 'semantic', setSearchMode, sortOption = 'match', setSortOption, isLoading = false,
  selectedDept, setSelectedDept, minExperience, setMinExperience, onClearFilters,
  viewMode, setViewMode,
  onOpenProfile, onOpenSettings 
}: TopNavProps) {
  
  const { userProfile, signOut } = useAuth();
  const [isFiltersOpen, setIsFiltersOpen] = useState(false); 
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault(); 
    if (!isLoading) searchCandidates();
  };

  const handleInvite = () => {
    const email = prompt("Enter the email address to invite to your workspace:");
    if (email) {
      alert(`Invite sent to ${email}!`);
    }
  };

  return (
    <>
      <div className="shrink-0 z-20 flex flex-col bg-white border-b border-slate-200 shadow-sm relative">
        
        {/* ROW 1: ULTRA-COMPACT HEADER & SEARCH */}
        <div className="flex items-center justify-between px-6 py-3 gap-6">
          
          {/* Branding & Tabs */}
          <div className="flex items-center gap-8 shrink-0">
            <h2 className="text-lg font-extrabold text-slate-900 tracking-tight">Talent Scout</h2>
            <nav className="hidden md:flex gap-5 text-sm">
              <span className="text-blue-600 font-bold cursor-pointer">Discover</span>
              <span className="text-slate-500 font-medium hover:text-slate-800 cursor-pointer">Saved Alerts</span>
            </nav>
          </div>

          {/* Compact Search Bar */}
          <form onSubmit={handleSearchSubmit} className="relative flex-1 max-w-3xl flex items-center">
            <input 
              type="text" 
              value={query}
              onChange={(e) => {
                  setQuery(e.target.value);
                  if (e.target.value.trim() === '') onClearFilters();
              }}
              disabled={isLoading} 
              className="block w-full pl-4 pr-32 py-2 border border-slate-200 rounded-lg leading-5 bg-slate-50 hover:bg-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white text-sm transition-all disabled:text-slate-400"
              placeholder="Search candidates by skill, intent..."
            />
            {query && (
                <button type="button" onClick={onClearFilters} className="absolute right-24 p-1.5 text-slate-400 hover:text-red-500 transition-colors">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                </button>
            )}
            <div className="absolute inset-y-1 right-1 flex items-center">
              <button type="submit" disabled={isLoading} className={`px-4 py-1.5 rounded-md text-xs font-bold transition-colors ${isLoading ? 'bg-slate-300 text-slate-100' : 'bg-blue-600 hover:bg-blue-700 text-white shadow-sm'}`}>
                {isLoading ? '...' : 'Search'}
              </button>
            </div>
          </form>

          {/* Profile & Actions */}
          <div className="flex items-center gap-3 shrink-0">
            {/* Invite Button */}
            <button 
              onClick={handleInvite}
              className="flex items-center gap-1.5 bg-slate-100 text-slate-700 px-3 py-1.5 rounded-md text-xs font-bold hover:bg-slate-200 transition-colors"
            >
              <UserPlus size={14} /> Invite
            </button>

            {/* New Candidate Button */}
            <button 
              onClick={() => setIsUploadModalOpen(true)}
              className="flex items-center gap-1.5 bg-blue-600 text-white px-3 py-1.5 rounded-md text-xs font-bold hover:bg-blue-700 transition-colors shadow-sm"
            >
              <FileUp size={14} /> New Candidate
            </button>

            <div className="w-px h-5 bg-slate-200 mx-1"></div>

            {/* Profile Avatar & Dropdown */}
            <div className="relative">
              <div 
                onClick={() => setIsProfileOpen(!isProfileOpen)}
                className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-800 text-xs font-bold border border-emerald-200 cursor-pointer hover:bg-emerald-200 transition-colors select-none uppercase"
              >
                {/* 🚀 FIX: Fallback to email letter if first name is missing */}
                {userProfile?.first_name?.charAt(0) || userProfile?.email?.charAt(0) || 'U'}
              </div>

              {isProfileOpen && (
                <div className="absolute right-0 mt-2 w-64 bg-white rounded-xl shadow-xl border border-slate-100 overflow-hidden animate-in fade-in slide-in-from-top-2 z-50">
                  <div className="p-4 border-b border-slate-100 bg-slate-50">
                    <p className="font-bold text-slate-800 text-sm">
                      {/* 🚀 FIX: Fallback to email if name is missing */}
                      {userProfile?.first_name 
                        ? `${userProfile.first_name} ${userProfile.last_name || ''}` 
                        : (userProfile?.email || 'User')}
                    </p>
                    <p className="text-xs text-slate-500 font-medium truncate">{userProfile?.email || 'user@example.com'}</p>
                    <span className="inline-block mt-2 px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-black uppercase tracking-wider rounded border border-emerald-200">
                      {userProfile?.role || 'Admin'}
                    </span>
                  </div>
                  <div className="p-2 flex flex-col gap-1">
                    <button 
                      onClick={() => {
                        setIsProfileOpen(false);
                        if (onOpenProfile) onOpenProfile();
                      }}
                      className="flex items-center gap-3 px-3 py-2 text-sm font-medium text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors w-full text-left"
                    >
                      <UserIcon size={16} /> My Profile
                    </button>
                    <button 
                      onClick={() => {
                        setIsProfileOpen(false);
                        if (onOpenSettings) onOpenSettings();
                      }}
                      className="flex items-center gap-3 px-3 py-2 text-sm font-medium text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors w-full text-left"
                    >
                      <Settings size={16} /> Workspace Settings
                    </button>
                  </div>
                  <div className="p-2 border-t border-slate-100">
                    <button 
                      onClick={signOut}
                      className="flex items-center gap-3 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors w-full text-left"
                    >
                      <LogOut size={16} /> Log Out
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ROW 2: CONTROLS, TOGGLES & FILTERS */}
        <div className="flex items-center justify-between px-6 py-2 bg-[#f8fafc] border-t border-slate-200 text-xs">
          
          {/* Left: Search Mode */}
          <div className="flex gap-1 p-0.5 bg-slate-200/50 rounded-md border border-slate-200">
            <button onClick={() => setSearchMode && setSearchMode('semantic')} className={`px-3 py-1 rounded-[4px] tracking-wide transition-all ${searchMode === 'semantic' ? 'bg-white shadow-sm text-blue-600 font-bold' : 'text-slate-500 hover:text-slate-700 font-medium'}`}>Semantic</button>
            <button onClick={() => setSearchMode && setSearchMode('keyword')} className={`px-3 py-1 rounded-[4px] tracking-wide transition-all ${searchMode === 'keyword' ? 'bg-white shadow-sm text-blue-600 font-bold' : 'text-slate-500 hover:text-slate-700 font-medium'}`}>Keyword</button>
          </div>
          
          {/* Right: Sort, Count, View Toggle, Filter */}
          <div className="flex items-center gap-5 text-slate-500 font-medium">
            
            <div className="flex items-center gap-2">
              <span>Sort by:</span>
              <select value={sortOption} onChange={(e) => setSortOption && setSortOption(e.target.value)} className="font-extrabold text-slate-900 bg-transparent border-none outline-none cursor-pointer p-0 text-xs focus:ring-0">
                <option value="match">AI Match Score</option>
                <option value="experience">Experience Level</option>
              </select>
            </div>
            
            <div className="h-4 w-px bg-slate-300"></div>
            <span className="text-blue-600 font-semibold tracking-wide">✓ {matchCount} matches</span>
            <div className="h-4 w-px bg-slate-300"></div>

            <div className="flex bg-slate-200/50 border border-slate-200 rounded-md p-0.5 shadow-sm">
              <button onClick={() => setViewMode('cards')} className={`px-3 py-1 text-xs font-bold rounded-[4px] transition-all ${viewMode === 'cards' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>Cards</button>
              <button onClick={() => setViewMode('grid')} className={`px-3 py-1 text-xs font-bold rounded-[4px] transition-all ${viewMode === 'grid' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>Spreadsheet</button>
            </div>

            {/* Filters Button */}
            <button onClick={() => setIsFiltersOpen(!isFiltersOpen)} className={`flex items-center gap-1.5 px-3 py-1 rounded-md border transition-all ${isFiltersOpen || selectedDept !== "All" || minExperience > 0 ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"></path></svg>
              <span className="font-bold">Filters</span>
              {(selectedDept !== "All" || minExperience > 0) && (<span className="w-2 h-2 rounded-full bg-blue-600 ml-0.5"></span>)}
            </button>
          </div>
        </div>

        {/* FILTER DROP DOWN */}
        {isFiltersOpen && (
          <div className="absolute top-full right-6 mt-2 p-5 bg-white shadow-xl border border-slate-200 rounded-xl w-full max-w-2xl animate-in fade-in slide-in-from-top-2 z-50">
            <div className="flex flex-col md:flex-row gap-8">
              <div className="flex-1">
                <label className="block text-xs font-bold text-slate-400 mb-3 uppercase tracking-wider">Department</label>
                <div className="flex flex-wrap gap-2">
                  {DEPARTMENTS.map(dept => (
                    <button key={dept} onClick={() => setSelectedDept(dept)} className={`px-3 py-1.5 text-xs font-bold rounded-full border transition-all ${selectedDept === dept ? 'bg-blue-600 border-blue-600 text-white shadow-sm' : 'bg-white border-slate-200 text-slate-600 hover:border-blue-300 hover:text-blue-600'}`}>{dept}</button>
                  ))}
                </div>
              </div>
              <div className="w-full md:w-64 shrink-0">
                <label className="block text-xs font-bold text-slate-400 mb-3 uppercase tracking-wider">Min Experience</label>
                <input type="range" min="0" max="15" value={minExperience} onChange={(e) => setMinExperience(parseInt(e.target.value))} className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"/>
                <div className="flex justify-between mt-2 text-xs font-bold text-slate-500">
                  <span className={minExperience === 0 ? 'text-blue-600' : ''}>{minExperience} Years</span>
                  <span className={minExperience === 15 ? 'text-blue-600' : ''}>15+ Years</span>
                </div>
              </div>
            </div>
            <div className="mt-5 pt-4 border-t border-slate-100 flex justify-end">
              <button onClick={onClearFilters} className="text-xs font-bold text-slate-500 hover:text-red-600 transition-colors">Clear All Filters</button>
            </div>
          </div>
        )}
      </div>

      <UploadCandidatesModal 
        isOpen={isUploadModalOpen} 
        onClose={() => setIsUploadModalOpen(false)} 
      />
    </>
  );
}