/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useMemo } from 'react';
import { 
  Plus, 
  LayoutDashboard,
  Search,
  ArrowUpDown,
  Check,
  ChevronUp,
  ChevronDown,
  RotateCcw,
  Briefcase, 
  TrendingUp, 
  AlertCircle, 
  ChevronRight, 
  DollarSign, 
  ArrowLeft,
  Trash2,
  CheckCircle2,
  Clock,
  LogOut,
  User,
  Banknote,
  Eye,
  Lock,
  History,
  List,
  MessageSquare,
  PenLine,
  PlusCircle,
  ShieldCheck,
  Settings,
  Users,
  UserPlus,
  UserCheck,
  UserX,
  Download,
  Sun,
  Moon
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  Cell,
  PieChart,
  Pie
} from 'recharts';
import { format } from 'date-fns';
import { cs } from 'date-fns/locale';
import { cn, formatCurrency, formatPercent } from './lib/utils';
import type { Project, CostItem, CostCategory, ActivityLog, ActivityType, AppUser } from './types';
import { supabase, signInWithGoogle, logout } from './lib/supabase';
import { User as SupabaseUser } from '@supabase/supabase-js';
import * as db from './lib/supabaseService';

const CATEGORY_COLORS: Record<CostCategory, string> = {
  'materiál': '#3b82f6',
  'práce': '#64748b',
  'subdodávky': '#8b5cf6',
  'doprava': '#10b981',
  'režie': '#f59e0b',
  'ostatní': '#6366f1'
};

