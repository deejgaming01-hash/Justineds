export type UserRole = 'user' | 'admin' | 'superadmin';
export type UserStatus = 'ONLINE' | 'OFFLINE';

export interface User {
  uid: string;
  username: string;
  role: UserRole;
  status?: UserStatus;
  flag?: string;
  profilePic?: string;
  subjects?: string[];
  sessionId?: string;
}

export interface Announcement {
  id: string;
  text: string;
  timestamp: any;
}

export interface ActivityLog {
  id: string;
  timestamp: any;
  username: string;
  action: string;
  details?: string;
}

export interface LoginLog {
  id: string;
  timestamp: any;
  username: string;
  ip?: string;
  device?: string;
  status: string;
}

export interface QuizQuestion {
  type: 'mcq' | 'identification' | 'enumeration';
  q: string;
  options?: string[];
  a?: number;
  answer?: string;
  answers?: string[];
}
