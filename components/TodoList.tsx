import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Task, User, Status, Priority, Group } from '../types';

interface BadgeProps {
  children: React.ReactNode;
  colorClass: string;
}

const Badge: React.FC<BadgeProps> = ({ children, colorClass }) => (
  <span className={`px-3 py-1 text-xs font-semibold rounded-full ${colorClass}`}>
    {children}
  </span>
);

const getStatusColor = (status: Status) => {
  switch (status) {
    case Status.Completed: return 'bg-status-completed text-green-800';
    case Status.InProgress: return 'bg-status-inprogress text-blue-800';
    case Status.Pending: return 'bg-status-pending text-orange-800';
    case Status.NotStarted: return 'bg-status-notstarted text-gray-800';
    default: return 'bg-gray-200 text-gray-800';
  }
};

const getPriorityColor = (priority: Priority) => {
    switch (priority) {
      case Priority.High: return 'bg-priority-high text-red-800';
      case Priority.Medium: return 'bg-priority-medium text-yellow-800';
      case Priority.Low: return 'bg-priority-low text-green-800';
      default: return 'bg-gray-200 text-gray-800';
    }
};

/**
 * Formats a date string from YYYY-MM-DD to DD/MM/YYYY.
 * @param dateString The date string in YYYY-MM-DD format.
 * @returns The formatted date string or the original string if the format is unexpected.
 */
const formatDate = (dateString: string): string => {
    if (!dateString) return '';
    const parts = dateString.split('-');
    if (parts.length === 3) {
        const [year, month, day] = parts;
        return `${day}/${month}/${year}`;
    }
    return dateString;
};


interface TaskRowProps {
  task: Task;
  users: User[];
  groups: Group[];
  currentUser: User;
  onUpdateTask: (task: Task) => void;
  onDeleteTask: (id: number) => void;
  onEdit: (task: Task) => void;
  isSelected: boolean;
  onSelect: (id: number) => void;
  onAddSubtask?: (taskId: number, name: string) => Promise<void>;
  onToggleSubtask?: (taskId: number, subtaskId: number, isCompleted: boolean) => Promise<void>;
  onDeleteSubtask?: (taskId: number, subtaskId: number) => Promise<void>;
}

