
export interface Group {
  id: number;
  name: string;
  colorClass: string;
}

export enum Status {
  Completed = 'Hoàn thành',
  InProgress = 'Đang tiến độ',
  Pending = 'Đang chờ',
  NotStarted = 'Chưa bắt đầu',
}

export enum Priority {
  High = 'Cao',
  Medium = 'Trung bình',
  Low = 'Thấp',
}

export interface User {
  id: number;
  name: string;
  role: 'admin' | 'member' | 'leader';
  email: string;
  password: string;
  groupId: number | null;
  managedGroupIds?: number[];
}

export interface Subtask {
  id: number;
  taskId: number;
  name: string;
  isCompleted: boolean;
}

export interface Task {
  id: number;
  name: string;
  deadline: string; // YYYY-MM-DD
  groupId: number;
  assigneeId: number;
  priority: Priority;
  status: Status;
  notes: string;
  subtasks?: Subtask[];
}

export type View = 'Tổng quan' | 'Danh sách công việc' | 'Lịch' | 'Người dùng';

export interface Notification {
  id: number;
  userId: number;
  type: 'NEW_TASK' | 'EOD_WARNING' | string;
  title: string;
  message: string;
  isRead: number; // 0 or 1
  taskId: number | null;
  createdAt: string;
}