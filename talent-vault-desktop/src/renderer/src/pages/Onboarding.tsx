import React, { useState } from 'react';
import { Building2, Key, Loader2, ArrowRight, LogOut } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../context/AuthContext';

export default function Onboarding() {
  const { session, fetchUserProfile, signOut } = useAuth();
  const [companyName, setCompanyName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  const handleCreateCompany = async () => {
    if (!companyName.trim()) return alert("Please enter a company name.");
    setIsProcessing(true);

    try {
      // 1. Create the new company
      const { data: company, error: companyError } = await supabase
        .from('companies')
        .insert([{ company_name: companyName }])
        .select()
        .single();

      if (companyError) throw companyError;

      // 2. 🚀 UPSERT the user as Admin to this new company (Creates row if missing)
      const { error: profileError } = await supabase
        .from('user_profiles')
        .upsert({ 
          id: session?.user?.id, 
          company_id: company.id, 
          role: 'Admin' 
        });

      if (profileError) throw profileError;

      // 3. Refresh Auth Context to unlock the main app
      await fetchUserProfile(session?.user?.id);
    } catch (err: any) {
      console.error(err);
      alert(err.message || "Failed to create workspace.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleJoinCompany = async () => {
    if (!inviteCode.trim()) return alert("Please enter an invite code.");
    setIsProcessing(true);

    try {
      // 1. Look up the invite code in the database
      const { data: invite, error: inviteError } = await supabase
        .from('workspace_invites')
        .select('company_id, role')
        .eq('code', inviteCode.trim().toUpperCase())
        .eq('is_active', true)
        .gt('expires_at', new Date().toISOString()) // Ensure it hasn't expired
        .maybeSingle(); // 🚀 Use maybeSingle so it doesn't crash if code is wrong

      if (inviteError) throw inviteError;
      if (!invite) {
        throw new Error("Invalid or expired invite code. Please check with your Admin.");
      }

      // 2. 🚀 UPSERT the user's profile with the new company and role (Creates row if missing)
      const { error: profileError } = await supabase
        .from('user_profiles')
        .upsert({ 
          id: session?.user?.id,
          company_id: invite.company_id, 
          role: invite.role 
        });

      if (profileError) throw profileError;

      // 3. Deactivate the code (One-time use)
      await supabase
        .from('workspace_invites')
        .update({ is_active: false })
        .eq('code', inviteCode.trim().toUpperCase());

      // 4. Refresh Auth Context to unlock the main dashboard
      await fetchUserProfile(session?.user?.id);
      
    } catch (err: any) {
      console.error("Join Error:", err);
      alert(err.message || "Failed to join workspace.");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <h2 className="mt-6 text-center text-3xl font-extrabold text-slate-900">
          Welcome to TalentVault
        </h2>
        <p className="mt-2 text-center text-sm text-slate-600">
          Let's get your workspace set up.
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow-xl border border-slate-200 sm:rounded-2xl sm:px-10">
          
          {/* Create Company Section */}
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2 flex items-center gap-2">
              <Building2 size={16} className="text-blue-600"/> Create New Workspace
            </label>
            <div className="mt-1 flex rounded-md shadow-sm">
              <input
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                className="flex-1 min-w-0 block w-full px-3 py-2 rounded-l-md border border-slate-300 focus:ring-blue-500 focus:border-blue-500 sm:text-sm outline-none"
                placeholder="Acme Corp"
              />
              <button
                onClick={handleCreateCompany}
                disabled={isProcessing}
                className="inline-flex items-center px-4 py-2 border border-transparent border-l-0 rounded-r-md bg-blue-600 text-white font-bold text-sm hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {isProcessing ? <Loader2 size={16} className="animate-spin" /> : 'Create'}
              </button>
            </div>
          </div>

          <div className="relative mt-8 mb-8">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-200" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-white text-slate-500 font-medium">OR</span>
            </div>
          </div>

          {/* Join Company Section */}
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2 flex items-center gap-2">
              <Key size={16} className="text-emerald-600"/> Have an invite code?
            </label>
            <div className="mt-1 flex rounded-md shadow-sm">
              <input
                type="text"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
                className="flex-1 min-w-0 block w-full px-3 py-2 rounded-l-md border border-slate-300 focus:ring-emerald-500 focus:border-emerald-500 sm:text-sm outline-none uppercase tracking-widest"
                placeholder="XXXX-XXXX"
              />
              <button
                onClick={handleJoinCompany}
                disabled={isProcessing}
                className="inline-flex items-center gap-2 px-4 py-2 border border-transparent border-l-0 rounded-r-md bg-slate-900 text-white font-bold text-sm hover:bg-slate-800 disabled:opacity-50 transition-colors"
              >
                {isProcessing ? <Loader2 size={16} className="animate-spin" /> : <>Join <ArrowRight size={16} /></>}
              </button>
            </div>
          </div>
        </div>

        {/* Logout Button */}
        <div className="mt-6 flex justify-center">
          <button 
            onClick={() => signOut()}
            className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800 font-medium transition-colors"
          >
            <LogOut size={16} /> Sign in to a different account
          </button>
        </div>

      </div>
    </div>
  );
}