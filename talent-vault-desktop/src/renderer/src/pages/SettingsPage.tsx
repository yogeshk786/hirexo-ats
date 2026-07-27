import React, { useEffect, useState } from 'react';
import { Mail, CheckCircle2, Loader2, RefreshCw, Users, Copy, Shield } from 'lucide-react';
import { useAuth } from '../context/AuthContext'; 
import { supabase } from '../supabaseClient'; 

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

export default function SettingsPage() {
  const { session, userProfile } = useAuth(); 
  const [showSuccess, setShowSuccess] = useState(false);
  
  // Integration tracking states
  const [integrationStatus, setIntegrationStatus] = useState<any>(null);
  const [isLoadingStatus, setIsLoadingStatus] = useState(true);
  const [connectingProvider, setConnectingProvider] = useState<string | null>(null);

  // Team Invite States
  const [generatedCode, setGeneratedCode] = useState("");
  const [selectedRole, setSelectedRole] = useState("Recruiter");
  const [isGenerating, setIsGenerating] = useState(false);

  // 🚀 Team List States (This was missing in your code!)
  const [teamMembers, setTeamMembers] = useState<any[]>([]);
  const [isLoadingTeam, setIsLoadingTeam] = useState(true);

  // 1. Fetch Integration Status & Team Members on Mount
  useEffect(() => {
    const fetchStatus = async () => {
      if (!session?.access_token) {
        setIsLoadingStatus(false);
        return;
      }
      try {
        const response = await fetch(`${API_URL}/api/integrations/status`, {
          headers: { 'Authorization': `Bearer ${session.access_token}` }
        });
        if (response.ok) {
          const data = await response.json();
          setIntegrationStatus(data);
        }
      } catch (error) {
        console.error("Failed to fetch integration status", error);
      } finally {
        setIsLoadingStatus(false);
      }
    };

    // 🚀 Fetch Team Members from the Database
    const fetchTeam = async () => {
      if (!userProfile?.company_id) return;
      setIsLoadingTeam(true);
      
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('company_id', userProfile.company_id)
        .order('created_at', { ascending: true });

      if (data && !error) {
        setTeamMembers(data);
      }
      setIsLoadingTeam(false);
    };

    fetchStatus();
    fetchTeam();
  }, [session?.access_token, userProfile?.company_id]);

  // 2. Handle OAuth Redirect Success
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('integration') === 'success') {
      setShowSuccess(true);
      window.history.replaceState({}, document.title, window.location.pathname);
      setTimeout(() => setShowSuccess(false), 5000);
    }
  }, []);

  const handleConnectProvider = async (provider: string) => {
    try {
      if (!session?.access_token) {
        alert("You must be logged in to connect an integration.");
        return;
      }
      setConnectingProvider(provider);
      const response = await fetch(`${API_URL}/api/integrations/${provider}/connect`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${session.access_token}`, 
          'Content-Type': 'application/json'
        }
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.detail || `Failed to connect ${provider}`);
      }
      const data = await response.json();
      if (data.url) window.location.href = data.url;
    } catch (error: any) {
      console.error(`Failed to initiate ${provider} Login`, error);
      alert(error.message);
      setConnectingProvider(null);
    }
  };

  const handleDisconnect = async () => {
    const isConfirmed = window.confirm(
      "Are you sure you want to disconnect this inbox? The ATS will immediately stop importing candidate resumes."
    );
    if (!isConfirmed) return;
    try {
      setIsLoadingStatus(true); 
      const response = await fetch(`${API_URL}/api/integrations/disconnect`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${session.access_token}` }
      });
      if (!response.ok) throw new Error("Failed to disconnect.");
      setIntegrationStatus(null);
      alert("Email integration disconnected successfully.");
    } catch (error) {
      console.error("Disconnect error", error);
      alert("Could not disconnect the integration. Please try again.");
    } finally {
      setIsLoadingStatus(false);
    }
  };

  // Generate Invite Code Logic
  const handleGenerateInvite = async () => {
    if (!userProfile?.company_id) {
      alert("Error: No company workspace found for your profile.");
      return;
    }
    setIsGenerating(true);
    try {
      const rawCode = Math.random().toString(36).substring(2, 8).toUpperCase();
      const newCode = `JOIN-${rawCode}`;
      const { error } = await supabase
        .from('workspace_invites')
        .insert([{
          code: newCode,
          company_id: userProfile.company_id,
          role: selectedRole,
          created_by: userProfile.id
        }]);
      if (error) throw error;
      setGeneratedCode(newCode);
    } catch (error: any) {
      console.error("Failed to generate invite code", error);
      alert(error.message || "Failed to generate invite code.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(generatedCode);
    alert("Code copied to clipboard!");
  };

  // 🚀 Handle Role Change for an Employee
  const handleRoleUpdate = async (employeeId: string, newRole: string) => {
    setTeamMembers(prev => prev.map(member => 
      member.id === employeeId ? { ...member, role: newRole } : member
    ));

    const { error } = await supabase
      .from('user_profiles')
      .update({ role: newRole })
      .eq('id', employeeId);

    if (error) {
      alert("Failed to update user role.");
      console.error(error);
    }
  };

  return (
    <div className="p-8 max-w-4xl mx-auto animate-in fade-in duration-300">
      <h2 className="text-2xl font-bold mb-8 text-slate-900">Workspace Settings</h2>
      
      {showSuccess && (
        <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-lg flex items-center gap-3 shadow-sm">
          <CheckCircle2 size={20} />
          <p className="font-bold text-sm">Email integration connected successfully!</p>
        </div>
      )}

      <div className="space-y-10">

        {/* ================= TEAM MANAGEMENT SECTION ================= */}
        <section>
          <h3 className="font-bold text-lg text-slate-800 border-b pb-2 mb-4 flex items-center gap-2">
            <Users size={20} className="text-blue-600" /> Team Management
          </h3>
          
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm mb-6">
            <p className="text-sm text-slate-600 mb-4">
              Generate a unique, single-use invite code to onboard new members to your workspace. 
              They will be prompted to enter this code during their account creation.
            </p>

            <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
              <select 
                value={selectedRole} 
                onChange={(e) => setSelectedRole(e.target.value)}
                className="border border-slate-300 rounded-lg px-4 py-2.5 text-sm font-medium outline-none focus:ring-2 focus:ring-blue-500 min-w-[200px]"
              >
                <option value="Recruiter">Recruiter</option>
                <option value="Interviewer">Interviewer</option>
                <option value="Hiring Manager">Hiring Manager</option>
                <option value="Lead HR">Lead HR</option>
                <option value="Admin">Admin</option>
              </select>
              
              <button 
                onClick={handleGenerateInvite}
                disabled={isGenerating}
                className="bg-slate-900 text-white px-6 py-2.5 rounded-lg font-bold hover:bg-slate-800 disabled:bg-slate-400 transition-colors flex items-center gap-2 text-sm shadow-sm"
              >
                {isGenerating ? <Loader2 size={16} className="animate-spin" /> : null}
                Generate Invite Code
              </button>
            </div>

            {generatedCode && (
              <div className="mt-6 p-4 bg-emerald-50 border border-emerald-200 rounded-lg flex justify-between items-center animate-in fade-in slide-in-from-top-2">
                <div>
                  <p className="text-xs text-emerald-600 font-bold uppercase tracking-wider mb-1">New Invite Code Created</p>
                  <p className="text-2xl font-black text-emerald-900 tracking-widest">{generatedCode}</p>
                </div>
                <button 
                  onClick={handleCopyCode}
                  className="flex items-center gap-2 text-emerald-800 bg-emerald-200/50 hover:bg-emerald-200 px-4 py-2 rounded-md font-bold text-sm transition-colors"
                >
                  <Copy size={16} /> Copy
                </button>
              </div>
            )}
          </div>

          {/* 🚀 NEW: The Team List */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
              <h4 className="font-bold text-slate-800 flex items-center gap-2">
                <Shield size={16} className="text-slate-500" /> Active Workspace Members
              </h4>
              <span className="text-xs font-bold bg-blue-100 text-blue-700 px-2 py-1 rounded-full">
                {teamMembers.length} Members
              </span>
            </div>
            
            {isLoadingTeam ? (
              <div className="p-8 flex justify-center">
                <Loader2 className="animate-spin text-slate-300" size={24} />
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {teamMembers.map((member) => (
                  <div key={member.id} className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center text-white font-bold shadow-sm">
                        {member.email ? member.email.charAt(0).toUpperCase() : 'U'}
                      </div>
                      <div>
                        <p className="text-sm font-bold text-slate-900">
                          {member.email || `User (${member.id.substring(0, 8)})`}
                        </p>
                        <p className="text-xs text-slate-500">Joined {new Date(member.created_at).toLocaleDateString()}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      {member.id === userProfile?.id ? (
                        <span className="text-sm font-bold text-slate-400 bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200">
                          {member.role} (You)
                        </span>
                      ) : (
                        <select 
                          value={member.role} 
                          onChange={(e) => handleRoleUpdate(member.id, e.target.value)}
                          className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm font-bold text-slate-700 bg-white outline-none focus:ring-2 focus:ring-blue-500 hover:border-blue-400 transition-colors cursor-pointer"
                        >
                          <option value="Recruiter">Recruiter</option>
                          <option value="Interviewer">Interviewer</option>
                          <option value="Hiring Manager">Hiring Manager</option>
                          <option value="Lead HR">Lead HR</option>
                          <option value="Admin">Admin</option>
                        </select>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* ================= EMAIL INTEGRATION SECTION ================= */}
        <section>
          <h3 className="font-bold text-lg text-slate-800 border-b pb-2 mb-4">Email & ATS Ingestion</h3>
          
          {isLoadingStatus ? (
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex items-center justify-center gap-3 text-slate-500">
              <Loader2 className="animate-spin" size={20} />
              <span className="text-sm font-medium">Checking integration status...</span>
            </div>
          ) : integrationStatus?.is_connected ? (
            <div className="bg-emerald-50 p-6 rounded-xl border border-emerald-200 shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div className="flex items-start gap-4">
                <div className="bg-emerald-100 p-2 rounded-full mt-1 text-emerald-600">
                  <CheckCircle2 size={24} />
                </div>
                <div>
                  <h3 className="font-bold text-emerald-900 text-lg">
                    {integrationStatus.data.provider === 'gmail' ? 'Google Workspace' : 'Microsoft Outlook'} Connected
                  </h3>
                  <p className="text-sm text-emerald-700 mt-1">
                    Active Sync Inbox: <span className="font-bold bg-emerald-200/50 px-2 py-0.5 rounded">{integrationStatus.data.email_address}</span>
                  </p>
                  <p className="text-xs text-emerald-600/80 mt-2 flex items-center gap-1">
                    <RefreshCw size={12} /> Auto-syncing incoming resumes 24/7
                  </p>
                </div>
              </div>
              <button 
                onClick={handleDisconnect}
                className="shrink-0 text-sm font-semibold text-red-600 border border-red-200 hover:bg-red-50 bg-white py-2 px-4 rounded-lg transition-colors shadow-sm"
              >
                Disconnect Inbox
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                  <h3 className="font-bold text-slate-800 flex items-center gap-2">
                    <Mail className="text-red-500" size={20}/> 
                    Google Workspace (Gmail)
                  </h3>
                  <p className="text-sm text-slate-500 mt-1">Connect your master company email to automate resume ingestion and email outreach.</p>
                </div>
                <button 
                  onClick={() => handleConnectProvider('gmail')}
                  disabled={connectingProvider !== null}
                  className="shrink-0 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-bold py-2.5 px-5 rounded-lg transition-colors whitespace-nowrap shadow-sm text-sm flex items-center justify-center min-w-[140px]"
                >
                  {connectingProvider === 'gmail' ? (
                    <Loader2 className="animate-spin text-white" size={20} />
                  ) : "Connect Gmail"}
                </button>
              </div>

              <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                  <h3 className="font-bold text-slate-800 flex items-center gap-2">
                    <Mail className="text-blue-500" size={20}/> 
                    Microsoft Outlook (Office 365)
                  </h3>
                  <p className="text-sm text-slate-500 mt-1">Connect your master company email to automate resume ingestion and email outreach via Microsoft Graph.</p>
                </div>
                <button 
                  onClick={() => handleConnectProvider('outlook')}
                  disabled={connectingProvider !== null}
                  className="shrink-0 bg-slate-800 hover:bg-slate-900 disabled:bg-slate-500 text-white font-bold py-2.5 px-5 rounded-lg transition-colors whitespace-nowrap shadow-sm text-sm flex items-center justify-center min-w-[140px]"
                >
                  {connectingProvider === 'outlook' ? (
                    <Loader2 className="animate-spin text-white" size={20} />
                  ) : "Connect Outlook"}
                </button>
              </div>
            </div>
          )}
        </section>

      </div>
    </div>
  );
}