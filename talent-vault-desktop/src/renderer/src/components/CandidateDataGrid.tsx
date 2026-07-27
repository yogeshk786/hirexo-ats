import React, { useMemo, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import "ag-grid-community/styles/ag-grid.css"; 
import "ag-grid-community/styles/ag-theme-quartz.css"; 
import { useAuth } from '../context/AuthContext'; 
import { useActivityLogger } from '../hooks/useActivityLogger'; 
import toast from 'react-hot-toast';

// Helper function to calculate Resume Age
const getTimeAgo = (dateString?: string) => {
    if (!dateString) return 'Unknown';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return 'Unknown';
    
    const days = Math.floor((new Date().getTime() - date.getTime()) / (1000 * 3600 * 24));
    
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 30) return `${days} days ago`;
    if (days < 365) return `${Math.floor(days / 30)} mo ago`;
    return `${Math.floor(days / 365)} yrs ago`;
};

// Smart Cell for Long Text (Summary)
const ExpandableTextCell = (params: any) => {
    const [expanded, setExpanded] = useState(false);
    const text = params.value;

    if (!text || text === '-') return <span className="text-slate-400 italic py-2 block">-</span>;
    
    const isLong = text.length > 80;
    if (!isLong) return <div className="py-2 leading-relaxed text-sm text-slate-700">{text}</div>;

    const displayedText = expanded ? text : text.slice(0, 80) + '...';

    const toggleExpand = (e: React.MouseEvent) => {
        e.stopPropagation();
        setExpanded(!expanded);
        setTimeout(() => params.api.resetRowHeights(), 0);
    };

    return (
        <div className="py-2 leading-relaxed whitespace-normal break-words text-sm text-slate-700">
            {displayedText}
            <button 
                onClick={toggleExpand}
                className="ml-2 text-blue-600 font-extrabold hover:underline text-[10px] uppercase tracking-wider bg-blue-50 px-1.5 py-0.5 rounded"
            >
                {expanded ? 'Show Less' : 'Read More'}
            </button>
        </div>
    );
};

// Smart Cell for Arrays (Skills, Languages, Certifications)
const ExpandableListCell = (params: any) => {
    const [expanded, setExpanded] = useState(false);
    let items = params.value;
    
    if (typeof items === 'string') items = items.split(',').map((s: string) => s.trim());
    if (!Array.isArray(items) || items.length === 0 || items[0] === '') return <span className="text-slate-400 italic py-2 block">-</span>;

    if (items.length <= 2) {
        return <div className="py-2 leading-relaxed text-sm text-slate-700">{items.join(', ')}</div>;
    }

    const displayedItems = expanded ? items : items.slice(0, 2);
    const hiddenCount = items.length - 2;

    const toggleExpand = (e: React.MouseEvent) => {
        e.stopPropagation();
        setExpanded(!expanded);
        setTimeout(() => params.api.resetRowHeights(), 0);
    };

    return (
        <div className="py-2 leading-relaxed whitespace-normal break-words text-sm text-slate-700">
            {displayedItems.join(', ')}
            {!expanded && <span>...</span>}
            <button 
                onClick={toggleExpand}
                className="ml-2 text-blue-600 font-extrabold hover:underline text-[10px] uppercase tracking-wider bg-blue-50 px-1.5 py-0.5 rounded inline-flex mt-1"
            >
                {expanded ? 'Show Less' : `+${hiddenCount} More`}
            </button>
        </div>
    );
};

// Smart Cell specifically for Custom Tags (Renders Blue Pills)
const TagsCellRenderer = (params: any) => {
    let tags = params.value;
    
    if (typeof tags === 'string') {
        try { tags = JSON.parse(tags); } catch { tags = [tags]; }
    }

    if (!Array.isArray(tags) || tags.length === 0) {
        return <span className="text-slate-400 italic text-xs py-2 block">-</span>;
    }

    return (
        <div className="flex flex-wrap gap-1.5 py-2 items-center h-full">
            {tags.map((tag: string, i: number) => (
                <span key={i} className="px-2 py-0.5 bg-blue-100 text-blue-700 text-[10px] font-black rounded-full uppercase tracking-wider border border-blue-200">
                    #{tag.replace(/^#/, '')}
                </span>
            ))}
        </div>
    );
};


