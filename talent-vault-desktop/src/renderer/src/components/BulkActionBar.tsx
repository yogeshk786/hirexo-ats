import React from 'react';

interface BulkActionBarProps {
  selectedCount: number;
  onClearSelection: () => void;
  onBulkAdvance: () => void;
  onBulkReject: () => void;
  onBulkArchive: () => void; // 🚀 Added Archive Handler
}

export default function BulkActionBar({ 
  selectedCount, 
  onClearSelection, 
  onBulkAdvance, 
  onBulkReject,
  onBulkArchive // 🚀 Added Archive Handler
}: BulkActionBarProps) {
  
  if (selectedCount === 0) return null;

  return (
    <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 z-50 animate-in slide-in-from-bottom-8 fade-in duration-300">
      <div className="bg-slate-900 text-white rounded-full shadow-2xl flex items-center overflow-hidden border border-slate-700 p-1.5">
        
        {/* Count Indicator */}
        <div className="flex items-center gap-3 px-4 border-r border-slate-700">
          <span className="flex items-center justify-center bg-blue-600 text-white text-xs font-bold h-6 w-6 rounded-full">
            {selectedCount}
          </span>
          <span className="text-sm font-semibold tracking-wide">Selected</span>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-1 px-2">
          <button 
            onClick={onBulkAdvance}
            className="px-4 py-1.5 hover:bg-emerald-500/20 text-emerald-400 text-sm font-bold rounded-full transition-colors flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7"></path></svg>
            Advance
          </button>
          
          <button 
            onClick={onBulkReject}
            className="px-4 py-1.5 hover:bg-red-500/20 text-red-400 text-sm font-bold rounded-full transition-colors flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12"></path></svg>
            Reject
          </button>

          {/* 🚀 NEW: Archive Button */}
          <button 
            onClick={onBulkArchive}
            className="px-4 py-1.5 hover:bg-slate-700 text-slate-300 text-sm font-bold rounded-full transition-colors flex items-center gap-2"
            title="Archive Selection"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"></path></svg>
            Archive
          </button>
        </div>

        {/* Clear Button */}
        <button 
          onClick={onClearSelection}
          className="p-2 ml-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded-full transition-colors"
          title="Clear Selection"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
        </button>

      </div>
    </div>
  );
}