export type CostCategory = 'materiál' | 'práce' | 'subdodávky' | 'doprava' | 'režie' | 'ostatní';

export interface CostItem {
  id: string;
  projectId: string;
  ownerId: string;
  description: string;
  amount: number;
  category: CostCategory;
  date: string;
  note?: string;
}

export interface Project {
  id: string;
  ownerId: string;
  name: string;
  offerPrice: number;
  status: 'aktivní' | 'dokončeno' | 'pozastaveno' | 'smazáno';
  startDate: string;
  endDate?: string;
  editors?: string[];
}

export interface AppUser {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  lastLogin: any;
}

export interface AppState {
  projects: Project[];
  costs: CostItem[];
}

export type ActivityType = 'create_project' | 'update_project' | 'delete_project' | 'create_cost' | 'update_cost' | 'delete_cost' | 'restore_project' | 'finish_project' | 'update_editors';

export interface ActivityLog {
  id: string;
  type: ActivityType;
  userName: string;
  userEmail: string;
  userId: string;
  targetName: string;
  targetId: string;
  timestamp: any;
  details?: string;
}