export default function CandidateDataGrid({ 
  rowData, 
  onRowDoubleClicked, 
  onSelectionChanged,
  onCellEdit,
  onUpdateStatus
}: { 
  rowData: any[], 
  onRowDoubleClicked: (data: any) => void,
  onSelectionChanged?: (selectedRows: any[]) => void,
  onCellEdit?: (id: string, field: string, value: string) => void,
  onUpdateStatus?: (id: string, status: string) => void
}) {

  const { userProfile } = useAuth();
  const { logActivity } = useActivityLogger();

  const userRole = userProfile?.role || 'Interviewer';
  const canEditDetails = ['Admin', 'Lead HR', 'Recruiter'].includes(userRole);
  const canManagePipeline = ['Admin', 'Lead HR', 'Hiring Manager', 'Recruiter'].includes(userRole);

  const colDefs = useMemo(() => [
    { 
        field: "name", 
        headerName: "Candidate Name", 
        filter: "agTextColumnFilter", 
        pinned: "left", 
        width: 260,
        checkboxSelection: canManagePipeline,      
        headerCheckboxSelection: canManagePipeline, 
        cellRenderer: (params: any) => (
            <strong 
                onClick={(e) => {
                    e.stopPropagation();
                    onRowDoubleClicked(params.data); 
                }}
                className="text-blue-600 cursor-pointer hover:underline"
            >
                {params.value}
            </strong>
        )
    },
    { 
        field: "match_score", 
        headerName: "AI Score", 
        width: 110,
        filter: "agNumberColumnFilter",
        valueGetter: (params: any) => params.data?.match_score || params.data?.match,
        cellRenderer: (params: any) => (
            <span className="font-extrabold text-blue-600 bg-blue-50 px-2 py-1 rounded">
                {params.value ? `${params.value}%` : '-'}
            </span>
        )
    },
    
    {
        colId: "application_summary",
        headerName: "Application Pipeline",
        width: 280,
        autoHeight: true, 
        filter: "agTextColumnFilter",
        valueGetter: (params: any) => {
            const apps = params.data?.job_applications || [];
            if (apps.length === 0) return "Direct Pool";
            return apps.map((a: any) => a.jobs?.title).join(", ");
        },
        cellRenderer: (params: any) => {
            const apps = params.data?.job_applications || [];

            if (apps.length === 0) {
                return (
                    <div className="flex flex-col justify-center h-full py-2 leading-tight">
                        <span className="font-bold text-slate-400 italic">Direct Pool</span>
                        <div className="mt-1">
                            <span className="px-2 py-0.5 border border-dashed border-slate-200 bg-slate-50 text-slate-400 text-[9px] font-extrabold rounded-full uppercase tracking-wide">
                                UNASSIGNED
                            </span>
                        </div>
                    </div>
                );
            }

            return (
                <div className="flex flex-col gap-3 py-2 h-full justify-center">
                    {apps.map((app: any, idx: number) => {
                        const jobTitle = app.jobs?.title || 'Unknown Job';
                        const status = app.status || 'Unassigned';
                        const score = app.match_score;

                        let color = "bg-slate-100 text-slate-700 border-slate-200";
                        if (status === 'Sourcing' || status === 'AI Matched') color = "bg-blue-50 text-blue-700 border-blue-200";
                        if (status === 'Assessment') color = "bg-purple-50 text-purple-700 border-purple-200";
                        if (status === 'Interview') color = "bg-amber-50 text-amber-700 border-amber-200";
                        if (status === 'Hired') color = "bg-emerald-50 text-emerald-700 border-emerald-200";
                        if (status === 'Rejected') color = "bg-red-50 text-red-700 border-red-200";
                        if (status === 'Archived') color = "bg-slate-100 text-slate-500 border-slate-300";

                        return (
                            <div key={idx} className="flex flex-col leading-tight border-b border-slate-100 pb-2 last:border-0 last:pb-0">
                                <div className="flex items-center gap-2">
                                    <span className="font-bold text-slate-800 truncate">{jobTitle}</span>
                                    {score !== undefined && score !== null && (
                                        <span className="bg-emerald-100 text-emerald-700 text-[9px] font-black px-1.5 py-0.5 rounded border border-emerald-200 whitespace-nowrap">
                                            {score}% Fit
                                        </span>
                                    )}
                                </div>
                                <div className="mt-1">
                                    <span className={`px-2 py-0.5 border text-[9px] font-extrabold rounded-full uppercase tracking-wider inline-block ${color}`}>
                                        {status}
                                    </span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            );
        }
    },

    {
        field: "resume_url",
        headerName: "Resume",
        width: 110,
        cellRenderer: (params: any) => {
            if (!params.value) return <span className="text-slate-400 text-xs italic">No PDF</span>;
            return (
                <a 
                    href={params.value} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()} 
                    className="px-3 py-1 bg-slate-100 hover:bg-blue-50 text-slate-600 hover:text-blue-600 text-xs font-bold rounded border border-slate-200 hover:border-blue-200 transition-colors flex items-center justify-center mt-1.5"
                >
                    View PDF
                </a>
            );
        }
    },

    { 
        colId: "role",
        headerName: "Standard Role", 
        filter: "agTextColumnFilter",
        valueGetter: (params: any) => params.data?.role || params.data?.segmentation?.standardized_title || "Uncategorized",
        width: 200
    },

    {
        field: "tags",
        headerName: "Custom Tags",
        autoHeight: true,
        wrapText: true,
        valueGetter: (params: any) => params.data?.tags,
        cellRenderer: TagsCellRenderer,
        filter: "agTextColumnFilter",
        width: 220
    },

    { 
        colId: "exp", 
        headerName: "Exp. (Yrs)", 
        filter: "agTextColumnFilter",
        valueGetter: (params: any) => {
            if (params.data?.exp) return params.data.exp;
            if (params.data?.total_experience_years !== undefined) return `${params.data.total_experience_years} Years Exp`;
            return "-";
        },
        width: 130
    },

    {
        colId: "source",
        headerName: "Source",
        width: 150,
        filter: "agTextColumnFilter",
        valueGetter: (params: any) => {
            const apps = params.data?.job_applications || [];
            if (apps.length > 0) return "AI Match Pipeline";
            return "Email Intake";
        },
        cellRenderer: (params: any) => {
            const isAI = params.value === "AI Match Pipeline";
            return (
                <span className={`px-2.5 py-1 border text-[11px] font-bold rounded-full mt-2 inline-block ${
                    isAI ? 'bg-purple-50 text-purple-700 border-purple-200' : 'bg-slate-50 text-slate-600 border-slate-200'
                }`}>
                    {params.value}
                </span>
            );
        }
    },

    {
        colId: "date_added", 
        headerName: "Added Date",
        width: 140,
        filter: "agDateColumnFilter",
        valueGetter: (params: any) => params.data?.created_at || params.data?.email_received_at,
        cellRenderer: (params: any) => {
            if (!params.value) return <span className="text-slate-400">-</span>;
            const ageText = getTimeAgo(params.value);
            const isFresh = ageText === 'Today' || ageText === 'Yesterday' || ageText.includes('days');
            const exactDate = new Date(params.value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

            return (
                <div className="flex flex-col justify-center h-full py-1.5">
                    <span className={`w-max px-2 py-0.5 text-[10px] font-bold rounded mb-0.5 ${isFresh ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'text-slate-500 bg-slate-100 border border-slate-200'}`}>
                        {ageText}
                    </span>
                    <span className="text-[10px] font-semibold text-slate-400 tracking-wide">{exactDate}</span>
                </div>
            );
        }
    },
    
    { 
        colId: "fullWorkHistory",
        headerName: "Full Work History", 
        autoHeight: true,  
        wrapText: true,    
        width: 320,
        filter: "agTextColumnFilter",
        floatingFilterComponent: 'agTextColumnFloatingFilter', 
        valueGetter: (params: any) => {
            const exp = params.data?.work_experience || [];
            return exp.map((j: any) => `${j.job_title} ${j.company}`).join(' | ');
        },
        cellRenderer: (params: any) => {
            const exp = params.data?.work_experience;
            if (!exp || exp.length === 0) return <div className="text-slate-400 italic text-xs py-3">No experience listed</div>;
            return (
                <div className="py-3 space-y-3">
                    {exp.map((job: any, i: number) => (
                        <div key={i} className="text-xs leading-tight border-b border-slate-200 last:border-0 pb-3 last:pb-0">
                            <span className="font-extrabold text-slate-800">{job.job_title}</span><br/>
                            <span className="text-slate-600 font-medium">{job.company}</span>
                            {job.duration_months > 0 && <span className="text-slate-400 ml-1">({job.duration_months} mo)</span>}
                        </div>
                    ))}
                </div>
            );
        }
    },

    { 
        colId: "fullEducation",
        headerName: "Education", 
        autoHeight: true,
        wrapText: true,
        width: 280,
        filter: "agTextColumnFilter",
        floatingFilterComponent: 'agTextColumnFloatingFilter', 
        valueGetter: (params: any) => {
            const edu = params.data?.education || [];
            return edu.map((s: any) => `${s.degree} ${s.institution}`).join(' | ');
        },
        cellRenderer: (params: any) => {
            const edu = params.data?.education;
            if (!edu || edu.length === 0) return <div className="text-slate-400 italic text-xs py-3">No education listed</div>;
            return (
                <div className="py-3 space-y-3">
                    {edu.map((school: any, i: number) => (
                        <div key={i} className="text-xs leading-tight border-b border-slate-200 last:border-0 pb-3 last:pb-0">
                            <span className="font-extrabold text-blue-800">{school.degree}</span><br/>
                            <span className="text-slate-600">{school.institution}</span>
                            {school.year && <span className="text-slate-400 ml-1">'{school.year}</span>}
                        </div>
                    ))}
                </div>
            );
        }
    },

    { 
        field: "technical_skills",
        headerName: "Tech Skills", 
        autoHeight: true,  
        wrapText: true,    
        cellRenderer: ExpandableListCell, 
        filter: "agTextColumnFilter",
        width: 250 
    },
    
    { 
        field: "soft_skills",
        headerName: "Soft Skills", 
        autoHeight: true,
        wrapText: true,
        cellRenderer: ExpandableListCell,
        filter: "agTextColumnFilter",
        width: 250 
    },

    { 
        field: "languages",
        headerName: "Languages", 
        autoHeight: true,
        wrapText: true,
        cellRenderer: ExpandableListCell,
        filter: "agTextColumnFilter",
        width: 200 
    },

    { 
        field: "certifications",
        headerName: "Certifications", 
        autoHeight: true,
        wrapText: true,
        valueGetter: (params: any) => {
            const certs = params.data?.certifications;
            if (!Array.isArray(certs)) return [];
            return certs.map((c: any) => typeof c === 'string' ? c : c.name).filter(Boolean);
        },
        cellRenderer: ExpandableListCell,
        filter: "agTextColumnFilter",
        width: 250 
    },

    { 
        field: "summary", 
        headerName: "Summary", 
        autoHeight: true,
        wrapText: true,
        cellRenderer: ExpandableTextCell, 
        filter: "agTextColumnFilter", 
        width: 350
    },

    { field: "location", headerName: "Location", filter: "agTextColumnFilter", width: 160, editable: canEditDetails, cellClass: canEditDetails ? "hover:bg-blue-50/50 cursor-text" : "" },
    { field: "email", headerName: "Email", filter: "agTextColumnFilter", width: 220, editable: canEditDetails, cellClass: canEditDetails ? "hover:bg-blue-50/50 cursor-text" : "" },
    { field: "phone", headerName: "Phone", filter: "agTextColumnFilter", width: 150, editable: canEditDetails, cellClass: canEditDetails ? "hover:bg-blue-50/50 cursor-text" : "" },

    // Actions Column with Smart Validation & Instant Optimistic Updates
    {
        headerName: "Actions",
        width: 140,
        sortable: false,
        filter: false,
        hide: !canManagePipeline, 
        cellRenderer: (params: any) => {
            const candidateId = params.data.id || params.data._id; 
            const currentStatus = params.data.status;

            return (
                <div className="flex items-center gap-2 h-full py-2">
                    {/* ADVANCE BUTTON */}
                    <button 
                        onClick={(e) => { 
                            e.stopPropagation(); 
                            if (currentStatus === 'Advanced') {
                                toast.error("Candidate is already in the Advanced stage.");
                                return;
                            }
                            if(onUpdateStatus) {
                                onUpdateStatus(candidateId, 'Advanced');
                                logActivity('MOVE_STAGE', 'Candidate', candidateId, {
                                    candidate_name: params.data.name,
                                    to_stage: 'Advanced'
                                });
                            } 
                        }}
                        className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 hover:text-emerald-700 flex items-center justify-center transition-colors border border-emerald-100 shadow-sm"
                        title="Advance Candidate"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7"></path></svg>
                    </button>

                    {/* REJECT BUTTON */}
                    <button 
                        onClick={(e) => { 
                            e.stopPropagation(); 
                            if (currentStatus === 'Rejected') {
                                toast.error("Candidate is already Rejected.");
                                return;
                            }
                            if(onUpdateStatus) {
                                onUpdateStatus(candidateId, 'Rejected');
                                logActivity('REJECT_CANDIDATE', 'Candidate', candidateId, {
                                    candidate_name: params.data.name,
                                    to_stage: 'Rejected'
                                });
                            }
                        }}
                        className="w-8 h-8 rounded-lg bg-red-50 text-red-500 hover:bg-red-100 hover:text-red-600 flex items-center justify-center transition-colors border border-red-100 shadow-sm"
                        title="Reject Candidate"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12"></path></svg>
                    </button>

                    {/* ARCHIVE BUTTON */}
                    <button 
                        onClick={(e) => { 
                            e.stopPropagation(); 
                            if (currentStatus === 'Archived') {
                                toast.error("Candidate is already Archived.");
                                return;
                            }
                            if(onUpdateStatus) {
                                onUpdateStatus(candidateId, 'Archived');
                                logActivity('MOVE_STAGE', 'Candidate', candidateId, {
                                    candidate_name: params.data.name,
                                    to_stage: 'Archived'
                                });
                            }
                        }}
                        className="w-8 h-8 rounded-lg bg-slate-50 text-slate-500 hover:bg-slate-200 hover:text-slate-700 flex items-center justify-center transition-colors border border-slate-200 shadow-sm"
                        title="Archive Candidate"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"></path></svg>
                    </button>
                </div>
            );
        }
    }
  ], [onUpdateStatus, canManagePipeline, canEditDetails, onRowDoubleClicked, logActivity]);

  const defaultColDef = useMemo(() => ({
    sortable: true,
    resizable: true,
    floatingFilter: true, 
    filterParams: { maxNumConditions: 1 }
  }), []);

  const customIcons = useMemo(() => ({
    menu: '<svg class="w-4 h-4 text-slate-400 hover:text-blue-600 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"></path></svg>',
    filter: '<svg class="w-4 h-4 text-slate-400 hover:text-blue-600 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"></path></svg>',
    sortAscending: '<svg class="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 15l7-7 7 7"></path></svg>',
    sortDescending: '<svg class="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7-7-7-7"></path></svg>',
    first: '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M11 19l-7-7 7-7m8 14l-7-7 7-7"></path></svg>',
    previous: '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M15 19l-7-7 7-7"></path></svg>',
    next: '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 5l7 7-7 7"></path></svg>',
    last: '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M13 5l7 7-7 7M5 5l7 7-7 7"></path></svg>',
    checkboxChecked: '<svg class="w-5 h-5 text-blue-600" fill="currentColor" viewBox="0 0 24 24"><path d="M19 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.11 0 2-.9 2-2V5c0-1.1-.89-2-2-2zm-9 14l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>',
    checkboxUnchecked: '<svg class="w-5 h-5 text-slate-300" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>',
    checkboxIndeterminate: '<svg class="w-5 h-5 text-blue-600" fill="currentColor" viewBox="0 0 24 24"><path d="M19 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.11 0 2-.9 2-2V5c0-1.1-.89-2-2-2zm-2 10H7v-2h10v2z"/></svg>',
    cancel: '<svg class="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>',
    clear: '<svg class="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>'
  }), []);

  return (
    <>
        <style>{`
            .ag-theme-quartz .ag-floating-filter-button-button,
            .ag-theme-quartz .ag-header-cell-menu-button {
                background: transparent !important;
                border: none !important;
                box-shadow: none !important;
                cursor: pointer;
                padding: 4px;
                opacity: 0.7;
                transition: all 0.2s;
            }
            .ag-theme-quartz .ag-floating-filter-button-button:hover,
            .ag-theme-quartz .ag-header-cell-menu-button:hover {
                background: #f1f5f9 !important;
                border-radius: 6px;
                opacity: 1;
            }
            .ag-theme-quartz .ag-cell-inline-editing {
                border: 2px solid #2563eb !important;
                border-radius: 6px;
                box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);
            }
        `}</style>

        <div className="ag-theme-quartz w-full h-full rounded-xl overflow-hidden shadow-sm border border-slate-200 cursor-pointer">
            <AgGridReact
                rowData={rowData} 
                columnDefs={colDefs}
                defaultColDef={defaultColDef}
                icons={customIcons} 
                rowSelection="multiple" 
                suppressRowClickSelection={true} 
                pagination={true}
                paginationPageSize={50}
                animateRows={true} 
                enableCellTextSelection={true}
                
                onSelectionChanged={(e) => {
                    if (onSelectionChanged) {
                        onSelectionChanged(e.api.getSelectedRows());
                    }
                }}
                onCellValueChanged={(event) => {
                    if (event.oldValue !== event.newValue && onCellEdit) {
                        const candidateId = event.data.id || event.data._id;
                        const fieldName = event.colDef.field;
                        if (fieldName && candidateId) {
                            onCellEdit(candidateId, fieldName, event.newValue);
                            
                            logActivity('UPDATE_CANDIDATE', 'Candidate', candidateId, {
                                candidate_name: event.data.name,
                                field_updated: fieldName,
                                old_value: event.oldValue,
                                new_value: event.newValue
                            });
                        }
                    }
                }}
            />
        </div>
    </>
  );
}