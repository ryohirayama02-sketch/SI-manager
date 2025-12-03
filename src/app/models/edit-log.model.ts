export interface EditLog {
  id?: string;
  userId: string;
  userName: string;
  action: 'create' | 'update' | 'delete';
  entityType: string; // 'employee', 'office', 'settings', etc.
  entityId?: string;
  entityName?: string;
  description: string;
  timestamp: Date;
  roomId: string;
}


