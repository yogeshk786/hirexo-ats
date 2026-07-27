import React, { useEffect, useState } from 'react';
import { 
  LayoutDashboard, 
  Users, 
  Briefcase, 
  BarChart2, 
  Settings, 
  Plus, 
  HelpCircle, 
  LogOut,
  Bell,
  Mail,
  Activity // 🚀 Added Activity icon
} from 'lucide-react';
import RoleGuard from './RoleGuard'; 
import { useAuth } from '../context/AuthContext'; 
import { supabase } from '../supabaseClient'; 

interface SidebarProps {
  activePage: string;
  setActivePage: (page: string) => void;
  onOpenCreateJob: () => void; 
  unreadCount?: number;
  companyName?: string; 
  onLogout?: () => void; 
}

export default function Sidebar({ 
  activePage, 
  setActivePage, 
  onOpenCreateJob, 
  unreadCount = 0,
  companyName: propCompanyName = "HIREXo", // Fallback
  onLogout 
}: SidebarProps) {
  
  const { userProfile } = useAuth();
  const [companyName, setCompanyName] = useState(propCompanyName);

  // 🚀 Dynamically fetch the company name based on the user's workspace
  useEffect(() => {
    const fetchCompanyName = async () => {
      if (userProfile?.company_id) {
        const { data, error } = await supabase
          .from('companies')
          .select('company_name')
          .eq('id', userProfile.company_id)
          .single();
          
        if (data && !error) {
          setCompanyName(data.company_name);
        }
      }
    };

    fetchCompanyName();
  }, [userProfile?.company_id]);

  const getButtonClass = (pageName: string) => {
    const baseClass = "flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-colors w-full text-left ";
    if (activePage === pageName) {
      return baseClass + "bg-blue-600 text-white shadow-sm"; 
    }
    return baseClass + "hover:bg-slate-800 text-slate-300"; 
  };

  return (
    <aside className="w-64 bg-[#1E2235] text-slate-300 flex flex-col shrink-0 h-full shadow-xl z-20 transition-all duration-300">
      
      {/* Logo Area */}
      <div className="h-20 flex items-center px-6 border-b border-slate-700/50 draggable">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-indigo-500 rounded flex items-center justify-center text-white font-bold shadow-sm">
            <Briefcase size={18} />
          </div>
          <div className="overflow-hidden">
            {/* 🚀 Render the dynamically fetched company name */}
            <h1 className="text-white font-bold tracking-wide text-sm truncate">{companyName}</h1>
            <p className="text-[10px] text-slate-400 tracking-wider truncate">Application Tracking System</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-6 px-3 space-y-1 overflow-y-auto">
        
        {/* Dashboard: Visible to Everyone */}
        <button onClick={() => setActivePage('dashboard')} className={getButtonClass('dashboard')}>
          <div className="flex items-center gap-3"><LayoutDashboard size={18} /> Dashboard</div>
        </button>
        
        {/* Applicants: Visible to Everyone */}
        <button onClick={() => setActivePage('applicants')} className={getButtonClass('applicants')}>
          <div className="flex items-center gap-3"><Users size={18} /> Applicants</div>
        </button>
        
        {/* 🚀 RBAC: Jobs restricted to management & recruiting staff */}
        <RoleGuard allowedRoles={['Admin', 'Lead HR', 'Recruiter', 'Hiring Manager']}>
          <button onClick={() => setActivePage('jobs')} className={getButtonClass('jobs')}>
            <div className="flex items-center gap-3"><Briefcase size={18} /> Jobs</div>
          </button>
        </RoleGuard>

        {/* 🚀 RBAC: Inbox restricted to management & recruiting staff */}
        <RoleGuard allowedRoles={['Admin', 'Lead HR', 'Recruiter', 'Hiring Manager']}>
          <button onClick={() => setActivePage('inbox')} className={getButtonClass('inbox')}>
            <div className="flex items-center gap-3"><Mail size={18} /> Inbox</div>
          </button>
        </RoleGuard>
        
        {/* 🚀 RBAC: Analytics strictly for Admins and Lead HR */}
        <RoleGuard allowedRoles={['Admin', 'Lead HR']}>
          <button onClick={() => setActivePage('analytics')} className={getButtonClass('analytics')}>
            <div className="flex items-center gap-3"><BarChart2 size={18} /> Analytics</div>
          </button>
        </RoleGuard>

        {/* 🚀 RBAC: Activity Logs restricted to Admins and Lead HR */}
        <RoleGuard allowedRoles={['Admin', 'Lead HR']}>
          <button onClick={() => setActivePage('activity')} className={getButtonClass('activity')}>
            <div className="flex items-center gap-3"><Activity size={18} /> Activity</div>
          </button>
        </RoleGuard>

        {/* Notifications: Visible to Everyone */}
        <button onClick={() => setActivePage('notifications')} className={getButtonClass('notifications')}>
          <div className="flex items-center gap-3">
            <Bell size={18} className={unreadCount > 0 ? "text-blue-400 animate-pulse" : ""} /> 
            Notifications
          </div>
          {unreadCount > 0 && (
            <span className="bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-sm">
              {unreadCount}
            </span>
          )}
        </button>
        
        {/* 🚀 RBAC: Settings strictly for Admins */}
        <RoleGuard allowedRoles={['Admin']}>
          <button onClick={() => setActivePage('settings')} className={`${getButtonClass('settings')} mt-4`}>
            <div className="flex items-center gap-3"><Settings size={18} /> Settings</div>
          </button>
        </RoleGuard>

      </nav>

      {/* Bottom Actions */}
      <div className="p-4 mt-auto space-y-2">
        
        {/* 🚀 RBAC: Only authorized roles can create new Job Requisitions */}
        <RoleGuard allowedRoles={['Admin', 'Lead HR', 'Hiring Manager']}>
          <button 
            onClick={onOpenCreateJob}
            className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-xl text-sm font-bold transition-colors shadow-lg"
          >
            <Plus size={16} /> New Requisition
          </button>
        </RoleGuard>
        
        <div className="mt-4 pt-4 border-t border-slate-700/50 space-y-1 mb-2">
          <button className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-800 text-sm font-medium text-slate-400 transition-colors text-left">
            <HelpCircle size={18} /> Support
          </button>
          <button 
            onClick={onLogout}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-800 text-sm font-medium text-slate-400 transition-colors text-left"
          >
            <LogOut size={18} /> Logout
          </button>
        </div>
      </div>
      
    </aside>
  );
}