const exportToCsv = (filename: string, rows: string[][]) => {
  const csvContent = "\uFEFF" + rows.map(e => e.map(val => `"${String(val).replace(/"/g, '""')}"`).join(";")).join("\n");
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement("a");
  if (link.download !== undefined) {
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
};

export default function App() {
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [loading, setLoading] = useState(true);
  
  const [projects, setProjects] = useState<Project[]>([]);
  const [allCosts, setAllCosts] = useState<CostItem[]>([]);
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [users, setUsers] = useState<AppUser[]>([]);
  
  const isSU = user?.email === 'krasnykarlik@gmail.com';

  const [activeTab, setActiveTab] = useState<'dashboard' | 'projects' | 'admin'>('dashboard');

  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [isAddingProject, setIsAddingProject] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [isAddingCost, setIsAddingCost] = useState(false);
  const [editingCost, setEditingCost] = useState<CostItem | null>(null);
  const [alertThreshold, setAlertThreshold] = useState(90);
  const [isThresholdModalOpen, setIsThresholdModalOpen] = useState(false);
  
  const [confirmConfig, setConfirmConfig] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {}
  });

  // Auth Observer (Bypass pro vývoj)
  useEffect(() => {
    // Vytvoříme falešného uživatele, aby nás to hned pustilo dál
    const mockUser = {
      id: 'dev-karel-123',
      email: 'krasnykarlik@gmail.com', // Tímto se stáváš SuperUserem
      user_metadata: { full_name: 'Karel (Vývojář)' }
    } as SupabaseUser;
    
    setUser(mockUser);
    db.saveUser({
      uid: mockUser.id,
      email: mockUser.email || '',
      displayName: mockUser.user_metadata.full_name
    });
    setLoading(false);
  }, []);

  // Data Subscriptions
  useEffect(() => {
    if (!user) {
      setProjects([]);
      setAllCosts([]);
      setUsers([]);
      return;
    }

    const unsubProjects = db.subscribeToProjects(setProjects);
    const unsubCosts = db.subscribeToAllCosts(setAllCosts);
    const unsubLogs = db.subscribeToLogs(20, setLogs);
    const unsubSettings = db.subscribeToSettings((settings) => {
      if (settings.alertThreshold) {
        setAlertThreshold(settings.alertThreshold);
      }
    });
    
    let unsubUsers = () => {};
    if (isSU) {
      unsubUsers = db.subscribeToUsers(setUsers);
    }

    return () => {
      unsubProjects();
      unsubCosts();
      unsubLogs();
      unsubUsers();
      unsubSettings();
    };
  }, [user, isSU]);

  const selectedProject = useMemo(() => 
    projects.find(p => p.id === selectedProjectId),
    [projects, selectedProjectId]
  );

  const projectCosts = useMemo(() => 
    allCosts.filter(c => c.projectId === selectedProjectId),
    [allCosts, selectedProjectId]
  );

  const totalCostsByProject = useMemo(() => {
    const totals: Record<string, number> = {};
    allCosts.forEach(c => {
      totals[c.projectId] = (totals[c.projectId] || 0) + c.amount;
    });
    return totals;
  }, [allCosts]);

  const stats = useMemo(() => {
    const visibleProjects = projects.filter(p => p.status !== 'smazáno');
    const visibleProjectIds = new Set(visibleProjects.map(p => p.id));
    const visibleCosts = allCosts.filter(c => visibleProjectIds.has(c.projectId));

    const totalOffer = visibleProjects.reduce((acc, p) => acc + p.offerPrice, 0);
    const totalSpent = visibleCosts.reduce((acc, c) => acc + c.amount, 0);
    const activeProjects = projects.filter(p => p.status === 'aktivní').length;
    
    return {
      totalOffer,
      totalSpent,
      remaining: Math.max(0, totalOffer - totalSpent),
      activeProjects,
      percentSpent: totalOffer > 0 ? totalSpent / totalOffer : 0,
      totalProfit: totalOffer - totalSpent
    };
  }, [projects, allCosts]);

  // Actions
  const handleAddProject = async (projectData: Omit<Project, 'id'>) => {
    const id = await db.createProject(projectData);
    if (id) {
      await db.createLog({
        type: 'create_project',
        targetId: id,
        targetName: projectData.name,
        details: `Vytvořena zakázka za ${formatCurrency(projectData.offerPrice)}`
      });
    }
    setIsAddingProject(false);
  };

  const handleAddCost = async (costData: Omit<CostItem, 'id' | 'projectId'>) => {
    if (!selectedProjectId || !selectedProject) return;
    const id = await db.createCost({ ...costData, projectId: selectedProjectId });
    if (id) {
       await db.createLog({
         type: 'create_cost',
         targetId: id,
         targetName: costData.description,
         details: `K zakázce "${selectedProject.name}" přidán náklad ${formatCurrency(costData.amount)}`
       });
    }
    setIsAddingCost(false);
  };

  const handleUpdateCost = async (costData: Partial<CostItem>) => {
    if (!editingCost || !selectedProject) return;
    await db.updateCost(editingCost.id, costData);
    await db.createLog({
      type: 'update_cost',
      targetId: editingCost.id,
      targetName: costData.description || editingCost.description,
      details: `Upraven náklad u zakázky "${selectedProject.name}". Nová částka: ${formatCurrency(costData.amount || editingCost.amount)}`
    });
    setEditingCost(null);
  };

  const handleDeleteCost = (id: string) => {
    const cost = allCosts.find(c => c.id === id);
    if (!cost) return;

    setConfirmConfig({
      isOpen: true,
      title: 'Smazat položku',
      message: 'Opravdu chcete smazat tento náklad?',
      onConfirm: async () => {
        await db.deleteCost(id);
        await db.createLog({
          type: 'delete_cost',
          targetId: id,
          targetName: cost.description,
          details: `Smazán náklad ve výši ${formatCurrency(cost.amount)}`
        });
        setConfirmConfig(prev => ({ ...prev, isOpen: false }));
      }
    });
  };

  const handleUpdateProjectDetails = async (id: string, data: Partial<Project>) => {
    await db.updateProject(id, data);
    setProjects(prev => prev.map(p => p.id === id ? { ...p, ...data } : p));
    setEditingProject(null);
    
    // Log the change
    await db.createLog({
      type: 'update_project',
      targetId: id,
      targetName: data.name || 'Zakázka',
      details: `Upraveny základní údaje zakázky`
    });
  };

  const handleUpdateProject = async (projectId: string, data: Partial<Project>) => {
    await db.updateProject(projectId, data);
    setProjects(prev => prev.map(p => p.id === projectId ? { ...p, ...data } : p));
  };

  const handleFinishProject = (id: string) => {
    const project = projects.find(p => p.id === id);
    if (!project) return;

    setConfirmConfig({
      isOpen: true,
      title: 'Dokončit zakázku',
      message: 'Opravdu chcete tuto zakázku označit jako dokončenou?',
      onConfirm: async () => {
        await handleUpdateProject(id, { status: 'dokončeno' });
        await db.createLog({
          type: 'finish_project',
          targetId: id,
          targetName: project.name,
          details: 'Zakázka označena jako dokončená'
        });
        setConfirmConfig(prev => ({ ...prev, isOpen: false }));
      }
    });
  };

  const handleDeleteProject = (id: string) => {
    const project = projects.find(p => p.id === id);
    if (!project) return;

    setConfirmConfig({
      isOpen: true,
      title: 'Přesunout do koše',
      message: 'Opravdu chcete tuto zakázku přesunout do smazaných? Budete ji moci později obnovit nebo trvale smazat.',
      onConfirm: async () => {
        await handleUpdateProject(id, { status: 'smazáno' });
        await db.createLog({
          type: 'delete_project',
          targetId: id,
          targetName: project.name,
          details: 'Zakázka přesunuta do koše'
        });
        setSelectedProjectId(null);
        setConfirmConfig(prev => ({ ...prev, isOpen: false }));
      }
    });
  };

  const handlePermanentDeleteProject = (id: string) => {
    const project = projects.find(p => p.id === id);
    if (!project) return;

    setConfirmConfig({
      isOpen: true,
      title: 'Trvale smazat',
      message: 'Opravdu chcete tuto zakázku trvale smazat? Tato akce je nevratná a smaže i všechny související náklady.',
      onConfirm: async () => {
        await db.deleteProject(id);
        await db.createLog({
          type: 'delete_project',
          targetId: id,
          targetName: project.name,
          details: 'Zakázka trvale smazána z databáze'
        });
        setSelectedProjectId(null);
        setConfirmConfig(prev => ({ ...prev, isOpen: false }));
      }
    });
  };

  const handleRestoreProject = async (id: string) => {
    const project = projects.find(p => p.id === id);
    if (!project) return;

    await handleUpdateProject(id, { status: 'aktivní' });
    await db.createLog({
      type: 'restore_project',
      targetId: id,
      targetName: project.name,
      details: 'Zakázka obnovena do aktivních'
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f8fafc] p-6">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white p-8 rounded-2xl shadow-xl border border-slate-200 max-w-md w-full text-center"
        >
          <div className="w-16 h-16 bg-blue-600 rounded-2xl mx-auto flex items-center justify-center text-white mb-6 shadow-lg rotate-3">
             <TrendingUp size={32} />
          </div>
          <h2 className="text-2xl font-bold text-slate-900 mb-2">Kontrola nákladů</h2>
          <p className="text-blue-600 font-bold text-xs uppercase tracking-widest mb-6">Hrnčíře Edition</p>
          <p className="text-slate-500 mb-8 font-medium">Přihlaste se pro bezpečný přístup k vašim zakázkám a nákladům z jakéhokoliv zařízení.</p>
          <button 
            onClick={signInWithGoogle}
            className="w-full bg-white border border-slate-200 p-4 rounded-xl font-bold flex items-center justify-center gap-3 hover:bg-slate-50 transition-all shadow-sm"
          >
            <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="w-5 h-5" referrerPolicy="no-referrer" />
            Přihlásit se přes Google
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8fafc] text-[#1e293b] font-sans selection:bg-blue-100">
      {/* Sidebar Navigation */}
      <nav className="fixed left-0 top-0 h-full w-20 md:w-64 bg-[#0f172a] border-r border-[#1e293b] flex flex-col z-50">
        <div className="p-6 flex items-center gap-3 border-bottom border-[#1e293b]">
          <div className="w-10 h-10 bg-blue-500 rounded-xl flex items-center justify-center text-white shrink-0 shadow-lg shadow-blue-500/20">
            <Banknote size={24} />
          </div>
          <div className="hidden md:block">
            <span className="font-bold text-sm tracking-tight text-white uppercase block leading-none">Kontrola nákladů</span>
            <span className="text-[10px] font-bold text-blue-500 uppercase tracking-widest block mt-1">Hrnčíře Edition</span>
          </div>
        </div>
        
        <div className="flex-1 mt-6 px-3 space-y-1">
          <button 
            onClick={() => { setActiveTab('dashboard'); setSelectedProjectId(null); }}
            className={cn(
              "w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 group text-sm font-medium",
              activeTab === 'dashboard' ? "bg-blue-500 text-white" : "hover:bg-[#1e293b] text-[#cbd5e1]"
            )}
          >
            <LayoutDashboard size={18} className={cn("shrink-0", activeTab === 'dashboard' ? "text-white" : "group-hover:text-white")} />
            <span className="hidden md:block">Dashboard</span>
          </button>
          
          <button 
            onClick={() => { setActiveTab('projects'); setSelectedProjectId(null); }}
            className={cn(
              "w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 group text-sm font-medium",
              activeTab === 'projects' ? "bg-blue-500 text-white" : "hover:bg-[#1e293b] text-[#cbd5e1]"
            )}
          >
            <Briefcase size={18} className={cn("shrink-0", activeTab === 'projects' ? "text-white" : "group-hover:text-white")} />
            <span className="hidden md:block">Zakázky</span>
          </button>
          
          {isSU && (
            <button 
              onClick={() => { setActiveTab('admin'); setSelectedProjectId(null); }}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 group text-sm font-medium",
                activeTab === 'admin' ? "bg-blue-500 text-white" : "hover:bg-[#1e293b] text-[#cbd5e1]"
              )}
            >
              <ShieldCheck size={18} className={cn("shrink-0", activeTab === 'admin' ? "text-white" : "group-hover:text-white")} />
              <span className="hidden md:block">Správa (SU)</span>
            </button>
          )}
        </div>

        <div className="p-3 border-t border-[#1e293b]">
           <div className="bg-[#1e293b]/50 rounded-xl p-3 flex items-center gap-3 mb-4 overflow-hidden">
             {user.photoURL ? (
               <img src={user.photoURL} alt={user.displayName || ''} className="w-8 h-8 rounded-full border border-slate-700" referrerPolicy="no-referrer" />
             ) : (
               <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-white">
                 <User size={16} />
               </div>
             )}
             <div className="hidden md:block truncate">
               <p className="text-xs font-bold text-white truncate">{user.displayName || 'Uživatel'}</p>
               <button onClick={logout} className="text-[10px] text-slate-400 hover:text-white flex items-center gap-1 transition-colors">
                 <LogOut size={10} />
                 Odhlásit se
               </button>
             </div>
           </div>
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="ml-20 md:ml-64 min-h-screen">
        <header className="bg-white border-b border-slate-200 h-16 px-8 flex items-center justify-between sticky top-0 z-40">
          <div className="flex items-center gap-4">
            {selectedProjectId && (
              <button 
                onClick={() => setSelectedProjectId(null)}
                className="bg-white border border-slate-200 px-3 py-1.5 rounded-lg text-sm font-medium hover:border-slate-300 transition-colors shadow-sm flex items-center gap-2"
              >
                <ArrowLeft size={16} />
                <span className="hidden sm:inline">Zpět</span>
              </button>
            )}
            <h1 className="text-lg font-semibold text-[#0f172a]">
              {selectedProjectId ? selectedProject?.name : activeTab === 'dashboard' ? 'Dashboard' : activeTab === 'admin' ? 'Uživatelé' : 'Zakázky'}
            </h1>
          </div>
          
          <div className="flex items-center gap-4">
            {!selectedProjectId && activeTab !== 'admin' && (
              <button 
                onClick={() => setIsAddingProject(true)}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors shadow-sm flex items-center gap-2"
              >
                <Plus size={16} />
                <span>Nová zakázka</span>
              </button>
            )}
          </div>
        </header>

        <div className="p-8">
          <AnimatePresence mode="wait">
            {selectedProjectId ? (
              <ProjectDetail 
                project={selectedProject!} 
                costs={projectCosts}
                onAddCost={() => setIsAddingCost(true)}
                onEditCost={setEditingCost}
                onDeleteCost={handleDeleteCost}
                onDeleteProject={handleDeleteProject}
                onUpdateProject={handleUpdateProject}
                onEditProject={setEditingProject}
                onDeletePermanent={handlePermanentDeleteProject}
                onConfirm={setConfirmConfig}
                currentUserId={user!.id}
                isSU={isSU}
                allUsers={users}
              />
            ) : activeTab === 'dashboard' ? (
              <DashboardView 
                stats={stats} 
                projects={projects} 
                totals={totalCostsByProject} 
                onProjectClick={setSelectedProjectId}
                logs={logs}
                alertThreshold={alertThreshold}
                onOpenThresholdSettings={() => setIsThresholdModalOpen(true)}
              />
            ) : activeTab === 'admin' ? (
              <AdminView users={users} />
            ) : (
              <ProjectsListView 
                projects={projects} 
                totals={totalCostsByProject} 
                onProjectClick={setSelectedProjectId}
                onEditProject={setEditingProject}
                onFinishProject={handleFinishProject}
                onRestoreProject={handleRestoreProject}
                onPermanentDelete={handlePermanentDeleteProject}
                currentUserId={user!.id}
                isSU={isSU}
                allUsers={users}
              />
            )}
          </AnimatePresence>
        </div>
      </main>


      {/* Modals */}
      <Modal isOpen={isAddingProject} onClose={() => setIsAddingProject(false)} title="Vytvořit novou zakázku">
        <ProjectForm onSubmit={handleAddProject} onCancel={() => setIsAddingProject(false)} />
      </Modal>

      <Modal isOpen={!!editingProject} onClose={() => setEditingProject(null)} title="Upravit zakázku">
        <ProjectForm 
          initialData={editingProject || undefined}
          onSubmit={(data) => handleUpdateProjectDetails(editingProject!.id, data)} 
          onCancel={() => setEditingProject(null)} 
        />
      </Modal>

      <Modal isOpen={isThresholdModalOpen} onClose={() => setIsThresholdModalOpen(false)} title="Nastavení limitu upozornění">
        <div className="space-y-6">
          <p className="text-sm text-slate-500">Nastavte procentuální limit čerpání rozpočtu, při kterém se má zakázka zobrazit v modulu upozornění.</p>
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Limit čerpání (%)</label>
            <div className="flex items-center gap-4">
              <input 
                type="range" 
                min="10" 
                max="100" 
                step="5"
                value={alertThreshold}
                onChange={(e) => setAlertThreshold(Number(e.target.value))}
                className="flex-1 h-2 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-blue-600"
              />
              <span className="font-mono font-bold text-lg w-12 text-right">{alertThreshold}%</span>
            </div>
          </div>
          <button 
            onClick={async () => {
              await db.updateSettings({ alertThreshold });
              setIsThresholdModalOpen(false);
            }}
            className="w-full py-3 bg-blue-600 text-white rounded-xl font-bold uppercase tracking-widest text-xs hover:bg-blue-700 transition-colors"
          >
            Uložit nastavení
          </button>
        </div>
      </Modal>

      <Modal isOpen={isAddingCost} onClose={() => setIsAddingCost(false)} title="Přidat náklad k zakázce">
        <CostForm onSubmit={handleAddCost} onCancel={() => setIsAddingCost(false)} />
      </Modal>

      <Modal isOpen={!!editingCost} onClose={() => setEditingCost(null)} title="Upravit náklad">
        <CostForm 
          initialData={editingCost || undefined} 
          onSubmit={handleUpdateCost} 
          onCancel={() => setEditingCost(null)} 
        />
      </Modal>

      <ConfirmDialog 
        isOpen={confirmConfig.isOpen}
        onClose={() => setConfirmConfig(prev => ({ ...prev, isOpen: false }))}
        onConfirm={confirmConfig.onConfirm}
        title={confirmConfig.title}
        message={confirmConfig.message}
      />
    </div>
  );
}

