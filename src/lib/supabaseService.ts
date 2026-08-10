import { supabase } from './supabase';
import { Project, CostItem, ActivityLog, AppUser } from '../types';

// Pomocná funkce pro obnovování dat v reálném čase
const subscribeToTable = (table: string, orderColumn: string, callback: (data: any) => void, filter?: { column: string, value: string }) => {
  const fetchData = async () => {
    let query = supabase.from(table).select('*').order(orderColumn, { ascending: false });
    if (filter) query = query.eq(filter.column, filter.value);
    const { data } = await query;
    if (data) callback(data);
  };
  fetchData();
  const channel = supabase.channel(`public:${table}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: table }, () => fetchData())
    .subscribe();
  return () => { supabase.removeChannel(channel); };
};

export const subscribeToProjects = (callback: (projects: Project[]) => void) => subscribeToTable('projects', 'createdAt', callback);
export const subscribeToAllCosts = (callback: (costs: CostItem[]) => void) => subscribeToTable('costs', 'createdAt', callback);
export const subscribeToLogs = (limitCount: number, callback: (logs: ActivityLog[]) => void) => {
  // Okamžité načtení omezeného počtu posledních záznamů
  supabase
    .from('logs')
    .select('*')
    .order('timestamp', { ascending: false })
    .limit(limitCount)
    .then(({ data }) => {
      if (data) callback(data as ActivityLog[]);
    });

  // Real-time posluchač pro budoucí změny (pokud ho využíváš)
  const channel = supabase
    .channel('public:logs')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'logs' }, async () => {
      const { data } = await supabase
        .from('logs')
        .select('*')
        .order('timestamp', { ascending: false })
        .limit(limitCount);
      if (data) callback(data as ActivityLog[]);
    })
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
};

export const subscribeToUsers = (callback: (users: AppUser[]) => void) => subscribeToTable('users', 'lastLogin', callback);

export const subscribeToSettings = (callback: (settings: { alertThreshold: number }) => void) => {
  const fetchSettings = async () => {
    const { data } = await supabase.from('settings').select('*').eq('id', 'global').single();
    if (data) callback(data as { alertThreshold: number });
  };
  fetchSettings();
  const channel = supabase.channel('public:settings')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'settings' }, () => fetchSettings())
    .subscribe();
  return () => { supabase.removeChannel(channel); };
};

export const createProject = async (project: Omit<Project, 'id'>) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return null;
  const id = crypto.randomUUID();
  
  const { data, error } = await supabase
    .from('projects')
    .insert([{ ...project, id, ownerId: session.user.id, createdAt: new Date(), updatedAt: new Date() }])
    .select()
    .single();

  if (error) {
    console.error('Chyba při vytváření zakázky:', error);
    return null;
  }
  
  return data.id;
};


export const updateProject = async (projectId: string, data: Partial<Project>) => {
  await supabase.from('projects').update({ ...data, updatedAt: new Date() }).eq('id', projectId);
};

export const deleteProject = async (projectId: string) => {
  await supabase.from('projects').delete().eq('id', projectId);
};

export const createCost = async (cost: Omit<CostItem, 'id'>) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return null;
  const id = crypto.randomUUID();
  await supabase.from('costs').insert([{ ...cost, id, ownerId: session.user.id, createdAt: new Date(), updatedAt: new Date() }]);
  return id;
};

export const updateCost = async (costId: string, data: Partial<CostItem>) => {
  await supabase.from('costs').update({ ...data, updatedAt: new Date() }).eq('id', costId);
};

export const deleteCost = async (costId: string) => {
  await supabase.from('costs').delete().eq('id', costId);
};

export const createLog = async (log: Omit<ActivityLog, 'id' | 'timestamp' | 'userId' | 'userName' | 'userEmail'>) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return;
  const id = crypto.randomUUID();
  await supabase.from('logs').insert([{ 
    ...log, id, userId: session.user.id, 
    userName: session.user.user_metadata?.full_name || 'Uživatel', 
    userEmail: session.user.email || '', 
    timestamp: new Date() 
  }]);
};

export const saveUser = async (user: Omit<AppUser, 'lastLogin'>) => {
  await supabase.from('users').upsert([{ ...user, lastLogin: new Date() }]);
};

export const updateSettings = async (settings: { alertThreshold: number }) => {
  await supabase.from('settings').update(settings).eq('id', 'global');
};
