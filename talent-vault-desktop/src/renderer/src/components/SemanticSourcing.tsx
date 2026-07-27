import React, { useState } from 'react';
import { Sparkles, Database, Search, ArrowRight, UserCheck, Cpu } from 'lucide-react';

// --- MOCK DATABASE ---
// In production, this data lives in a Vector Database (like Pinecone or Weaviate)
const CANDIDATE_POOL = [
  { id: '1', name: "Marcus Sterling", role: "Lead CNC Programmer", current_company: "Precision Aero", exp: 12, match: 0 },
  { id: '2', name: "Elena Rodriguez", role: "Senior Machinist", current_company: "Ford Performance", exp: 8, match: 0 },
  { id: '3', name: "James Whitlock", role: "CNC Specialist", current_company: "TechTooling", exp: 15, match: 0 },
  { id: '4', name: "Sarah Jenkins", role: "Quality Inspector", current_company: "Boeing", exp: 5, match: 0 },
  { id: '5', name: "David Chen", role: "Manufacturing Engineer", current_company: "Tesla", exp: 7, match: 0 }
];

export default function SemanticSourcing() {
  const [jdText, setJdText] = useState("");
  const [isScanning, setIsScanning] = useState(false);
  const [results, setResults] = useState<typeof CANDIDATE_POOL>([]);

  // --- THE BACKEND SIMULATION ---
  const handleRunSemanticMatch = () => {
    if (!jdText.trim()) return;
    
    setIsScanning(true);

    // Simulate the latency of creating an embedding and querying a Vector DB
    setTimeout(() => {
      // Mock Semantic Scoring Logic:
      // In reality, your backend uses Cosine Similarity between the JD vector and Candidate vectors.
      const scoredCandidates = CANDIDATE_POOL.map(candidate => {
        let score = Math.floor(Math.random() * 40) + 40; // Baseline random score
        
        // Artificial logic for demonstration: 
        // If they pasted a CNC/Mastercam JD, Marcus and Elena score highest.
        if (jdText.toLowerCase().includes("cnc") || jdText.toLowerCase().includes("mastercam")) {
          if (candidate.name === "Marcus Sterling") score = 98;
          if (candidate.name === "Elena Rodriguez") score = 92;
          if (candidate.name === "James Whitlock") score = 84;
        }
        
        return { ...candidate, match: score };
      });

      // Sort by highest match score
      const sorted = scoredCandidates.sort((a, b) => b.match - a.match);
      
      setResults(sorted);
      setIsScanning(false);
    }, 1500);
  };

  return (
    <div className="max-w-7xl mx-auto p-6 flex gap-6 h-[calc(100vh-100px)]">
      
      {/* LEFT COLUMN: Input Engine */}
      <div className="w-1/2 flex flex-col bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-200 bg-slate-50/50 flex items-center justify-between">
          <div>
            <h2 className="font-bold text-slate-900 text-lg flex items-center gap-2">
              <Search size={18} className="text-blue-600"/> Semantic JD Sourcing
            </h2>
            <p className="text-xs text-slate-500 mt-1">Paste a raw job description to find candidates by contextual meaning, not just keywords.</p>
          </div>
          <span className="bg-blue-100 text-blue-800 text-[10px] font-bold px-2 py-1 rounded uppercase tracking-wider">Vector DB Query</span>
        </div>

        <div className="p-5 flex-1 flex flex-col">
          <label className="block text-xs font-bold text-slate-700 mb-2 uppercase">Raw Job Description</label>
          <textarea 
            className="flex-1 w-full p-4 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm text-slate-700 resize-none"
            placeholder="Paste the full job description here (responsibilities, requirements, culture)..."
            value={jdText}
            onChange={(e) => setJdText(e.target.value)}
          />

          <button 
            onClick={handleRunSemanticMatch}
            disabled={isScanning || !jdText.trim()}
            className="mt-4 w-full bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-bold py-3.5 rounded-lg flex items-center justify-center gap-2 transition-all shadow-md"
          >
            {isScanning ? (
              <span className="animate-pulse flex items-center gap-2"><Cpu size={18}/> Vectorizing Text...</span>
            ) : (
              <><Sparkles size={18} /> Run Semantic Neural Match</>
            )}
          </button>
        </div>
      </div>

      {/* RIGHT COLUMN: Output & Sorting Results */}
      <div className="w-1/2 bg-slate-50 border border-slate-200 rounded-xl shadow-inner p-6 flex flex-col overflow-hidden">
        <h3 className="font-bold text-slate-900 mb-4 flex items-center gap-2">
          <Database size={18} className="text-slate-400"/> Top Candidates in Vault
        </h3>

        {results.length === 0 && !isScanning && (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
            <UserCheck size={48} className="mb-4 opacity-20" />
            <p className="font-medium">Awaiting Job Description...</p>
            <p className="text-sm mt-1">Paste a JD and run the match to search the vault.</p>
          </div>
        )}

        {isScanning && (
          <div className="flex-1 flex flex-col items-center justify-center">
            <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mb-4"></div>
            <p className="text-blue-600 font-bold animate-pulse">Calculating Cosine Similarity...</p>
          </div>
        )}

        {!isScanning && results.length > 0 && (
          <div className="flex-1 overflow-y-auto space-y-3 pr-2">
            {results.map((candidate, index) => (
              <div key={candidate.id} className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm flex items-center justify-between hover:border-blue-300 transition-colors cursor-pointer group">
                <div className="flex items-center gap-4">
                  <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold text-slate-500">
                    #{index + 1}
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-900">{candidate.name}</h4>
                    <p className="text-xs text-slate-500">{candidate.role} @ {candidate.current_company}</p>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <div className="text-xs text-slate-400 font-bold uppercase tracking-wider mb-1">Match</div>
                    <div className={`font-black text-lg ${candidate.match >= 90 ? 'text-emerald-600' : candidate.match >= 80 ? 'text-blue-600' : 'text-amber-500'}`}>
                      {candidate.match}%
                    </div>
                  </div>
                  <button className="bg-blue-50 text-blue-600 p-2 rounded hover:bg-blue-100 opacity-0 group-hover:opacity-100 transition-opacity">
                    <ArrowRight size={18} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  );
}