const TaskRow: React.FC<TaskRowProps> = ({ 
  task, 
  users, 
  groups, 
  currentUser, 
  onUpdateTask, 
  onDeleteTask, 
  onEdit, 
  isSelected, 
  onSelect,
  onAddSubtask,
  onToggleSubtask,
  onDeleteSubtask
}) => {
  const assignee = users.find(u => u.id === task.assigneeId);
  const group = groups.find(g => g.id === task.groupId);
  const isAdmin = currentUser.role === 'admin';
  const isManageable = isAdmin || 
                       (currentUser.role === 'leader' && currentUser.groupId !== null && task.groupId === currentUser.groupId) ||
                       (currentUser.role === 'member' && task.assigneeId === currentUser.id);
  const canManageSome = isAdmin || currentUser.role === 'leader' || currentUser.role === 'member';

  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const [currentNotes, setCurrentNotes] = useState(task.notes);
  const notesTextareaRef = useRef<HTMLTextAreaElement>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isNotesExpanded, setIsNotesExpanded] = useState(false);
  const isLongNotes = task.notes && (task.notes.length > 180 || task.notes.split('\n').length > 3);

  useEffect(() => {
    if (isEditingNotes) {
      notesTextareaRef.current?.focus();
      notesTextareaRef.current?.select();
    }
  }, [isEditingNotes]);
  
  useEffect(() => {
    if (!isEditingNotes) {
        setCurrentNotes(task.notes);
    }
  }, [task.notes, isEditingNotes]);

  const handleStatusChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newStatus = e.target.value as Status;
    const updatedTask: Task = { ...task, status: newStatus };
    onUpdateTask(updatedTask);
  };
  
  const handlePriorityChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newPriority = e.target.value as Priority;
    const updatedTask: Task = { ...task, priority: newPriority };
    onUpdateTask(updatedTask);
  };

  const handleNotesSave = () => {
    if (task.notes !== currentNotes) {
         const updatedTask: Task = { ...task, notes: currentNotes.trim() };
         onUpdateTask(updatedTask);
    }
    setIsEditingNotes(false);
  };
  
  const canEditNotes = isManageable || currentUser.id === task.assigneeId;

  return (
    <>
      <tr className={`border-b hover:bg-gray-50 ${isSelected ? 'bg-blue-50' : ''}`}>
        {canManageSome && (
          <td className="p-3 align-top">
              {isManageable && (
                  <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      checked={isSelected}
                      onChange={() => onSelect(task.id)}
                  />
              )}
          </td>
        )}
        <td className={`p-3 text-sm align-top ${task.status === Status.Completed ? 'line-through text-gray-500' : 'text-gray-700'}`}>
          <div className="flex flex-col gap-1.5">
            <div className="flex items-start gap-2">
              <button 
                type="button" 
                onClick={() => setIsExpanded(!isExpanded)}
                className="p-1 mt-0.5 rounded hover:bg-gray-200 text-gray-500 transition-colors focus:outline-none"
                title="Xem chi tiết"
              >
                <svg 
                  xmlns="http://www.w3.org/2000/svg" 
                  width="14" 
                  height="14" 
                  viewBox="0 0 24 24" 
                  fill="none" 
                  stroke="currentColor" 
                  strokeWidth="2.5" 
                  strokeLinecap="round" 
                  strokeLinejoin="round"
                  className={`transform transition-transform duration-200 ${isExpanded ? 'rotate-90 text-blue-600' : ''}`}
                >
                  <polyline points="9 18 15 12 9 6"></polyline>
                </svg>
              </button>
              <span className="font-semibold">{task.name}</span>
            </div>
            
            {task.subtasks && task.subtasks.length > 0 && (
              <div className="flex items-center gap-2 mt-1 ml-7">
                <button 
                  onClick={() => setIsExpanded(!isExpanded)}
                  className="text-[10px] bg-slate-100 border border-slate-200 text-slate-600 hover:bg-slate-200/80 transition-all font-semibold py-0.5 px-1.5 rounded-full flex items-center gap-1"
                >
                  Subtask: {task.subtasks.filter(s => s.isCompleted).length}/{task.subtasks.length}
                </button>
                <div className="w-16 h-1 mt-0.5 bg-gray-200 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-green-500 transition-all duration-350"
                    style={{ 
                      width: `${(task.subtasks.filter(s => s.isCompleted).length / task.subtasks.length) * 100}%` 
                    }}
                  ></div>
                </div>
              </div>
            )}
            
            {(!task.subtasks || task.subtasks.length === 0) && isManageable && (
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="text-[10px] text-gray-400 font-medium hover:text-blue-500 hover:underline self-start mt-0.5 ml-7 flex items-center gap-0.5"
              >
                + Thêm subtask
              </button>
            )}
          </div>
        </td>
        <td className="p-3 text-sm text-gray-700 whitespace-nowrap align-top">{formatDate(task.deadline)}</td>
        <td className="p-3 whitespace-nowrap align-top"><Badge colorClass={group?.colorClass ?? 'bg-gray-200'}>{group?.name ?? 'N/A'}</Badge></td>
        <td className="p-3 text-sm text-gray-700 whitespace-nowrap align-top">{assignee?.name}</td>
        <td className="p-3 whitespace-nowrap align-top">
          {isManageable ? (
              <select value={task.priority} onChange={handlePriorityChange} className={`p-1.5 border rounded-md w-full text-xs ${getPriorityColor(task.priority)}`}>
                  {Object.values(Priority).map(p => <option key={p} value={p}>{p}</option>)}
              </select>
          ) : (
              <Badge colorClass={getPriorityColor(task.priority)}>{task.priority}</Badge>
          )}
        </td>
        <td className="p-3 align-top">
          {isManageable || currentUser.id === task.assigneeId ? (
            <select value={task.status} onChange={handleStatusChange} className={`p-1.5 border rounded-md w-full text-xs ${getStatusColor(task.status)}`}>
              {Object.values(Status).map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          ) : (
            <Badge colorClass={getStatusColor(task.status)}>{task.status}</Badge>
          )}
        </td>
        <td 
          className={`p-3 text-sm text-gray-500 align-top max-w-sm ${canEditNotes && !isEditingNotes ? 'hover:bg-gray-100/60 cursor-pointer' : ''}`}
          onClick={() => {if (canEditNotes && !isEditingNotes) setIsEditingNotes(true)}}
        >
          {isEditingNotes && canEditNotes ? (
              <textarea
                  ref={notesTextareaRef}
                  value={currentNotes}
                  onChange={(e) => setCurrentNotes(e.target.value)}
                  onBlur={handleNotesSave}
                  onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleNotesSave();
                      }
                      if (e.key === 'Escape') {
                          setCurrentNotes(task.notes);
                          setIsEditingNotes(false);
                      }
                  }}
                  className="w-full p-2 border rounded-md shadow-sm text-sm text-gray-800"
                  rows={4}
              />
          ) : (
              task.notes ? (
                <div className="flex flex-col gap-1.5 align-top">
                  <div 
                    className={`text-gray-700 text-xs leading-relaxed transition-all duration-300 ${
                      !isNotesExpanded ? 'line-clamp-2' : ''
                    }`}
                    style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
                  >
                    {task.notes}
                  </div>
                  {isLongNotes && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsNotesExpanded(!isNotesExpanded);
                      }}
                      className="flex items-center gap-1 self-start text-[10px] font-bold text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100/90 py-0.5 px-2 rounded-full border border-blue-100 transition mt-1 select-none focus:outline-none"
                    >
                      <span>{isNotesExpanded ? 'Thu gọn' : 'Xem chi tiết'}</span>
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="10"
                        height="10"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        className={`transform transition-transform duration-250 ${isNotesExpanded ? 'rotate-180' : ''}`}
                      >
                        <polyline points="6 9 12 15 18 9"></polyline>
                      </svg>
                    </button>
                  )}
                </div>
              ) : (
                canEditNotes ? <span className="text-gray-400 italic text-xs">Thêm ghi chú...</span> : ''
              )
          )}
        </td>
        {canManageSome && (
          <td className="p-3 text-right whitespace-nowrap align-top">
            {isManageable && (
              <>
                <button onClick={() => onEdit(task)} className="text-blue-500 hover:text-blue-700 mr-2 text-xs">Sửa</button>
                <button onClick={() => onDeleteTask(task.id)} className="text-red-500 hover:text-red-700 text-xs">Xóa</button>
              </>
            )}
          </td>
        )}
      </tr>
      {isExpanded && (
        <tr className="bg-slate-50/40">
          <td colSpan={canManageSome ? 9 : 7} className="p-4 bg-slate-50/20 border-t border-b border-dashed border-gray-250">
            <div className="pl-6 max-w-2xl">
              <div className="bg-white border text-gray-800 p-4 rounded-xl shadow-sm border-gray-200/70">
                <div className="flex items-center justify-between mb-3 pb-2 border-b">
                  <h4 className="text-xs font-bold text-gray-600 uppercase tracking-widest flex items-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-blue-500">
                      <line x1="8" y1="6" x2="21" y2="6"></line>
                      <line x1="8" y1="12" x2="21" y2="12"></line>
                      <line x1="8" y1="18" x2="21" y2="18"></line>
                      <line x1="3" y1="6" x2="3.01" y2="6"></line>
                      <line x1="3" y1="12" x2="3.01" y2="12"></line>
                      <line x1="3" y1="18" x2="3.01" y2="18"></line>
                    </svg>
                    Hạng mục chi tiết ({task.subtasks?.length || 0})
                  </h4>
                  {task.subtasks && task.subtasks.length > 0 && (
                    <span className="text-[11px] font-semibold text-blue-600 bg-blue-50 border border-blue-100 rounded-full py-0.5 px-2">
                      Đạt: {Math.round((task.subtasks.filter(s => s.isCompleted).length / task.subtasks.length) * 100)}%
                    </span>
                  )}
                </div>

                {/* Subtask list */}
                {task.subtasks && task.subtasks.length > 0 ? (
                  <div className="space-y-2 mb-4 max-h-60 overflow-y-auto">
                    {task.subtasks.map(subtask => (
                      <div 
                        key={subtask.id} 
                        className="flex items-center justify-between group py-2 px-2.5 hover:bg-slate-50/80 rounded-lg transition-colors border border-gray-100"
                      >
                        <label className="flex items-center gap-3 cursor-pointer select-none flex-grow">
                          <input
                            type="checkbox"
                            checked={subtask.isCompleted}
                            disabled={!isManageable}
                            onChange={(e) => onToggleSubtask?.(task.id, subtask.id, e.target.checked)}
                            className="h-4 w-4 rounded border-gray-350 text-blue-600 focus:ring-blue-500 disabled:opacity-60 cursor-pointer"
                          />
                          <span className={`text-[13px] ${subtask.isCompleted ? 'line-through text-gray-400 font-normal' : 'text-gray-700 font-medium'}`}>
                            {subtask.name}
                          </span>
                        </label>
                        {isManageable && (
                          <button
                            onClick={() => {
                              if (confirm('Bạn có chắc chắn muốn xóa subtask này?')) {
                                onDeleteSubtask?.(task.id, subtask.id);
                              }
                            }}
                            className="opacity-0 group-hover:opacity-100 text-red-500 hover:text-red-700 text-xs p-1 rounded hover:bg-red-50 transition"
                            title="Xóa subtask"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="3 6 5 6 21 6"></polyline>
                              <path d="M19 6V20a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                            </svg>
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-xs text-gray-400 italic mb-4 py-3 text-center bg-gray-50/50 border border-dashed rounded-lg">
                    Chưa có subtask nào được thêm cho đầu việc lớn này.
                  </div>
                )}

                {/* Add Subtask Input Form */}
                {isManageable && (
                  <form 
                    onSubmit={async (e) => {
                      e.preventDefault();
                      const form = e.currentTarget;
                      const input = form.elements.namedItem('subtaskName') as HTMLInputElement;
                      const name = input.value.trim();
                      if (!name) return;
                      
                      if (onAddSubtask) {
                        await onAddSubtask(task.id, name);
                        input.value = '';
                      }
                    }}
                    className="flex items-center gap-2 mt-2"
                  >
                    <input
                      type="text"
                      name="subtaskName"
                      placeholder="Nhập tên subtask mới..."
                      className="flex-grow text-[13px] border border-gray-300 rounded-lg px-3 py-1.5 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 text-gray-800 bg-white"
                      autoComplete="off"
                    />
                    <button
                      type="submit"
                      className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-lg transition shadow-sm"
                    >
                      Thêm
                    </button>
                  </form>
                )}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
};

interface TaskModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (task: Omit<Task, 'id'> | Task) => void;
    taskToEdit: Task | null;
    users: User[];
    groups: Group[];
    currentUser: User;
}

const TaskModal: React.FC<TaskModalProps> = ({ isOpen, onClose, onSave, taskToEdit, users, groups, currentUser }) => {
    const getInitialTaskState = () => {
        if (taskToEdit) return taskToEdit;
        
        const defaultGroupId = currentUser.role === 'admin' 
            ? (groups[0]?.id || 0) 
            : (currentUser.groupId || 0);

        const defaultAssigneeId = (currentUser.role === 'admin')
            ? (users.find(u => u.role === 'member')?.id || (users[0]?.id || 0))
            : ((currentUser.role === 'member') ? currentUser.id : (users.find(u => u.groupId === currentUser.groupId)?.id || currentUser.id));

        return {
            name: '',
            deadline: new Date().toISOString().split('T')[0],
            groupId: defaultGroupId,
            assigneeId: defaultAssigneeId,
            priority: Priority.Medium,
            status: Status.NotStarted,
            notes: '',
        };
    };

    const [task, setTask] = useState<Omit<Task, 'id'> | Task>(getInitialTaskState);

    useEffect(() => {
        if (isOpen) {
            setTask(getInitialTaskState());
        }
    }, [taskToEdit, isOpen, users, groups]);

    const availableGroups = useMemo(() => {
        if (currentUser.role === 'admin') return groups;
        return groups.filter(g => g.id === currentUser.groupId);
    }, [groups, currentUser]);

    const availableUsers = useMemo(() => {
        if (currentUser.role === 'admin') return users;
        if (currentUser.role === 'member') return users.filter(u => u.id === currentUser.id);
        return users.filter(u => u.groupId === currentUser.groupId);
    }, [users, currentUser]);

    if (!isOpen) return null;

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        
        if (name === 'assigneeId') {
            const newAssigneeId = parseInt(value, 10);
            const newAssignee = users.find(u => u.id === newAssigneeId);
            setTask(prevTask => {
                const updatedTask = { ...prevTask, assigneeId: newAssigneeId };
                if (newAssignee && newAssignee.groupId !== null) {
                    updatedTask.groupId = newAssignee.groupId;
                }
                return updatedTask;
            });
        } else {
            const isNumericField = ['groupId'].includes(name);
            const updatedValue = isNumericField ? parseInt(value, 10) : value;
            setTask(prevTask => ({ ...prevTask, [name]: updatedValue }));
        }
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSave(task);
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
            <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-lg">
                <h2 className="text-xl font-bold mb-4">{taskToEdit ? 'Sửa công việc' : 'Thêm công việc mới'}</h2>
                <form onSubmit={handleSubmit} className="space-y-4">
                     <div>
                        <label className="block text-sm font-medium text-gray-700">Công việc</label>
                        <input type="text" name="name" value={task.name} onChange={handleChange} className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2" required />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Deadline</label>
                        <input type="date" name="deadline" value={task.deadline} onChange={handleChange} className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2" required />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Nhóm</label>
                        <select name="groupId" value={task.groupId} onChange={handleChange} className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2">
                           {availableGroups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Phân công</label>
                        <select name="assigneeId" value={task.assigneeId} onChange={handleChange} className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2">
                            {availableUsers.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                        </select>
                    </div>
                     <div>
                        <label className="block text-sm font-medium text-gray-700">Ưu tiên</label>
                        <select name="priority" value={task.priority} onChange={handleChange} className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2">
                           {Object.values(Priority).map(p => <option key={p} value={p}>{p}</option>)}
                        </select>
                    </div>
                     <div>
                        <label className="block text-sm font-medium text-gray-700">Trạng thái</label>
                        <select name="status" value={task.status} onChange={handleChange} className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2">
                           {Object.values(Status).map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                    </div>
                     <div>
                        <label className="block text-sm font-medium text-gray-700">Ghi chú / Mô tả</label>
                        <textarea name="notes" value={task.notes} onChange={handleChange} className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2" />
                    </div>
                    <div className="flex justify-end space-x-2">
                        <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-200 rounded-md hover:bg-gray-300">Hủy</button>
                        <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700">Lưu</button>
                    </div>
                </form>
            </div>
        </div>
    );
};

interface TodoListProps {
  tasks: Task[];
  users: User[];
  groups: Group[];
  currentUser: User;
  onUpdateTask: (task: Task) => void;
  onAddTask: (task: Omit<Task, 'id'>) => void;
  onBulkAddTask: (tasks: Omit<Task, 'id'>[]) => Promise<void>;
  onDeleteTask: (id: number) => void;
  onDeleteMultipleTasks: (ids: number[]) => void;
  showDateFilter?: boolean;
  showAdvancedFilters?: boolean;
  showAddControls?: boolean;
  initialDateFilter?: string | null;
  onClearFilter?: () => void;
  groupFilter?: string;
  setGroupFilter?: React.Dispatch<React.SetStateAction<string>>;
  assigneeFilter?: string;
  setAssigneeFilter?: React.Dispatch<React.SetStateAction<string>>;
  priorityFilter?: string;
  setPriorityFilter?: React.Dispatch<React.SetStateAction<string>>;
  statusFilter?: string;
  setStatusFilter?: React.Dispatch<React.SetStateAction<string>>;
  onAddSubtask?: (taskId: number, name: string) => Promise<void>;
  onToggleSubtask?: (taskId: number, subtaskId: number, isCompleted: boolean) => Promise<void>;
  onDeleteSubtask?: (taskId: number, subtaskId: number) => Promise<void>;
}

const TASKS_PER_PAGE = 40;

const parseCsvToTasks = (csvText: string, users: User[], groups: Group[]): { newTasks: Omit<Task, 'id'>[], errors: string[] } => {
    const lines = csvText.split(/\r?\n/).filter(line => line.trim() !== '');
    if (lines.length < 2) {
        return { newTasks: [], errors: ["Lỗi: Tệp CSV phải có tiêu đề và ít nhất một hàng dữ liệu."] };
    }

    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
    const requiredHeaders = ['name', 'deadline', 'groupname', 'assigneename', 'priority', 'status'];
    const missingHeaders = requiredHeaders.filter(rh => !headers.includes(rh));

    if (missingHeaders.length > 0) {
        return { newTasks: [], errors: [`Lỗi: Thiếu các cột bắt buộc trong CSV: ${missingHeaders.join(', ')}`] };
    }

    const newTasks: Omit<Task, 'id'>[] = [];
    const errors: string[] = [];
    
    const groupMap = new Map(groups.map(g => [g.name.toLowerCase(), g.id]));
    const userMap = new Map(users.filter(u => u.role === 'member' || u.role === 'leader').map(u => [u.name.toLowerCase(), u.id]));
    
    const smartParseDate = (dateString: string): string | null => {
        if (!dateString || dateString.trim() === '') return null;

        const trimmedDate = dateString.trim();
        let date: Date;

        // Regex to detect formats and rearrange if necessary
        // DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY
        const dmyRegex = /^(\d{1,2})[\/\.-](\d{1,2})[\/\.-](\d{4})$/;
        const dmyMatch = trimmedDate.match(dmyRegex);

        // YYYY/MM/DD or YYYY-MM-DD or YYYY.MM.DD
        const ymdRegex = /^(\d{4})[\/\.-](\d{1,2})[\/\.-](\d{1,2})$/;
        const ymdMatch = trimmedDate.match(ymdRegex);

        if (dmyMatch) {
            const [, day, month, year] = dmyMatch;
            date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
        } else if (ymdMatch) {
            const [, year, month, day] = ymdMatch;
            date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
        } else {
            // Fallback to native JS parsing for other formats like MM/DD/YYYY or text dates
            date = new Date(trimmedDate);
        }

        // Check for validity
        if (isNaN(date.getTime())) {
            return null;
        }

        const year = date.getFullYear();
        if (year < 1900 || year > 3000) return null; // Sanity check for year

        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');

        return `${year}-${month}-${day}`;
    };

    for (let i = 1; i < lines.length; i++) {
        const row = lines[i].split(',');
        const taskData: { [key: string]: string } = {};
        headers.forEach((header, index) => {
            taskData[header] = row[index]?.trim() || '';
        });

        const name = taskData.name;
        if (!name) {
            errors.push(`Hàng ${i + 1}: Tên công việc không được để trống.`);
            continue;
        }

        const deadlineInput = taskData.deadline;
        const deadline = smartParseDate(deadlineInput);
        if (!deadline) {
            errors.push(`Hàng ${i + 1}: Định dạng deadline '${deadlineInput}' không hợp lệ hoặc không thể phân tích.`);
            continue;
        }

        const groupName = taskData.groupname.toLowerCase();
        const groupId = groupMap.get(groupName);
        if (!groupId) {
            errors.push(`Hàng ${i + 1}: Không tìm thấy nhóm '${taskData.groupname}'.`);
            continue;
        }

        const assigneeName = taskData.assigneename.toLowerCase();
        const assigneeId = userMap.get(assigneeName);
        if (!assigneeId) {
            errors.push(`Hàng ${i + 1}: Không tìm thấy người dùng được phân công '${taskData.assigneename}'.`);
            continue;
        }
        
        const priorityStr = taskData.priority;
        const priority = Object.values(Priority).find(p => p.toLowerCase() === priorityStr.toLowerCase());
        if (!priority) {
            errors.push(`Hàng ${i + 1}: Mức độ ưu tiên không hợp lệ '${priorityStr}'. Các giá trị hợp lệ: ${Object.values(Priority).join(', ')}.`);
            continue;
        }

        const statusStr = taskData.status.toLowerCase();
        const status = Object.values(Status).find(s => s.toLowerCase() === statusStr);
        if (!status) {
            errors.push(`Hàng ${i + 1}: Trạng thái không hợp lệ '${taskData.status}'. Các giá trị hợp lệ: ${Object.values(Status).join(', ')}.`);
            continue;
        }

        const taskToAdd: Omit<Task, 'id'> = {
            name,
            deadline,
            groupId,
            assigneeId,
            priority,
            status,
            notes: taskData.notes || '',
        };
        
        newTasks.push(taskToAdd);
    }

    return { newTasks, errors };
};


const TodoList: React.FC<TodoListProps> = ({ 
    tasks, 
    users, 
    groups, 
    currentUser, 
    onUpdateTask, 
    onAddTask,
    onBulkAddTask,
    onDeleteTask, 
    onDeleteMultipleTasks, 
    showDateFilter = true, 
    showAdvancedFilters = false,
    showAddControls = true,
    initialDateFilter,
    onClearFilter,
    groupFilter: controlledGroupFilter,
    setGroupFilter: controlledSetGroupFilter,
    assigneeFilter: controlledAssigneeFilter,
    setAssigneeFilter: controlledSetAssigneeFilter,
    priorityFilter: controlledPriorityFilter,
    setPriorityFilter: controlledSetPriorityFilter,
    statusFilter: controlledStatusFilter,
    setStatusFilter: controlledSetStatusFilter,
    onAddSubtask,
    onToggleSubtask,
    onDeleteSubtask,
}) => {
    const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
    const [taskToEdit, setTaskToEdit] = useState<Task | null>(null);
    const isAdmin = currentUser.role === 'admin';
    const canManageSome = isAdmin || currentUser.role === 'leader' || currentUser.role === 'member';
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [selectedTaskIds, setSelectedTaskIds] = useState<number[]>([]);
    const selectAllRef = useRef<HTMLInputElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isImporting, setIsImporting] = useState(false);
    const [importErrors, setImportErrors] = useState<string[]>([]);
    const [isErrorModalOpen, setIsErrorModalOpen] = useState(false);

    const [internalGroupFilter, setInternalGroupFilter] = useState('all');
    const [internalAssigneeFilter, setInternalAssigneeFilter] = useState('all');
    const [internalPriorityFilter, setInternalPriorityFilter] = useState('all');
    const [internalStatusFilter, setInternalStatusFilter] = useState('all');

    const isControlled = controlledSetGroupFilter !== undefined;

    const groupFilter = isControlled ? controlledGroupFilter! : internalGroupFilter;
    const setGroupFilter = isControlled ? controlledSetGroupFilter : setInternalGroupFilter;

    const assigneeFilter = isControlled ? controlledAssigneeFilter! : internalAssigneeFilter;
    const setAssigneeFilter = isControlled ? controlledSetAssigneeFilter : setInternalAssigneeFilter;

    const priorityFilter = isControlled ? controlledPriorityFilter! : internalPriorityFilter;
    const setPriorityFilter = isControlled ? controlledSetPriorityFilter : setInternalPriorityFilter;

    const statusFilter = isControlled ? controlledStatusFilter! : internalStatusFilter;
    const setStatusFilter = isControlled ? controlledSetStatusFilter : setInternalStatusFilter;

    const prevInitialDateFilter = useRef(initialDateFilter);
    useEffect(() => {
        if (initialDateFilter !== prevInitialDateFilter.current) {
            setStartDate(initialDateFilter || '');
            setEndDate(initialDateFilter || '');
        } else if (!initialDateFilter && showDateFilter) {
            const today = new Date();
            const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
            setStartDate(startOfMonth.toISOString().split('T')[0]);
            const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
            setEndDate(endOfMonth.toISOString().split('T')[0]);
        }
        prevInitialDateFilter.current = initialDateFilter;
    }, [initialDateFilter, showDateFilter]);


    const filteredTasks = useMemo(() => {
        if (isControlled) {
            // When controlled, the parent component (OverviewDashboard) has already
            // performed all necessary filtering. We just display the tasks provided.
            return tasks;
        }

        // Uncontrolled path (used in the main "Danh sách công việc" view)
        return tasks.filter(task => {
            // Date filter logic (only applies if showDateFilter is true)
            if (showDateFilter && startDate && endDate) {
                if (startDate > endDate) return false;
                if (task.deadline < startDate || task.deadline > endDate) {
                    return false;
                }
            }

            // Advanced filter logic (only applies if showAdvancedFilters is true)
            if (showAdvancedFilters) {
                if (groupFilter !== 'all' && String(task.groupId) !== groupFilter) return false;
                if (assigneeFilter !== 'all' && String(task.assigneeId) !== assigneeFilter) return false;
                if (priorityFilter !== 'all' && task.priority !== priorityFilter) return false;
                if (statusFilter !== 'all' && task.status !== statusFilter) return false;
            }
            
            return true;
        });
    }, [isControlled, tasks, startDate, endDate, showDateFilter, showAdvancedFilters, groupFilter, assigneeFilter, priorityFilter, statusFilter]);


    const pageCount = Math.ceil(filteredTasks.length / TASKS_PER_PAGE);
    const indexOfLastTask = currentPage * TASKS_PER_PAGE;
    const indexOfFirstTask = indexOfLastTask - TASKS_PER_PAGE;
    const currentTasks = filteredTasks.slice(indexOfFirstTask, indexOfLastTask);

    useEffect(() => {
        setCurrentPage(1);
        setSelectedTaskIds([]);
    }, [filteredTasks]);
    
    useEffect(() => {
        setSelectedTaskIds([]);
    }, [currentPage]);

    const isAllOnPageSelected = currentTasks.length > 0 && selectedTaskIds.length === currentTasks.length;

    useEffect(() => {
      if (selectAllRef.current) {
        selectAllRef.current.checked = isAllOnPageSelected;
        selectAllRef.current.indeterminate = selectedTaskIds.length > 0 && !isAllOnPageSelected;
      }
    }, [selectedTaskIds, isAllOnPageSelected]);


    const handleOpenTaskModal = (task: Task | null) => {
        setTaskToEdit(task);
        setIsTaskModalOpen(true);
    };

    const handleCloseTaskModal = () => {
        setTaskToEdit(null);
        setIsTaskModalOpen(false);
    };
    
    const handleSaveTask = (taskData: Omit<Task, 'id'> | Task) => {
        if ('id' in taskData) {
            onUpdateTask(taskData as Task);
        } else {
            onAddTask(taskData as Omit<Task, 'id'>);
        }
    };

    const handleSelectTask = (taskId: number) => {
        setSelectedTaskIds(prev =>
            prev.includes(taskId)
                ? prev.filter(id => id !== taskId)
                : [...prev, taskId]
        );
    };

    const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.checked) {
            setSelectedTaskIds(currentTasks.map(t => t.id));
        } else {
            setSelectedTaskIds([]);
        }
    };

    const handleBulkDelete = () => {
        if (window.confirm(`Bạn có chắc chắn muốn xóa ${selectedTaskIds.length} công việc đã chọn không?`)) {
            onDeleteMultipleTasks(selectedTaskIds);
            setSelectedTaskIds([]);
        }
    };

    const handleClearDateFilter = () => {
        setStartDate('');
        setEndDate('');
        onClearFilter?.();
    };

    const handleImportClick = () => {
        fileInputRef.current?.click();
    };

    const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        setIsImporting(true);
        const reader = new FileReader();

        reader.onload = async (e) => {
            const text = e.target?.result as string;
            if (!text) {
                alert("Lỗi: Không thể đọc tệp.");
                setIsImporting(false);
                return;
            }

            try {
                const { newTasks, errors } = parseCsvToTasks(text, users, groups);

                if (errors.length > 0) {
                    setImportErrors(errors.slice(0, 50)); // Limit displayed errors
                    setIsErrorModalOpen(true);
                    return; // Stop execution
                }

                if (newTasks.length === 0) {
                    alert("Không tìm thấy công việc hợp lệ nào để nhập.");
                    return;
                }

                await onBulkAddTask(newTasks);
                alert(`Đã nhập thành công ${newTasks.length} công việc.`);

            } catch (err: any) {
                console.error("Lỗi khi nhập CSV:", err);
                alert(`Đã xảy ra lỗi khi xử lý tệp của bạn: ${err.message}`);
            } finally {
                setIsImporting(false);
                // Reset file input value to allow re-uploading the same file
                if (fileInputRef.current) {
                    fileInputRef.current.value = '';
                }
            }
        };

        reader.onerror = () => {
            alert("Đã xảy ra lỗi khi đọc tệp.");
            setIsImporting(false);
        };

        reader.readAsText(file);
    };
  
    return (
    <div className="bg-white p-2 sm:p-6 rounded-lg shadow-lg">
      <div className="flex flex-col items-center text-center gap-4 mb-4 sm:flex-row sm:justify-between sm:text-left">
        <div className="flex items-center justify-center sm:justify-start gap-4 flex-wrap">
            <h2 className="text-2xl font-bold text-gray-800">CÔNG VIỆC HÀNG NGÀY</h2>
            {(isAdmin || currentUser.role === 'leader' || currentUser.role === 'member') && selectedTaskIds.length > 0 && (
                <button 
                    onClick={handleBulkDelete}
                    className="px-4 py-2 bg-red-600 text-white font-semibold rounded-lg hover:bg-red-700 transition"
                >
                    Xóa ({selectedTaskIds.length}) công việc
                </button>
            )}
        </div>
        {showAddControls && (
            <div className="flex items-center space-x-2">
                <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileSelect}
                    accept=".csv"
                    style={{ display: 'none' }}
                />
                {(isAdmin || currentUser.role === 'leader') && (
                    <button
                        onClick={handleImportClick}
                        disabled={isImporting}
                        className="px-4 py-2 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 transition disabled:bg-green-300"
                    >
                        {isImporting ? 'Đang nhập...' : 'Nhập CSV'}
                    </button>
                )}
                <button onClick={() => handleOpenTaskModal(null)} className="px-4 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition">Thêm công việc</button>
            </div>
        )}
      </div>
      {showDateFilter && (
        <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-end gap-4 bg-gray-50 p-3 rounded-md mb-6 border border-gray-200">
            <div className="w-full sm:flex-1 sm:min-w-[150px]">
                <label htmlFor="start-date-todo" className="block text-sm font-semibold text-gray-600 mb-1">Từ</label>
                <input
                    id="start-date-todo"
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full text-gray-800 bg-white border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 p-1 text-sm"
                />
            </div>
            <div className="w-full sm:flex-1 sm:min-w-[150px]">
                <label htmlFor="end-date-todo" className="block text-sm font-semibold text-gray-600 mb-1">Đến</label>
                <input
                    id="end-date-todo"
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full text-gray-800 bg-white border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 p-1 text-sm"
                />
            </div>
            {(startDate || endDate) && (
                <div className="w-full sm:flex-1 sm:min-w-[150px]">
                    <button
                        onClick={handleClearDateFilter}
                        className="w-full px-3 py-1.5 bg-gray-200 text-gray-700 text-xs font-semibold rounded-md hover:bg-gray-300"
                    >
                        Xóa bộ lọc ngày
                    </button>
                </div>
            )}
        </div>
      )}
      {showAdvancedFilters && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 bg-gray-50 p-3 rounded-md mb-6 border border-gray-200">
                <div>
                    <label htmlFor="group-filter" className="block text-sm font-semibold text-gray-600 mb-1">Nhóm</label>
                    <select id="group-filter" value={groupFilter} onChange={e => setGroupFilter(e.target.value)} className="w-full text-gray-800 bg-white border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 p-1.5 text-sm">
                        <option value="all">Tất cả</option>
                        {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                    </select>
                </div>
                <div>
                    <label htmlFor="assignee-filter" className="block text-sm font-semibold text-gray-600 mb-1">Phân công</label>
                    <select id="assignee-filter" value={assigneeFilter} onChange={e => setAssigneeFilter(e.target.value)} className="w-full text-gray-800 bg-white border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 p-1.5 text-sm">
                        <option value="all">Tất cả</option>
                        {users.filter(u => u.role === 'member' || u.role === 'leader').map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                    </select>
                </div>
                <div>
                    <label htmlFor="priority-filter" className="block text-sm font-semibold text-gray-600 mb-1">Ưu tiên</label>
                    <select id="priority-filter" value={priorityFilter} onChange={e => setPriorityFilter(e.target.value)} className="w-full text-gray-800 bg-white border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 p-1.5 text-sm">
                        <option value="all">Tất cả</option>
                        {Object.values(Priority).map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                </div>
                <div>
                    <label htmlFor="status-filter" className="block text-sm font-semibold text-gray-600 mb-1">Trạng thái</label>
                    <select id="status-filter" value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="w-full text-gray-800 bg-white border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 p-1.5 text-sm">
                        <option value="all">Tất cả</option>
                        {Object.values(Status).map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                </div>
            </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-100">
            <tr>
              {canManageSome && (
                <th className="p-3 w-4">
                  <input
                    type="checkbox"
                    ref={selectAllRef}
                    onChange={handleSelectAll}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                </th>
              )}
              <th className="p-3 text-left text-sm font-semibold text-gray-600 min-w-[200px]">Công việc</th>
              <th className="p-3 text-left text-sm font-semibold text-gray-600 min-w-[120px]">Deadline</th>
              <th className="p-3 text-left text-sm font-semibold text-gray-600 min-w-[150px]">Nhóm</th>
              <th className="p-3 text-left text-sm font-semibold text-gray-600 min-w-[150px]">Phân công</th>
              <th className="p-3 text-left text-sm font-semibold text-gray-600 min-w-[120px]">Ưu tiên</th>
              <th className="p-3 text-left text-sm font-semibold text-gray-600 min-w-[160px]">Trạng thái</th>
              <th className="p-3 text-left text-sm font-semibold text-gray-600 min-w-[300px]">Ghi chú / Mô tả</th>
              {canManageSome && <th className="p-3 text-left text-sm font-semibold text-gray-600 min-w-[100px]"></th>}
            </tr>
          </thead>
          <tbody>
            {currentTasks.map(task => (
              <TaskRow 
                key={task.id} 
                task={task} 
                users={users} 
                groups={groups}
                currentUser={currentUser} 
                onUpdateTask={onUpdateTask}
                onDeleteTask={onDeleteTask}
                onEdit={() => handleOpenTaskModal(task)}
                isSelected={selectedTaskIds.includes(task.id)}
                onSelect={handleSelectTask}
                onAddSubtask={onAddSubtask}
                onToggleSubtask={onToggleSubtask}
                onDeleteSubtask={onDeleteSubtask}
              />
            ))}
          </tbody>
        </table>
      </div>

       {pageCount > 1 && (
        <div className="mt-6 flex justify-center">
            <nav aria-label="Page navigation">
              <ul className="inline-flex items-center -space-x-px">
                <li>
                  <button
                    onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                    disabled={currentPage === 1}
                    className="px-3 py-2 ml-0 leading-tight text-gray-500 bg-white border border-gray-300 rounded-l-lg hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50"
                  >
                    Trước
                  </button>
                </li>
                {Array.from({ length: pageCount }, (_, i) => i + 1).map(number => (
                  <li key={number}>
                    <button
                      onClick={() => setCurrentPage(number)}
                      className={`px-3 py-2 leading-tight border border-gray-300 ${
                        currentPage === number
                          ? 'bg-blue-600 text-white hover:bg-blue-700'
                          : 'bg-white text-gray-500 hover:bg-gray-100 hover:text-gray-700'
                      }`}
                    >
                      {number}
                    </button>
                  </li>
                ))}
                <li>
                  <button
                    onClick={() => setCurrentPage(prev => Math.min(prev + 1, pageCount))}
                    disabled={currentPage === pageCount}
                    className="px-3 py-2 leading-tight text-gray-500 bg-white border border-gray-300 rounded-r-lg hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50"
                  >
                    Sau
                  </button>
                </li>
              </ul>
            </nav>
        </div>
      )}

      <TaskModal 
        isOpen={isTaskModalOpen}
        onClose={handleCloseTaskModal}
        onSave={handleSaveTask}
        taskToEdit={taskToEdit}
        users={users}
        groups={groups}
        currentUser={currentUser}
       />

        {isErrorModalOpen && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 p-4">
                <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-2xl">
                    <h2 className="text-xl font-bold mb-4 text-red-600">Lỗi khi nhập tệp CSV</h2>
                    <p className="mb-4 text-sm text-gray-600">Quá trình nhập đã bị dừng. Vui lòng sửa các lỗi sau trong tệp của bạn và thử lại:</p>
                    <div className="bg-red-50 border border-red-200 p-4 rounded-md max-h-80 overflow-y-auto text-sm">
                        <ul className="list-decimal list-inside space-y-1">
                            {importErrors.map((error, index) => (
                                <li key={index} className="text-red-900">
                                   {error}
                                </li>
                            ))}
                        </ul>
                        {importErrors.length >= 50 && <p className="text-red-900 font-semibold mt-2">... và có thể có nhiều lỗi hơn.</p>}
                    </div>
                    <div className="flex justify-end mt-6">
                        <button 
                            type="button" 
                            onClick={() => {
                                setIsErrorModalOpen(false);
                                setImportErrors([]);
                            }} 
                            className="px-6 py-2 bg-gray-600 text-white font-semibold rounded-md hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
                        >
                            Đã hiểu
                        </button>
                    </div>
                </div>
            </div>
        )}
    </div>
  );
};

export default TodoList;