import React, { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Activity, Clock, ShieldAlert, Zap, Filter, Search } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../context/AuthContext';

interface ActivityLog {
  id: string;
  action: string;
  entity: string;
  entity_id: string;
  metadata: any;
  created_at: string;
  user_email?: string;
}

// 🚀 HELPER: Safely parse metadata whether it's a string or an object
const getSafeMeta = (metadata: any) => {
  if (!metadata) return {};
  if (typeof metadata === 'string') {
    try { return JSON.parse(metadata); } 
    catch (e) { return {}; }
  }
  return metadata;
};

export default function ActivityPage() {
  const { userProfile } = useAuth();
  const queryClient = useQueryClient(); 
  const [searchTerm, setSearchTerm] = useState('');
  const [actionTypeFilter, setActionTypeFilter] = useState('ALL');

  const fetchLogs = async () => {
    if (!userProfile?.company_id) return [];
    
    console.log("🔍 Fetching logs for company:", userProfile.company_id);

    const { data, error } = await supabase
      .from('activity_logs')
      .select('*')
      .eq('company_id', userProfile.company_id)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) {
      console.error("❌ Error fetching logs:", error);
      throw error;
    }
    
    console.log("✅ Fetched logs from Supabase:", data);
    return data || [];
  };

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ['activity_logs', userProfile?.company_id],
    queryFn: fetchLogs,
    enabled: !!userProfile?.company_id,
  });

  useEffect(() => {
    if (!userProfile?.company_id) return;

    const channel = supabase
      .channel('activity_logs_realtime')
      .on(
        'postgres_changes',
        { 
          event: 'INSERT', 
          schema: 'public', 
          table: 'activity_logs',
          filter: `company_id=eq.${userProfile.company_id}` 
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['activity_logs', userProfile.company_id] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userProfile?.company_id, queryClient]);

  const todayStr = new Date().toDateString();
  const totalActionsToday = logs.filter(log => new Date(log.created_at).toDateString() === todayStr).length;
  const flaggedItemsCount = logs.filter(log => log.action?.toLowerCase().includes('reject') || log.action?.toLowerCase().includes('delete')).length;

  const formatLogDescription = (log: ActivityLog) => {
    const meta = getSafeMeta(log.metadata); // 🚀 Use safe parser
    const action = log.action ? log.action.toUpperCase() : '';

    switch (action) {
      case 'BULK_ADVANCE':
      case 'MOVE_STAGE':
        return `Advanced ${meta.count || meta.candidate_names?.length || 'multiple'} candidate(s)${meta.to_stage ? ` to ${meta.to_stage}` : ''}`;
      case 'BULK_REJECT':
      case 'REJECT_CANDIDATE':
        return `Rejected ${meta.count || meta.candidate_names?.length || 'multiple'} candidate(s)`;
      case 'BULK_ARCHIVE':
        return `Archived ${meta.count || meta.candidate_names?.length || 'multiple'} candidate(s)`;
      case 'CREATE_JOB':
        return `Created job posting: "${meta.title || 'Untitled Role'}" (${meta.location || 'Remote/On-site'})`;
      case 'UPDATE_CANDIDATE':
        return `Updated details for candidate: ${meta.candidate_name || log.entity_id.slice(0, 8)}`;
      default:
        return `Performed ${log.action} on ${log.entity}`;
    }
  };

  const filteredLogs = logs.filter(log => {
    const description = formatLogDescription(log).toLowerCase();
    
    const matchesSearch = 
      description.includes(searchTerm.toLowerCase()) ||
      (log.action && log.action.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (log.entity && log.entity.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (log.user_email && log.user_email.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesAction = actionTypeFilter === 'ALL' || log.action?.toUpperCase().includes(actionTypeFilter.toUpperCase());

    return matchesSearch && matchesAction;
  });

  return (
    <div className="p-8 max-w-7xl mx-auto w-full animate-in fade-in">
      
      {/* Top Bar with Search */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            Activity Log
          </h2>
          <p className="text-slate-500 mt-1 text-sm">Track team actions, stage updates, and workspace activity in real time.</p>
        </div>

        <div className="relative w-full md:w-80">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input 
            type="text" 
            placeholder="Search activity..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Timeline Feed */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <div className="flex items-center justify-between pb-6 border-b border-slate-100 mb-6">
            <h3 className="text-lg font-bold text-slate-900">Timeline</h3>
            <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-3 py-1 rounded-full">Newest First</span>
          </div>

          {isLoading ? (
            <div className="py-24 flex justify-center items-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="py-20 text-center text-slate-400">
              <Activity size={36} className="mx-auto text-slate-300 mb-3" />
              <p className="font-semibold text-slate-700">No activity recorded yet.</p>
              <button 
                onClick={() => queryClient.invalidateQueries({ queryKey: ['activity_logs'] })}
                className="mt-4 text-sm text-blue-600 hover:underline"
              >
                Force Refresh
              </button>
            </div>
          ) : (
            <div className="relative pl-6 border-l-2 border-slate-100 space-y-8">
              {filteredLogs.map((log) => {
                const formattedTime = new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                const formattedDate = new Date(log.created_at).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
                
                const userIdentifier = log.user_email || 'System User';
                const initials = userIdentifier.substring(0, 2).toUpperCase();
                const descriptionText = formatLogDescription(log);
                const meta = getSafeMeta(log.metadata); // 🚀 Use safe parser

                return (
                  <div key={log.id} className="relative group">
                    <div className="absolute -left-[31px] top-1 w-3.5 h-3.5 rounded-full border-2 border-white bg-blue-600 shadow-sm"></div>

                    <div className="bg-slate-50/70 border border-slate-200/60 rounded-xl p-4 transition-all hover:bg-slate-50">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-blue-600 text-white font-bold text-xs flex items-center justify-center shrink-0 shadow-sm">
                            {initials}
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-slate-900">
                              <span className="text-slate-900 mr-1.5 font-bold">{userIdentifier}</span>
                              <span className="text-slate-600 font-medium">{descriptionText}</span>
                            </p>
                            
                            <div className="flex items-center gap-2 mt-1.5">
                              <span className="uppercase text-[10px] bg-slate-200 text-slate-700 px-2 py-0.5 rounded font-bold tracking-wide">
                                {log.action.replace('_', ' ')}
                              </span>
                            </div>
                          </div>
                        </div>

                        <span className="text-xs text-slate-400 font-medium shrink-0 flex items-center gap-1">
                          <Clock size={12} /> {formattedDate}, {formattedTime}
                        </span>
                      </div>

                      {/* Render Candidate Names safely */}
                      {meta?.candidate_names && Array.isArray(meta.candidate_names) && (
                        <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap gap-1.5">
                          <span className="text-[11px] font-bold text-slate-400 mr-1 mt-0.5 uppercase tracking-wider">Targets:</span>
                          {meta.candidate_names.map((name: string, i: number) => (
                            <span key={i} className="bg-white text-blue-700 px-2.5 py-0.5 rounded-md text-[11px] font-semibold border border-blue-100 shadow-sm">
                              {name}
                            </span>
                          ))}
                        </div>
                      )}
                      
                      {/* Graceful Fallback for Old Data */}
                      {!meta?.candidate_names && meta?.candidate_ids && Array.isArray(meta.candidate_ids) && (
                        <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap gap-1.5">
                          <span className="text-[11px] font-bold text-slate-400 mr-1 mt-0.5 uppercase tracking-wider">Ref IDs:</span>
                          {meta.candidate_ids.map((id: string, i: number) => (
                            <span key={i} className="bg-white text-slate-500 px-2 py-0.5 rounded-md font-mono text-[10px] border border-slate-200 shadow-sm">
                              {id.slice(0, 8)}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Sidebar Filters & Highlights */}
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-4">
              <h4 className="font-bold text-slate-900 flex items-center gap-2 text-sm">
                <Filter size={16} className="text-blue-600" /> Filters
              </h4>
              <button 
                onClick={() => { setActionTypeFilter('ALL'); setSearchTerm(''); }}
                className="text-xs font-semibold text-blue-600 hover:text-blue-700 transition-colors"
              >
                Clear All
              </button>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wider">Action Type</label>
              <select 
                value={actionTypeFilter}
                onChange={(e) => setActionTypeFilter(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              >
                <option value="ALL">All Types</option>
                <option value="ADVANCE">Advance</option>
                <option value="REJECT">Reject</option>
                <option value="ARCHIVE">Archive</option>
                <option value="CREATE">Create</option>
              </select>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <h4 className="font-bold text-slate-900 text-sm mb-4 pb-3 border-b border-slate-100">Highlights</h4>
            
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                    <Zap size={16} />
                  </div>
                  <span className="text-xs font-semibold text-slate-700">Total Actions Today</span>
                </div>
                <span className="text-base font-bold text-slate-900 font-mono">{totalActionsToday}</span>
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-red-50 text-red-600 rounded-lg">
                    <ShieldAlert size={16} />
                  </div>
                  <span className="text-xs font-semibold text-slate-700">Flagged Items</span>
                </div>
                <span className="text-base font-bold text-red-600 font-mono">{flaggedItemsCount}</span>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}