// Subcomponents

function DashboardView({ stats, projects, totals, onProjectClick, logs, alertThreshold, onOpenThresholdSettings }: { 
  stats: any, 
  projects: Project[], 
  totals: Record<string, number>,
  onProjectClick: (id: string) => void,
  logs: ActivityLog[],
  alertThreshold: number,
  onOpenThresholdSettings: () => void
}) {
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const chartData = useMemo(() => {
    return projects
      .filter(p => p.status === 'aktivní')
      .slice(0, 5)
      .map(p => ({
        name: p.name.length > 20 ? p.name.substring(0, 17) + '...' : p.name,
        spent: totals[p.id] || 0,
        budget: p.offerPrice,
        remaining: Math.max(0, p.offerPrice - (totals[p.id] || 0))
      }));
  }, [projects, totals]);

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="space-y-8"
    >
      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard 
          label="Celková hodnota nabídek" 
          value={formatCurrency(stats.totalOffer)} 
          icon={<DollarSign className="text-blue-600" />} 
          color="blue"
        />
        <StatCard 
          label="Skutečné náklady" 
          value={formatCurrency(stats.totalSpent)} 
          subValue={`${formatPercent(stats.percentSpent)} z nabídek`}
          icon={<TrendingUp className="text-blue-600" />} 
          color="blue"
          trend="V rámci plánu"
        />
        <StatCard 
          label="Aktuální zisk" 
          value={formatCurrency(stats.totalProfit)} 
          icon={<DollarSign className={cn("text-emerald-600", stats.totalProfit < 0 && "text-red-500")} />} 
          color={stats.totalProfit >= 0 ? "emerald" : "red"}
          trend={stats.totalProfit >= 0 ? "Kladná bilance" : "Očekávaná ztráta"}
        />
        <StatCard 
          label="Aktivní zakázky" 
          value={stats.activeProjects} 
          icon={<Briefcase className="text-slate-600" />} 
          color="slate"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Chart */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
          <div className="flex items-center justify-between mb-8">
            <h3 className="font-semibold text-slate-800">Čerpání rozpočtu - aktivní zakázky</h3>
            <div className="flex gap-4 text-[10px] font-bold uppercase tracking-wider text-slate-400">
              <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 bg-slate-400 rounded-full"></span> Rozpočet</div>
              <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 bg-red-400 rounded-full"></span> Čerpáno</div>
            </div>
          </div>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} layout="vertical" margin={{ left: 20, right: 30 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#f1f5f9" />
                <XAxis type="number" hide />
                <YAxis dataKey="name" type="category" width={100} axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748b', fontWeight: 500 }} />
                <Tooltip 
                  cursor={{ fill: '#f8fafc' }}
                  contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}
                  formatter={(value: number) => [formatCurrency(value), '']}
                />
                <Bar dataKey="budget" fill="#94a3b8" radius={[0, 4, 4, 0]} barSize={20} />
                <Bar dataKey="spent" fill="#f87171" radius={[0, 4, 4, 0]} barSize={20} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Recent Activity or Warnings */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-semibold text-slate-800">Upozornění a stav</h3>
            <button 
              onClick={onOpenThresholdSettings}
              className="p-1.5 hover:bg-slate-50 rounded-lg text-slate-400 hover:text-blue-600 transition-colors"
              title="Nastavení limitu"
            >
              <Settings size={14} />
            </button>
          </div>
          <div className="space-y-4">
            {projects.filter(p => p.status === 'aktivní' && (totals[p.id] || 0) > p.offerPrice * (alertThreshold / 100)).length === 0 ? (
              <div className="text-center py-12">
                <CheckCircle2 size={40} className="text-emerald-100 mx-auto mb-3" />
                <p className="text-slate-400 text-sm font-medium">Aktivní zakázky jsou pod kontrolou.</p>
              </div>
            ) : (
              projects
                .filter(p => p.status === 'aktivní' && (totals[p.id] || 0) > p.offerPrice * (alertThreshold / 100))
                .map(p => {
                  const spent = totals[p.id] || 0;
                  const ratio = spent / p.offerPrice;
                  return (
                    <div key={p.id} onClick={() => onProjectClick(p.id)} className="p-4 rounded-lg border border-red-100 bg-red-50/50 cursor-pointer hover:bg-red-50 transition-colors">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-bold text-xs uppercase tracking-wider text-red-900 truncate max-w-[140px]">{p.name}</span>
                        <AlertCircle size={14} className="text-red-500" />
                      </div>
                      <div className="w-full bg-red-100 h-1.5 rounded-full overflow-hidden mb-2">
                        <div 
                          className="h-full bg-red-500 transition-all font-bold" 
                          style={{ width: `${Math.min(100, ratio * 100)}%` }}
                        />
                      </div>
                      <p className="text-[10px] font-bold text-red-600 uppercase tracking-widest">
                        {formatPercent(ratio)} limitu
                      </p>
                    </div>
                  );
                })
            )}
          </div>
        </div>
      </div>

      {/* Activity History Section */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <button 
          onClick={() => setIsHistoryOpen(!isHistoryOpen)}
          className="w-full px-6 py-4 flex items-center justify-between hover:bg-slate-50 transition-colors"
        >
          <div className="flex items-center gap-3">
             <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600">
               <History size={18} />
             </div>
             <h3 className="font-semibold text-slate-800">Historie aktivit a zápisů</h3>
          </div>
          <div className="flex items-center gap-4">
             <span className="text-xs text-slate-400 font-medium">{logs.length} záznamů</span>
             {isHistoryOpen ? <ChevronUp size={20} className="text-slate-400" /> : <ChevronDown size={20} className="text-slate-400" />}
          </div>
        </button>

        <AnimatePresence>
          {isHistoryOpen && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="px-6 pb-6 pt-2 border-t border-slate-50">
                <div className="space-y-1">
                  {logs.length === 0 ? (
                    <div className="text-center py-8 text-slate-400 text-sm italic">
                      Zatím zde nejsou žádné záznamy.
                    </div>
                  ) : (
                    logs.map((log) => (
                      <div key={log.id} className="group flex items-start gap-4 p-3 rounded-lg hover:bg-slate-50 transition-colors border-b border-slate-50 last:border-0">
                        <div className={cn(
                          "mt-0.5 p-2 rounded-lg bg-opacity-10 shrink-0",
                          log.type.includes('delete') ? "bg-red-500 text-red-600" : 
                          log.type.includes('create') ? "bg-emerald-500 text-emerald-600" :
                          log.type.includes('finish') ? "bg-blue-500 text-blue-600" : "bg-slate-500 text-slate-600"
                        )}>
                           {log.type === 'create_project' && <Briefcase size={14} />}
                           {log.type === 'create_cost' && <PlusCircle size={14} />}
                           {log.type === 'delete_project' && <Trash2 size={14} />}
                           {log.type === 'delete_cost' && <Trash2 size={14} />}
                           {log.type === 'finish_project' && <CheckCircle2 size={14} />}
                           {log.type === 'restore_project' && <RotateCcw size={14} />}
                           {log.type === 'update_project' && <PenLine size={14} />}
                           {log.type === 'update_cost' && <PenLine size={14} />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-bold text-slate-800">{log.userName}</span>
                            <span className="text-[10px] lowercase font-medium text-slate-400 px-1.5 py-0.5 rounded-full bg-slate-100">
                              {log.type === 'create_project' && 'Vytvořil zakázku'}
                              {log.type === 'create_cost' && 'Přidal náklad'}
                              {log.type === 'delete_project' && 'Smazal zakázku'}
                              {log.type === 'delete_cost' && 'Smazal náklad'}
                              {log.type === 'finish_project' && 'Dokončil zakázku'}
                              {log.type === 'restore_project' && 'Obnovil zakázku'}
                              {log.type === 'update_project' && 'Upravil zakázku'}
                              {log.type === 'update_cost' && 'Upravil náklad'}
                              {log.type === 'update_editors' && 'Upravil editory'}
                            </span>
                            <span className="text-xs text-slate-500 truncate font-semibold">
                              {log.targetName}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 mt-1 text-[11px]">
                             <span className="text-slate-400 flex items-center gap-1">
                               <Clock size={10} />
                               {log.timestamp && format(new Date(log.timestamp), 'HH:mm (d. M. yyyy)', { locale: cs })}
                             </span>
                             {log.details && <span className="text-slate-500 italic">• {log.details}</span>}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>

  );
}

function AdminView({ users }: { users: AppUser[] }) {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="space-y-6"
    >
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-50 bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center">
              <Users size={20} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900">Správa uživatelů</h2>
              <p className="text-xs text-slate-400 font-medium">Celkem {users.length} zaregistrovaných uživatelů</p>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="px-6 py-4 text-[10px] text-slate-400 font-bold uppercase tracking-widest">Uživatel</th>
                <th className="px-6 py-4 text-[10px] text-slate-400 font-bold uppercase tracking-widest">E-mail</th>
                <th className="px-6 py-4 text-[10px] text-slate-400 font-bold uppercase tracking-widest">Naposledy přihlášen</th>
                <th className="px-6 py-4 text-[10px] text-slate-400 font-bold uppercase tracking-widest">ID Uživatele</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {users.map(u => (
                <tr key={u.uid} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      {u.photoURL ? (
                        <img src={u.photoURL} alt={u.displayName} className="w-8 h-8 rounded-full border border-slate-100" referrerPolicy="no-referrer" />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center">
                          <User size={16} />
                        </div>
                      )}
                      <div>
                        <p className="text-sm font-bold text-slate-900">{u.displayName}</p>
                        {u.email === 'krasnykarlik@gmail.com' && (
                          <span className="text-[10px] font-bold text-blue-500 uppercase tracking-tighter bg-blue-50 px-1 rounded">Super User</span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-600 font-medium">
                    {u.email}
                  </td>
                  <td className="px-6 py-4 text-xs text-slate-400 font-mono">
                    {u.lastLogin ? format(new Date(u.lastLogin), 'd. M. yyyy HH:mm', { locale: cs }) : '—'}
                  </td>
                  <td className="px-6 py-4 text-[10px] font-mono text-slate-300">
                    {u.uid}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </motion.div>
  );
}

function ProjectsListView({ projects, totals, onProjectClick, onEditProject, onFinishProject, onRestoreProject, onPermanentDelete, currentUserId, isSU, allUsers }: { 
  projects: Project[], 
  totals: Record<string, number>, 
  onProjectClick: (id: string) => void,
  onEditProject: (p: Project) => void,
  onFinishProject: (id: string) => void,
  onRestoreProject: (id: string) => void,
  onPermanentDelete: (id: string) => void,
  currentUserId: string,
  isSU: boolean,
  allUsers: AppUser[]
}) {
  const [filterType, setFilterType] = useState<'aktivní' | 'dokončeno' | 'smazáno'>('aktivní');
  const [search, setSearch] = useState('');
  const [sortConfig, setSortConfig] = useState<{ key: keyof Project | 'spent' | 'ratio' | 'profit'; direction: 'asc' | 'desc' }>({
    key: 'startDate',
    direction: 'desc'
  });

  const filteredProjects = useMemo(() => {
    let result = projects.filter(p => p.status === filterType);
    
    if (search) {
      const s = search.toLowerCase();
      result = result.filter(p => p.name.toLowerCase().includes(s));
    }

    result.sort((a, b) => {
      let aVal: any;
      let bVal: any;

      if (sortConfig.key === 'spent') {
        aVal = totals[a.id] || 0;
        bVal = totals[b.id] || 0;
      } else if (sortConfig.key === 'profit') {
        aVal = a.offerPrice - (totals[a.id] || 0);
        bVal = b.offerPrice - (totals[b.id] || 0);
      } else if (sortConfig.key === 'ratio') {
        aVal = (totals[a.id] || 0) / (a.offerPrice || 1);
        bVal = (totals[b.id] || 0) / (b.offerPrice || 1);
      } else {
        aVal = (a as any)[sortConfig.key];
        bVal = (b as any)[sortConfig.key];
      }

      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });

    return result;
  }, [projects, filterType, search, sortConfig, totals]);

  const toggleSort = (key: typeof sortConfig.key) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const handleExport = () => {
    const headers = ['Název zakázky', 'Zadavatel', 'Stav', 'Datum zahájení', 'Datum ukončení', 'Cenová nabídka', 'Náklady', 'Zisk', 'Čerpání (%)'];
    const rows = filteredProjects.map(p => {
      const spent = totals[p.id] || 0;
      const profit = p.offerPrice - spent;
      const ratio = spent / (p.offerPrice || 1);
      
      const ownerName = allUsers.find(u => u.uid === p.ownerId)?.displayName;
      const displayZadavatel = ownerName ? ownerName : (p.ownerId === currentUserId ? 'Já' : 'Neznámý');

      return [
        p.name,
        displayZadavatel,
        p.status,
        format(new Date(p.startDate), 'dd.MM.yyyy'),
        p.endDate ? format(new Date(p.endDate), 'dd.MM.yyyy') : '',
        p.offerPrice.toString(),
        spent.toString(),
        profit.toString(),
        (Math.round(ratio * 100)).toString()
      ];
    });
    
    exportToCsv('zakazky.csv', [headers, ...rows]);
  };

  const SortIcon = ({ column }: { column: typeof sortConfig.key }) => {
    if (sortConfig.key !== column) return <ArrowUpDown size={12} className="ml-1 opacity-20" />;
    return sortConfig.direction === 'asc' ? <ChevronUp size={12} className="ml-1 text-blue-500" /> : <ChevronDown size={12} className="ml-1 text-blue-500" />;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex bg-slate-100 p-1 rounded-xl w-fit shadow-inner">
          <button 
            onClick={() => setFilterType('aktivní')}
            className={cn(
              "px-6 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all",
              filterType === 'aktivní' ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
            )}
          >
            Aktivní ({projects.filter(p => p.status === 'aktivní').length})
          </button>
          <button 
            onClick={() => setFilterType('dokončeno')}
            className={cn(
              "px-6 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all",
              filterType === 'dokončeno' ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
            )}
          >
            Dokončené ({projects.filter(p => p.status === 'dokončeno').length})
          </button>
          <button 
            onClick={() => setFilterType('smazáno')}
            className={cn(
              "px-6 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all",
              filterType === 'smazáno' ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
            )}
          >
            Smazané ({projects.filter(p => p.status === 'smazáno').length})
          </button>
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto">
          <button
            onClick={handleExport}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-xl text-sm font-medium hover:bg-slate-50 transition-colors shadow-sm"
            title="Exportovat do Excelu"
          >
            <Download size={16} className="text-slate-400" />
            <span className="hidden sm:inline">Exportovat</span>
          </button>
          <div className="relative flex-1 md:flex-none">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input 
              type="text"
              placeholder="Hledat zakázku..."
              className="pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 transition-all w-full md:w-64"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden"
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-bottom border-slate-200 bg-slate-50">
                <th className="px-6 py-3 cursor-pointer select-none group" onClick={() => toggleSort('name')}>
                  <div className="flex items-center text-[11px] font-bold uppercase tracking-widest text-[#64748b]">
                    Zakázka <SortIcon column="name" />
                  </div>
                </th>
                <th className="px-6 py-3 text-right cursor-pointer select-none group" onClick={() => toggleSort('offerPrice')}>
                  <div className="flex items-center justify-end text-[11px] font-bold uppercase tracking-widest text-[#64748b]">
                    Cenová nabídka <SortIcon column="offerPrice" />
                  </div>
                </th>
                <th className="px-6 py-3 text-right cursor-pointer select-none group" onClick={() => toggleSort('spent')}>
                  <div className="flex items-center justify-end text-[11px] font-bold uppercase tracking-widest text-[#64748b]">
                    Náklady <SortIcon column="spent" />
                  </div>
                </th>
                <th className="px-6 py-3 text-right cursor-pointer select-none group" onClick={() => toggleSort('profit')}>
                  <div className="flex items-center justify-end text-[11px] font-bold uppercase tracking-widest text-[#64748b]">
                    Zisk <SortIcon column="profit" />
                  </div>
                </th>
                <th className="px-6 py-3 cursor-pointer select-none group" onClick={() => toggleSort('ratio')}>
                  <div className="flex items-center text-[11px] font-bold uppercase tracking-widest text-[#64748b]">
                    Čerpání <SortIcon column="ratio" />
                  </div>
                </th>
                <th className="px-6 py-3 text-center cursor-pointer select-none group" onClick={() => toggleSort('status')}>
                  <div className="flex items-center justify-center text-[11px] font-bold uppercase tracking-widest text-[#64748b]">
                    Stav <SortIcon column="status" />
                  </div>
                </th>
                <th className="px-6 py-3 w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredProjects.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-20 text-center text-slate-400">
                    <div className="flex flex-col items-center gap-2">
                       <Briefcase size={32} className="opacity-20 mb-2" />
                       <p className="font-medium">Nenalezeny žádné zakázky</p>
                       <p className="text-xs">Zkuste upravit hledaný výraz nebo přepnout záložku.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredProjects.map(p => {
                  const spent = totals[p.id] || 0;
                  const ratio = spent / (p.offerPrice || 1);
                  const isEditor = (p.editors || []).includes(currentUserId);
                  const canEdit = p.ownerId === currentUserId || isSU || isEditor;

                  return (
                    <tr 
                      key={p.id} 
                      className="hover:bg-slate-50 transition-colors cursor-pointer group"
                    >
                      <td className="px-6 py-4" onClick={() => onProjectClick(p.id)}>
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-slate-900 text-sm">{p.name}</p>
                          {!canEdit && (
                            <div className="flex items-center gap-1 bg-amber-50 text-amber-600 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase border border-amber-100">
                              <Lock size={10} />
                              Pouze ke čtení
                            </div>
                          )}
                          {isEditor && p.ownerId !== currentUserId && !isSU && (
                            <div className="flex items-center gap-1 bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase border border-blue-100">
                              <PenLine size={10} />
                              Editor
                            </div>
                          )}
                        </div>
                        <p className="text-[10px] text-slate-400 font-bold uppercase mt-0.5 tracking-tighter">
                          {format(new Date(p.startDate), 'd. M. yyyy')} {p.endDate ? `— ${format(new Date(p.endDate), 'd. M. yyyy')}` : ''}
                        </p>
                      </td>
                      <td className="px-6 py-4 font-mono text-right text-xs font-semibold" onClick={() => onProjectClick(p.id)}>
                        {formatCurrency(p.offerPrice)}
                      </td>
                      <td className="px-6 py-4 font-mono text-right text-xs font-bold text-blue-600" onClick={() => onProjectClick(p.id)}>
                        {formatCurrency(spent)}
                      </td>
                      <td className={cn(
                        "px-6 py-4 font-mono text-right text-xs font-bold",
                        p.offerPrice - spent < 0 ? "text-red-500" : "text-emerald-600"
                      )} onClick={() => onProjectClick(p.id)}>
                        {formatCurrency(p.offerPrice - spent)}
                      </td>
                      <td className="px-6 py-4 w-48" onClick={() => onProjectClick(p.id)}>
                        <div className="space-y-1.5">
                          <div className="flex items-center text-[10px] font-bold text-slate-500 uppercase text-left">
                            <span>{formatCurrency(spent)}</span>
                          </div>
                          <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                            <div 
                              className={cn("h-full transition-all", ratio > 1 ? "bg-red-500" : ratio > 0.8 ? "bg-amber-500" : "bg-blue-500")} 
                              style={{ width: `${Math.min(100, ratio * 100)}%` }}
                            />
                          </div>
                          <div className="flex items-center text-[10px] font-bold text-slate-500 uppercase text-left">
                            <span>{Math.round(ratio * 100)}%</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center" onClick={() => onProjectClick(p.id)}>
                        <span className={cn(
                          "px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider",
                          p.status === 'aktivní' ? "bg-emerald-50 text-emerald-700" : 
                          p.status === 'dokončeno' ? "bg-slate-100 text-slate-600" : "bg-red-50 text-red-700"
                        )}>
                          {p.status === 'aktivní' ? 'Aktivní' : p.status === 'dokončeno' ? 'Dokončeno' : 'Smazáno'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <div className="flex items-center justify-end gap-2">
                           {canEdit ? (
                             <>
                               {p.status === 'aktivní' && (
                                 <>
                                   <button 
                                     onClick={(e) => { e.stopPropagation(); onEditProject(p); }}
                                     className="p-2 text-slate-300 hover:text-blue-500 transition-colors rounded-lg hover:bg-blue-50 shadow-none border-none"
                                     title="Upravit zakázku"
                                    >
                                      <PenLine size={16} />
                                    </button>
                                    <button
                                      onClick={(e) => { e.stopPropagation(); onFinishProject(p.id); }}
                                      className="p-2 text-slate-300 hover:text-emerald-600 transition-colors rounded-lg hover:bg-emerald-50 shadow-none border-none"
                                      title="Dokončit zakázku"
                                    >
                                      <CheckCircle2 size={16} />
                                    </button>
                                 </>
                               )}
                               {p.status !== 'aktivní' && (
                                 <div className="flex items-center">
                                   <button
                                     onClick={(e) => { e.stopPropagation(); onRestoreProject(p.id); }}
                                     className="p-2 text-slate-300 hover:text-blue-600 transition-colors rounded-lg hover:bg-blue-50 shadow-none border-none"
                                     title="Obnovit"
                                   >
                                     <RotateCcw size={16} />
                                   </button>
                                   {p.status === 'smazáno' && (
                                     <button
                                       onClick={(e) => { e.stopPropagation(); onPermanentDelete(p.id); }}
                                       className="p-2 text-slate-300 hover:text-red-600 transition-colors rounded-lg hover:bg-red-50 shadow-none border-none"
                                       title="Trvale smazat"
                                     >
                                       <Trash2 size={16} />
                                     </button>
                                   )}
                                 </div>
                               )}
                             </>
                           ) : (
                             <div className="p-2 text-slate-300" title="Pouze ke čtení">
                               <Eye size={16} />
                             </div>
                           )}
                           <button 
                             onClick={() => onProjectClick(p.id)}
                             className="p-2 text-slate-300 group-hover:text-blue-600 transition-colors rounded-lg"
                           >
                             <ChevronRight size={16} />
                           </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </motion.div>
    </div>
  );
}


function ProjectDetail({ project, costs, onAddCost, onEditCost, onDeleteCost, onDeleteProject, onUpdateProject, onEditProject, onDeletePermanent, onConfirm, currentUserId, isSU, allUsers }: { 
  project: Project, 
  costs: CostItem[], 
  onAddCost: () => void,
  onEditCost: (cost: CostItem) => void,
  onDeleteCost: (id: string) => void,
  onDeleteProject: (id: string) => void,
  onUpdateProject: (id: string, data: Partial<Project>) => void,
  onEditProject: (p: Project) => void,
  onDeletePermanent: (id: string) => void,
  onConfirm: (config: any) => void,
  currentUserId: string,
  isSU: boolean,
  allUsers: AppUser[]
}) {
  const [isManagingEditors, setIsManagingEditors] = useState(false);

  const totalsByCategory = useMemo(() => {
    const totals: Record<string, number> = { materiál: 0, práce: 0, subdodávky: 0, doprava: 0, režie: 0, ostatní: 0 };
    costs.forEach(c => {
      totals[c.category] = (totals[c.category] || 0) + c.amount;
    });
    return Object.entries(totals).map(([name, value]) => ({ name, value }));
  }, [costs]);

  const totalSpent = costs.reduce((acc, c) => acc + c.amount, 0);

  const handleFinish = () => {
    onConfirm({
      isOpen: true,
      title: 'Dokončit zakázku',
      message: 'Opravdu chcete tuto zakázku označit jako dokončenou?',
      onConfirm: () => {
        onUpdateProject(project.id, { status: 'dokončeno' });
        onConfirm((prev: any) => ({ ...prev, isOpen: false }));
      }
    });
  };

  const handleRestore = () => {
    onUpdateProject(project.id, { status: 'aktivní' });
  };

  const handleDelete = () => {
    onDeleteProject(project.id); // This will now trigger the custom confirm in parent
  };

  const handleExport = () => {
    const headers = ['Typ', 'Popis položky', 'Kategorie', 'Cena celkem', 'Poznámka', 'Datum'];
    
    const offerRow = [
      'Nabídka',
      `Cenová nabídka - ${project.name}`,
      'Příjem',
      project.offerPrice.toString(),
      '',
      format(new Date(project.startDate), 'dd.MM.yyyy')
    ];

    const costsRows = costs.map(c => [
      'Náklad',
      c.description,
      c.category,
      (-c.amount).toString(),
      c.note || '',
      format(new Date(c.date), 'dd.MM.yyyy')
    ]);
    
    exportToCsv(`zakazka-${project.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.csv`, [headers, offerRow, ...costsRows]);
  };

  const isOwner = project.ownerId === currentUserId || isSU;
  const isEditor = (project.editors || []).includes(currentUserId);
  const canEdit = isOwner || isEditor;
  const isDirectOwner = project.ownerId === currentUserId || isSU;

  const toggleEditor = async (userId: string) => {
    const currentEditors = project.editors || [];
    const newEditors = currentEditors.includes(userId)
      ? currentEditors.filter(id => id !== userId)
      : [...currentEditors, userId];
    
    await onUpdateProject(project.id, { editors: newEditors });
    
    // Log the change
    const targetUser = allUsers.find(u => u.uid === userId);
    await db.createLog({
      type: 'update_editors',
      targetId: project.id,
      targetName: project.name,
      details: `${currentEditors.includes(userId) ? 'Odebrán' : 'Přidán'} editor: ${targetUser?.displayName || userId}`
    });
  };

  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="space-y-8 pb-20"
    >
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left: Summary Info */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
            <div className="flex items-center justify-between mb-6">
               <h3 className="font-bold uppercase tracking-wider text-xs text-gray-400">Souhrn hospodaření</h3>
               <div className="flex items-center gap-2">
                 {!canEdit && (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-amber-50 text-amber-600 flex items-center gap-1 border border-amber-100">
                      <Lock size={10} />
                      Čtení
                    </span>
                 )}
                 {isEditor && !isOwner && (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-blue-50 text-blue-600 flex items-center gap-1 border border-blue-100">
                      <PenLine size={10} />
                      Editor
                    </span>
                 )}
                 <span className={cn(
                   "px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider",
                   project.status === 'aktivní' ? "bg-emerald-50 text-emerald-700" : 
                   project.status === 'dokončeno' ? "bg-slate-100 text-slate-600" : "bg-red-50 text-red-600"
                 )}>
                   {project.status === 'aktivní' ? 'Aktivní' : project.status === 'dokončeno' ? 'Dokončeno' : 'Smazáno'}
                 </span>
                 {canEdit && project.status === 'aktivní' && (
                    <button 
                      onClick={() => onEditProject(project)}
                      className="ml-2 p-1 px-2 border border-slate-100 rounded text-[10px] font-bold uppercase text-slate-400 hover:text-blue-600 hover:border-blue-100 transition-colors flex items-center gap-1"
                      title="Upravit zakázku"
                    >
                      <PenLine size={10} />
                      Upravit
                    </button>
                 )}
               </div>
            </div>
            
            <div className="space-y-4">
              <div className="flex justify-between items-end">
                <span className="text-sm text-gray-500">Cenová nabídka</span>
                <span className="font-mono font-bold text-lg">{formatCurrency(project.offerPrice)}</span>
              </div>
              <div className="flex justify-between items-end">
                <span className="text-sm text-gray-500">Čerpáno</span>
                <span className="font-mono font-bold text-lg text-blue-600">{formatCurrency(totalSpent)}</span>
              </div>
              <div className="pt-2 border-t border-gray-50">
                <div className="flex justify-between items-end mb-2">
                  <span className="text-sm font-bold">Zbývá</span>
                  <span className={cn(
                    "font-mono font-black text-xl",
                    project.offerPrice - totalSpent < 0 ? "text-red-500" : "text-emerald-600"
                  )}>
                    {formatCurrency(project.offerPrice - totalSpent)}
                  </span>
                </div>
                <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
                  <div 
                    className={cn("h-full transition-all", totalSpent > project.offerPrice ? "bg-red-500" : "bg-blue-500")} 
                    style={{ width: `${Math.min(100, (totalSpent / project.offerPrice) * 100)}%` }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Editors Management Section */}
          <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
             <div className="flex items-center justify-between mb-6">
                <h3 className="font-bold uppercase tracking-wider text-xs text-gray-400">Přístup k úpravám</h3>
                {isDirectOwner && (
                  <button 
                    onClick={() => setIsManagingEditors(!isManagingEditors)}
                    className="p-1.5 hover:bg-slate-50 rounded-lg text-slate-400 hover:text-blue-600 transition-colors"
                    title="Spravovat editory"
                  >
                    <Settings size={14} />
                  </button>
                )}
             </div>

             <div className="space-y-3">
               <div className="flex -space-x-2 overflow-hidden mb-4">
                 {/* Owner */}
                 <div className="w-8 h-8 rounded-full border-2 border-white bg-slate-100 flex items-center justify-center overflow-hidden" title="Majitel zakázky">
                    <ShieldCheck size={14} className="text-slate-400" />
                 </div>
                 {/* Editors */}
                 {(project.editors || []).map(editorId => {
                   const editor = allUsers.find(u => u.uid === editorId);
                   return (
                     <div key={editorId} className="w-8 h-8 rounded-full border-2 border-white bg-blue-50 flex items-center justify-center overflow-hidden" title={editor?.displayName || 'Editor'}>
                       {editor?.photoURL ? (
                         <img src={editor.photoURL} alt={editor.displayName} referrerPolicy="no-referrer" />
                       ) : (
                         <User size={14} className="text-blue-500" />
                       )}
                     </div>
                   );
                 })}
                 {isDirectOwner && (
                   <button 
                    onClick={() => setIsManagingEditors(true)}
                    className="w-8 h-8 rounded-full border-2 border-dashed border-slate-200 bg-slate-50 flex items-center justify-center text-slate-400 hover:text-blue-600 hover:border-blue-200 transition-colors"
                   >
                     <UserPlus size={14} />
                   </button>
                 )}
               </div>

               {isManagingEditors && isDirectOwner && (
                 <motion.div 
                   initial={{ opacity: 0, height: 0 }}
                   animate={{ opacity: 1, height: 'auto' }}
                   className="pt-2 space-y-2 max-h-[300px] overflow-y-auto pr-1"
                 >
                   {allUsers.filter(u => u.uid !== project.ownerId).map(u => {
                     const isEditor = (project.editors || []).includes(u.uid);
                     return (
                       <div key={u.uid} className="flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-slate-100">
                         <div className="flex items-center gap-2 min-w-0">
                           {u.photoURL ? (
                             <img src={u.photoURL} alt={u.displayName} className="w-6 h-6 rounded-full" referrerPolicy="no-referrer" />
                           ) : (
                             <User size={12} className="text-slate-400" />
                           )}
                           <div className="truncate">
                             <p className="text-[11px] font-bold text-slate-900 truncate">{u.displayName}</p>
                             <p className="text-[9px] text-slate-400 truncate">{u.email}</p>
                           </div>
                         </div>
                         <button 
                           onClick={() => toggleEditor(u.uid)}
                           className={cn(
                             "p-1.5 rounded-lg transition-colors",
                             isEditor ? "text-emerald-500 hover:bg-emerald-50" : "text-slate-300 hover:bg-white"
                           )}
                           title={isEditor ? 'Odebrat editory' : 'Povolit úpravy'}
                         >
                           {isEditor ? <UserCheck size={16} /> : <UserPlus size={16} />}
                         </button>
                       </div>
                     );
                   })}
                 </motion.div>
               )}
               
               <p className="text-[10px] text-slate-400 italic">
                 { (project.editors || []).length === 0 
                   ? 'K této zakázce zatím nemá nikdo jiný přístup pro úpravy.' 
                   : `K úpravám mají přístup ${(project.editors || []).length} další uživatelé.`
                 }
               </p>
             </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
            <h3 className="font-bold mb-6 uppercase tracking-wider text-xs text-gray-400">Rozdělení nákladů</h3>
            <div className="h-[200px] flex items-center justify-center">
              {costs.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={totalsByCategory.filter(t => t.value > 0)}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {totalsByCategory.filter(t => t.value > 0).map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={CATEGORY_COLORS[entry.name as CostCategory]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: number) => formatCurrency(value)} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-xs text-gray-400 italic">Žádná data</p>
              )}
            </div>
          </div>

          <div className="space-y-3">
             {canEdit ? (
                <>
                  {project.status === 'aktivní' && (
                    <button 
                      onClick={handleFinish}
                      className="w-full p-4 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 transition-colors flex items-center justify-center gap-2 text-sm font-bold uppercase tracking-widest shadow-sm"
                    >
                      <CheckCircle2 size={16} />
                      Dokončit zakázku
                    </button>
                  )}
                  
                  {project.status === 'dokončeno' && (
                    <button 
                      onClick={handleRestore}
                      className="w-full p-4 rounded-xl border border-blue-100 text-blue-600 hover:bg-blue-50 transition-colors flex items-center justify-center gap-2 text-sm font-bold uppercase tracking-widest"
                    >
                      <RotateCcw size={16} />
                      Obnovit do aktivních
                    </button>
                  )}

                  {project.status === 'smazáno' ? (
                    isOwner ? (
                      <>
                        <button 
                          onClick={handleRestore}
                          className="w-full p-4 rounded-xl bg-blue-600 text-white hover:bg-blue-700 transition-colors flex items-center justify-center gap-2 text-sm font-bold uppercase tracking-widest shadow-sm"
                        >
                          <RotateCcw size={16} />
                          Obnovit z koše
                        </button>
                        <button 
                          onClick={() => onDeletePermanent(project.id)}
                          className="w-full p-4 rounded-xl border border-red-500 text-red-500 hover:bg-red-50 transition-colors flex items-center justify-center gap-2 text-sm font-bold uppercase tracking-widest group shadow-sm bg-red-100/30"
                        >
                          <Trash2 size={16} className="group-hover:animate-pulse" />
                          Smazat natrvalo
                        </button>
                      </>
                    ) : (
                      <div className="p-4 rounded-xl bg-red-50 border border-red-100 text-red-400 text-center space-y-2">
                        <Trash2 size={24} className="mx-auto" />
                        <p className="text-[10px] font-bold uppercase tracking-widest">Zakázka je v koši</p>
                        <p className="text-[9px]">Pouze majitel může obnovit nebo smazat.</p>
                      </div>
                    )
                  ) : (
                    isOwner && (
                      <button 
                        onClick={handleDelete}
                        className="w-full p-4 rounded-xl border border-red-100 text-red-500 hover:bg-red-50 transition-colors flex items-center justify-center gap-2 text-sm font-bold uppercase tracking-widest group"
                      >
                        <Trash2 size={16} className="group-hover:animate-pulse" />
                        Smazat zakázku
                      </button>
                    )
                  )}
                </>
             ) : (
               <div className="p-4 rounded-xl bg-slate-50 border border-slate-100 text-slate-400 text-center space-y-2">
                 <Lock size={20} className="mx-auto" />
                 <p className="text-[10px] font-bold uppercase tracking-widest">Zakázka jiného uživatele</p>
                 <p className="text-[9px]">Máte přístup pouze k prohlížení.</p>
               </div>
             )}
          </div>
        </div>

        {/* Right: Costs List */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex flex-col">
          <div className="p-6 border-b border-gray-50 flex items-center justify-between bg-gray-50/50">
            <div>
              <h3 className="font-bold text-lg">Položkový rozpis nákladů</h3>
              <p className="text-xs text-gray-400 font-mono uppercase mt-1">Celkem {costs.length} záznamů</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleExport}
                className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors shadow-sm"
                title="Exportovat do Excelu"
              >
                <Download size={16} className="text-slate-400" />
                <span className="hidden sm:inline">Exportovat</span>
              </button>
              {canEdit && (
                <button 
                  onClick={onAddCost}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors flex items-center gap-2 shadow-sm"
                >
                  <Plus size={16} />
                  Nová položka
                </button>
              )}
            </div>
          </div>
          
          <div className="flex-1 overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="px-6 py-3 text-[10px] text-slate-400 font-bold uppercase tracking-widest">Datum</th>
                  <th className="px-6 py-3 text-[10px] text-slate-400 font-bold uppercase tracking-widest">Popis</th>
                  <th className="px-6 py-3 text-[10px] text-slate-400 font-bold uppercase tracking-widest">Kategorie</th>
                  <th className="px-6 py-3 text-[10px] text-slate-400 font-bold uppercase tracking-widest text-right">Částka</th>
                  <th className="px-6 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {costs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-slate-400">
                      <div className="flex flex-col items-center justify-center gap-3 w-full">
                        <div className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center text-slate-300">
                          <Clock size={24} />
                        </div>
                        <p className="text-sm">K této zakázce zatím nebyly přidány žádné náklady.</p>
                        <button onClick={onAddCost} className="text-blue-600 font-bold hover:underline text-sm">Přidejte první náklad</button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  costs.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map(c => (
                    <tr key={c.id} className="hover:bg-slate-50 group transition-colors">
                      <td className="px-6 py-4 font-mono text-[10px] font-bold text-slate-500 uppercase tracking-tighter align-top">{format(new Date(c.date), 'd. M. yyyy')}</td>
                      <td className="px-6 py-4 align-top">
                        <p className="font-semibold text-slate-900 text-sm">{c.description}</p>
                        {c.note && <p className="text-xs text-slate-400 mt-1 italic">{c.note}</p>}
                      </td>
                      <td className="px-6 py-4 align-top">
                        <span 
                          className="px-2 py-0.5 rounded text-[10px] font-bold uppercase border shadow-sm"
                          style={{ 
                            borderColor: `${CATEGORY_COLORS[c.category]}40`, 
                            color: CATEGORY_COLORS[c.category],
                            backgroundColor: `${CATEGORY_COLORS[c.category]}08`
                          }}
                        >
                          {c.category}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right font-mono font-bold text-slate-900 text-sm align-top">{formatCurrency(c.amount)}</td>
                      <td className="px-6 py-4 text-right">
                        {canEdit && (
                          <div className="opacity-0 group-hover:opacity-100 flex items-center justify-end gap-1">
                            <button 
                              onClick={() => onEditCost(c)}
                              className="p-2 text-gray-300 hover:text-blue-500 transition-all rounded-lg"
                              title="Upravit"
                            >
                              <PenLine size={16} />
                            </button>
                            <button 
                              onClick={() => onDeleteCost(c.id)}
                              className="p-2 text-gray-300 hover:text-red-500 transition-all rounded-lg"
                              title="Smazat"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// GUI Tools

function StatCard({ label, value, subValue, icon, color, trend, isDown }: { 
  label: string, 
  value: any, 
  subValue?: string, 
  icon: any, 
  color: string,
  trend?: string,
  isDown?: boolean
}) {
  return (
    <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
      <p className="text-[11px] uppercase font-bold tracking-wider text-slate-500 mb-2">{label}</p>
      <p className="text-3xl font-bold tracking-tight text-slate-900 mb-2">{value}</p>
      {subValue && <p className="text-xs text-slate-400 font-medium mb-2">{subValue}</p>}
      
      {trend && (
        <div className={cn(
          "text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5",
          isDown ? "text-red-500" : trend.includes('V rámci') ? "text-slate-400" : "text-emerald-500"
        )}>
          {trend}
        </div>
      )}
    </div>
  );
}


function ConfirmDialog({ isOpen, onClose, onConfirm, title, message }: { 
  isOpen: boolean, 
  onClose: () => void, 
  onConfirm: () => void, 
  title: string, 
  message: string 
}) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden"
      >
        <div className="p-6 text-center">
          <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertCircle size={32} />
          </div>
          <h3 className="font-bold text-xl text-slate-900 mb-2">{title}</h3>
          <p className="text-sm text-slate-500 mb-8 leading-relaxed">
            {message}
          </p>
          <div className="flex gap-3">
            <button 
              onClick={onClose}
              className="flex-1 p-3 rounded-xl font-bold border border-slate-100 hover:bg-slate-50 transition-colors text-slate-600 text-sm"
            >
              Zrušit
            </button>
            <button 
              onClick={onConfirm}
              className="flex-1 p-3 rounded-xl font-bold bg-red-600 text-white hover:bg-red-700 transition-colors text-sm shadow-lg shadow-red-200"
            >
              Potvrdit
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function Modal({ isOpen, onClose, title, children }: { isOpen: boolean, onClose: () => void, title: string, children: any }) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-6 bg-black/40 backdrop-blur-sm">
      <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
        <div className="p-6 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-bold text-xl">{title}</h3>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg text-gray-400 transition-colors">
            <Plus className="rotate-45" size={24} />
          </button>
        </div>
        <div className="p-6">
          {children}
        </div>
      </div>
    </div>
  );
}

function ProjectForm({ onSubmit, onCancel, initialData }: { onSubmit: (p: any) => void, onCancel: () => void, initialData?: Project }) {
  const [formData, setFormData] = useState({
    name: initialData?.name || '',
    offerPrice: initialData?.offerPrice.toString() || '',
    startDate: initialData?.startDate || format(new Date(), 'yyyy-MM-dd'),
    endDate: initialData?.endDate || '',
    status: initialData?.status || 'aktivní' as const
  });

  return (
    <form onSubmit={(e) => {
      e.preventDefault();
      onSubmit({ ...formData, offerPrice: Number(formData.offerPrice) });
    }} className="space-y-4">
      <div className="space-y-1.5">
        <label className="text-xs font-bold uppercase tracking-wider text-gray-500">Název zakázky</label>
        <input 
          required
          autoFocus
          className="w-full p-3 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-100 font-medium"
          placeholder="Např. Oprava střechy - Praha"
          value={formData.name}
          onChange={e => setFormData({ ...formData, name: e.target.value })}
        />
      </div>
      <div className="space-y-1.5">
        <label className="text-xs font-bold uppercase tracking-wider text-gray-500">Cenová nabídka (Kč)</label>
        <input 
          required
          type="number"
          className="w-full p-3 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-100 font-mono font-bold text-lg"
          placeholder="0"
          value={formData.offerPrice}
          onChange={e => setFormData({ ...formData, offerPrice: e.target.value })}
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className="text-xs font-bold uppercase tracking-wider text-gray-500">Datum zahájení</label>
          <input 
            required
            type="date"
            className="w-full p-3 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-100 font-mono"
            value={formData.startDate}
            onChange={e => setFormData({ ...formData, startDate: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-bold uppercase tracking-wider text-gray-500">Datum dokončení</label>
          <input 
            type="date"
            className="w-full p-3 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-100 font-mono"
            value={formData.endDate}
            onChange={e => setFormData({ ...formData, endDate: e.target.value })}
          />
        </div>
      </div>
      <div className="pt-4 flex gap-3">
        <button type="button" onClick={onCancel} className="flex-1 p-3 rounded-lg font-bold border border-slate-100 hover:bg-slate-50 transition-colors">Zrušit</button>
        <button type="submit" className="flex-1 p-3 rounded-lg font-bold bg-blue-600 text-white hover:bg-blue-700 transition-colors">Vytvořit zakázku</button>
      </div>
    </form>
  );
}

function CostForm({ onSubmit, onCancel, initialData }: { 
  onSubmit: (c: any) => void, 
  onCancel: () => void,
  initialData?: CostItem
}) {
  const [formData, setFormData] = useState({
    description: initialData?.description || '',
    amount: initialData?.amount?.toString() || '',
    category: initialData?.category || 'materiál' as CostCategory,
    date: initialData?.date || format(new Date(), 'yyyy-MM-dd'),
    note: '',
    hours: '',
    rate: '400'
  });

  useEffect(() => {
    if (initialData) {
      setFormData(prev => ({
        ...prev,
        note: initialData.note || '',
        hours: '',
        rate: '400'
      }));
    }
  }, [initialData]);

  useEffect(() => {
    if (formData.category === 'práce' && formData.hours && formData.rate) {
      const calculated = Number(formData.hours) * Number(formData.rate);
      setFormData(prev => ({ ...prev, amount: calculated.toString() }));
    }
  }, [formData.category, formData.hours, formData.rate]);

  return (
    <form onSubmit={(e) => {
      e.preventDefault();
      const payload: any = { 
        description: formData.description,
        amount: Number(formData.amount),
        category: formData.category,
        date: formData.date,
        note: formData.note
      };
      if (formData.category === 'práce') {
        payload.note = `${formData.note ? formData.note + ' | ' : ''}Sazba: ${formData.rate} Kč/h, Hodin: ${formData.hours}`;
      }
      onSubmit(payload);
    }} className="space-y-4">
      <div className="space-y-1.5">
        <label className="text-xs font-bold uppercase tracking-wider text-gray-500">Popis položky</label>
        <input 
          required
          autoFocus
          className="w-full p-3 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-100 font-medium"
          placeholder="Např. Betonová směs 5m3"
          value={formData.description}
          onChange={e => setFormData({ ...formData, description: e.target.value })}
        />
      </div>
      <div className="space-y-1.5">
        <label className="text-xs font-bold uppercase tracking-wider text-gray-500">Poznámka (nepovinné)</label>
        <textarea 
          className="w-full p-3 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-100 font-medium min-h-[80px]"
          placeholder="Doplňující informace..."
          value={formData.note}
          onChange={e => setFormData({ ...formData, note: e.target.value })}
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        {formData.category === 'práce' ? (
          <>
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-gray-500">Hodinová sazba (Kč/h)</label>
              <input 
                required
                type="number"
                className="w-full p-3 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-100 font-mono font-bold text-lg"
                placeholder="0"
                value={formData.rate}
                onChange={e => setFormData({ ...formData, rate: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-gray-500">Počet hodin</label>
              <input 
                required
                type="number"
                step="0.5"
                className="w-full p-3 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-100 font-mono font-bold text-lg"
                placeholder="0"
                value={formData.hours}
                onChange={e => setFormData({ ...formData, hours: e.target.value })}
              />
            </div>
          </>
        ) : (
          <div className="col-span-2 space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-gray-500">Částka (Kč)</label>
            <input 
              required
              type="number"
              className="w-full p-3 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-100 font-mono font-bold text-lg"
              placeholder="0"
              value={formData.amount}
              onChange={e => setFormData({ ...formData, amount: e.target.value })}
            />
          </div>
        )}
      </div>
      
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className="text-xs font-bold uppercase tracking-wider text-gray-500">Kategorie</label>
          <select 
            required
            className="w-full p-3 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-100 font-medium bg-white"
            value={formData.category}
            onChange={e => setFormData({ ...formData, category: e.target.value as CostCategory })}
          >
            <option value="materiál">Materiál</option>
            <option value="práce">Práce</option>
            <option value="subdodávky">Subdodávky</option>
            <option value="doprava">Doprava</option>
            <option value="režie">Režie</option>
            <option value="ostatní">Ostatní</option>
          </select>
        </div>
      </div>
      <div className="space-y-1.5">
        <label className="text-xs font-bold uppercase tracking-wider text-gray-500">Datum</label>
        <input 
          required
          type="date"
          className="w-full p-3 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-100 font-mono"
          value={formData.date}
          onChange={e => setFormData({ ...formData, date: e.target.value })}
        />
      </div>

      {formData.category === 'práce' && (
        <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg">
          <div className="flex justify-between items-center text-blue-800">
            <span className="text-xs font-bold uppercase">Vypočtená částka:</span>
            <span className="font-mono font-bold">{formatCurrency(Number(formData.amount))}</span>
          </div>
        </div>
      )}

      <div className="pt-4 flex gap-3">
        <button type="button" onClick={onCancel} className="flex-1 p-3 rounded-lg font-bold border border-slate-100 hover:bg-slate-50 transition-colors">Zrušit</button>
        <button type="submit" className="flex-1 p-3 rounded-lg font-bold bg-blue-600 text-white hover:bg-blue-700 transition-colors">Uložit náklad</button>
      </div>
    </form>
  );
}
