import React, { useMemo, useState, useEffect } from 'react';
import { Task, User, Status, Priority, Group } from '../types';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, LabelList } from 'recharts';
import TodoList from './TodoList';

// Consistent colors synchronized with the Todo list's status badges.
const STATUS_COLORS_OVERVIEW: { [key in Status]: string } = {
  [Status.Completed]: '#22c55e',   // Green
  [Status.InProgress]: '#3b82f6',    // Blue
  [Status.Pending]: '#fb923c',      // Orange
  [Status.NotStarted]: '#9ca3af',  // Gray
};

const PRIORITY_BAR_COLOR = '#EADFD7';

/**
 * A donut chart component to display a single status metric.
 */
const StatusDonut: React.FC<{ title: string; percentage: number; color: string }> = ({ title, percentage, color }) => {
  const data = [
    { name: 'value', value: percentage },
    { name: 'remainder', value: 100 - percentage },
  ];

  return (
    <div className="bg-white p-4 rounded-lg shadow flex flex-col items-center justify-between h-full">
      <div className="w-full h-40 relative">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              dataKey="value"
              innerRadius="70%"
              outerRadius="90%"
              startAngle={90}
              endAngle={450}
              cornerRadius={5}
            >
              <Cell fill={color} stroke={color} />
              <Cell fill="#F3F4F6" stroke="#F3F4F6" />
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-2xl font-bold text-gray-700">{percentage.toFixed(2)}%</span>
        </div>
      </div>
      <h3 className="font-bold text-gray-600 mt-2 text-center">{title.toUpperCase()}</h3>
    </div>
  );
};

/**
 * A standard donut chart for displaying per-member task breakdown with correct status colors.
 */
const MemberDonutChart: React.FC<{ data: { name: Status; value: number }[], title: string }> = ({ data, title }) => {
    const total = data.reduce((acc, item) => acc + item.value, 0);
    return (
        <div className="bg-white p-4 rounded-lg border border-gray-100 shadow-sm hover:shadow-md transition-all flex flex-col items-center w-full h-full min-h-[250px] justify-between">
            <h3 className="font-bold text-gray-700 mb-2 text-sm text-center truncate w-full" title={title}>{title}</h3>
            <div className="w-full h-[150px] relative flex justify-center items-center">
                <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                        <Pie 
                          data={data} 
                          dataKey="value" 
                          nameKey="name" 
                          cx="50%" 
                          cy="50%" 
                          innerRadius={42} 
                          outerRadius={58} 
                          paddingAngle={3}
                        >
                            {data.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={STATUS_COLORS_OVERVIEW[entry.name]} />
                            ))}
                        </Pie>
                        <Tooltip formatter={(value: number) => [`${((value / total) * 100).toFixed(1)}%`, `${value} công việc`]} />
                    </PieChart>
                </ResponsiveContainer>
                {/* Absolute center label displaying total count */}
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none mb-1">
                    <span className="text-lg font-extrabold text-gray-800 line-height-[1]">{total}</span>
                    <span className="text-[10px] text-gray-400 font-medium tracking-tight mt-[-2px]">công việc</span>
                </div>
            </div>
            {/* Custom high-contrast mini-legend */}
            <div className="flex flex-wrap justify-center gap-x-2 gap-y-1 mt-2 text-[10px] text-gray-500 font-medium">
                {data.map((entry, index) => (
                    <div key={index} className="flex items-center space-x-1">
                        <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ backgroundColor: STATUS_COLORS_OVERVIEW[entry.name] }}></span>
                        <span className="truncate max-w-[80px]">{entry.name}: {entry.value}</span>
                    </div>
                ))}
            </div>
        </div>
    );
};

// Define OverviewDashboardProps interface
interface OverviewDashboardProps {
    tasks: Task[];
    users: User[];
    groups: Group[];
    currentUser: User;
    onUpdateTask: (task: Task) => void;
    onAddTask: (task: Omit<Task, 'id'>) => void;
    onBulkAddTask: (tasks: Omit<Task, 'id'>[]) => Promise<void>;
    onDeleteTask: (id: number) => void;
    onDeleteMultipleTasks: (ids: number[]) => void;
    initialDateFilter?: string | null;
    onClearFilter?: () => void;
    onAddSubtask?: (taskId: number, name: string) => Promise<void>;
    onToggleSubtask?: (taskId: number, subtaskId: number, isCompleted: boolean) => Promise<void>;
    onDeleteSubtask?: (taskId: number, subtaskId: number) => Promise<void>;
}

const OverviewDashboard: React.FC<OverviewDashboardProps> = ({ 
    tasks, 
    users, 
    groups, 
    currentUser, 
    onUpdateTask, 
    onAddTask,
    onBulkAddTask,
    onDeleteTask, 
    onDeleteMultipleTasks,
    initialDateFilter,
    onClearFilter,
    onAddSubtask,
    onToggleSubtask,
    onDeleteSubtask,
}) => {
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [groupFilter, setGroupFilter] = useState('all');
    const [assigneeFilter, setAssigneeFilter] = useState('all');
    const [priorityFilter, setPriorityFilter] = useState('all');
    const [statusFilter, setStatusFilter] = useState('all');
    
    useEffect(() => {
        if (initialDateFilter) {
            setStartDate(initialDateFilter);
            setEndDate(initialDateFilter);
        } else {
            const today = new Date();
            const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
            const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
            setStartDate(startOfMonth.toISOString().split('T')[0]);
            setEndDate(endOfMonth.toISOString().split('T')[0]);
        }
    }, [initialDateFilter]);

    const handleClearDateFilter = () => {
        onClearFilter?.();
    };

    const filteredTasks = useMemo(() => {
        let tempTasks = tasks;
        // Date filter
        if (startDate && endDate) {
            const start = new Date(startDate);
            const end = new Date(endDate);
            if (start <= end) {
                tempTasks = tempTasks.filter(task => {
                    const taskDate = new Date(task.deadline);
                    return taskDate >= start && taskDate <= end;
                });
            } else {
                 tempTasks = [];
            }
        }
        
        // Advanced filters
        if (groupFilter !== 'all') {
            tempTasks = tempTasks.filter(task => String(task.groupId) === groupFilter);
        }
        if (assigneeFilter !== 'all') {
            tempTasks = tempTasks.filter(task => String(task.assigneeId) === assigneeFilter);
        }
        if (priorityFilter !== 'all') {
            tempTasks = tempTasks.filter(task => task.priority === priorityFilter);
        }
        if (statusFilter !== 'all') {
            tempTasks = tempTasks.filter(task => task.status === statusFilter);
        }
        
        return tempTasks;
    }, [tasks, startDate, endDate, groupFilter, assigneeFilter, priorityFilter, statusFilter]);

    const statusCounts = useMemo(() => {
        return filteredTasks.reduce((acc, task) => {
            acc[task.status] = (acc[task.status] || 0) + 1;
            return acc;
        }, {} as Record<Status, number>);
    }, [filteredTasks]);

    const priorityCounts = useMemo(() => {
        return filteredTasks.reduce((acc, task) => {
            acc[task.priority] = (acc[task.priority] || 0) + 1;
            return acc;
        }, {} as Record<Priority, number>);
    }, [filteredTasks]);

    const activeMembers = useMemo(() => {
        return users
            .filter(u => u.role === 'member' || u.role === 'leader')
            .map(user => {
                const userTasks = filteredTasks.filter(task => task.assigneeId === user.id);
                const statusCounts = userTasks.reduce((acc, task) => {
                    acc[task.status] = (acc[task.status] || 0) + 1;
                    return acc;
                }, {} as Record<Status, number>);
                
                const chartData = (Object.keys(statusCounts) as Status[])
                    .map(status => ({ name: status, value: statusCounts[status] }));
                
                return {
                    user,
                    chartData,
                    totalCount: userTasks.length
                };
            })
            .filter(item => item.chartData.length > 0);
    }, [filteredTasks, users]);

    const totalTasks = filteredTasks.length;
    
    const summaryData = [
      { name: Status.Completed, value: statusCounts[Status.Completed] || 0 },
      { name: Status.InProgress, value: statusCounts[Status.InProgress] || 0 },
      { name: Status.Pending, value: statusCounts[Status.Pending] || 0 },
      { name: Status.NotStarted, value: statusCounts[Status.NotStarted] || 0 },
    ];
    
    const priorityChartData = [
        { name: Priority.High, value: priorityCounts[Priority.High] || 0, label: 'Cao' },
        { name: Priority.Medium, value: priorityCounts[Priority.Medium] || 0, label: 'Trung bình' },
        { name: Priority.Low, value: priorityCounts[Priority.Low] || 0, label: 'Thấp' },
    ];

    return (
        <div className="space-y-6">
            {/* Top Section: Overview Status Donuts */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {summaryData.map(item => (
                    <StatusDonut
                        key={item.name}
                        title={item.name as Status}
                        percentage={totalTasks > 0 ? (item.value / totalTasks) * 100 : 0}
                        color={STATUS_COLORS_OVERVIEW[item.name as Status]}
                    />
                ))}
            </div>
      
            {/* Middle Section: Priority chart and Member charts */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left side: Priority chart */}
                <div className="lg:col-span-1 bg-white p-6 rounded-lg shadow flex flex-col">
                    <div className="bg-purple-50 p-3 rounded-t-lg -m-6 mb-4 border-b">
                        <h3 className="font-bold text-gray-700 text-center text-lg">Tổng quan công việc</h3>
                    </div>
                    <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-end gap-4 bg-gray-50 p-3 rounded-md mb-6 border border-gray-200">
                        <div className="w-full sm:flex-1 sm:min-w-[150px]">
                            <label htmlFor="start-date" className="block text-sm font-semibold text-gray-600 mb-1">Từ</label>
                            <input
                                id="start-date"
                                type="date"
                                value={startDate}
                                onChange={(e) => setStartDate(e.target.value)}
                                className="w-full text-gray-800 font-mono bg-white border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 p-1 text-sm"
                            />
                        </div>
                        <div className="w-full sm:flex-1 sm:min-w-[150px]">
                            <label htmlFor="end-date" className="block text-sm font-semibold text-gray-600 mb-1">Đến</label>
                            <input
                                id="end-date"
                                type="date"
                                value={endDate}
                                onChange={(e) => setEndDate(e.target.value)}
                                className="w-full text-gray-800 font-mono bg-white border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 p-1 text-sm"
                            />
                        </div>
                        {initialDateFilter && onClearFilter && (
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
                    <div className="flex-grow">
                        <ResponsiveContainer width="100%" height={300}>
                            <BarChart data={priorityChartData} margin={{ top: 20, right: 30, left: -10, bottom: 5 }}>
                                <XAxis dataKey="label" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                                <YAxis hide />
                                <Tooltip cursor={{fill: 'rgba(234, 223, 215, 0.4)'}} />
                                <Bar dataKey="value" fill={PRIORITY_BAR_COLOR} radius={[4, 4, 0, 0]} barSize={50}>
                                    <LabelList dataKey="value" position="top" />
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
        
                {/* Right side: Member charts - Dynamic Grid / Scroll representation */}
                <div className="lg:col-span-2 flex flex-col justify-between">
                    <div className="flex-grow">
                        {activeMembers.length === 0 ? (
                            <div className="bg-white p-8 rounded-lg border border-gray-100 shadow-sm h-full flex flex-col items-center justify-center text-gray-400 min-h-[300px]">
                                <span className="text-sm font-medium">Không có dữ liệu thành viên trong khoảng thời gian này</span>
                            </div>
                        ) : activeMembers.length <= 4 ? (
                            /* Grid layout if 4 or fewer users, no horizontal scroll, fully responsive (2x2 grid for 4 items) */
                            <div className={`grid gap-4 w-full ${
                                activeMembers.length === 1 ? 'grid-cols-1 md:max-w-md mx-auto' : 'grid-cols-1 sm:grid-cols-2'
                            }`}>
                                {activeMembers.map(({ user, chartData }) => (
                                    <div key={user.id} className="w-full">
                                        <MemberDonutChart 
                                          title={user.name} 
                                          data={chartData} 
                                        />
                                    </div>
                                ))}
                            </div>
                        ) : (
                            /* Horizontal scroll layout if 5 or more users: Displayed in 2 rows flowing horizontally (2 above, 2 below...) */
                            <div className="w-full">
                                <div className="grid grid-rows-2 grid-flow-col gap-4 overflow-x-auto pb-4 scroll-smooth scrollbar-thin snap-x snap-mandatory auto-cols-[85%] sm:auto-cols-[46%] md:auto-cols-[31%] xl:auto-cols-[23.5%]">
                                    {activeMembers.map(({ user, chartData }) => (
                                        <div 
                                            key={user.id} 
                                            className="snap-start w-full pr-1"
                                        >
                                            <MemberDonutChart 
                                              title={user.name} 
                                              data={chartData} 
                                            />
                                        </div>
                                    ))}
                                </div>
                                <div className="text-center mt-2 text-[11px] text-gray-400 font-medium select-none animate-pulse">
                                    ← Vuốt ngang để xem thêm thành viên ({activeMembers.length}) →
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Bottom Section: Task List */}
            <TodoList 
                tasks={filteredTasks}
                users={users}
                groups={groups}
                currentUser={currentUser}
                onUpdateTask={onUpdateTask}
                onAddTask={onAddTask}
                onBulkAddTask={onBulkAddTask}
                onDeleteTask={onDeleteTask}
                onDeleteMultipleTasks={onDeleteMultipleTasks}
                showDateFilter={false}
                showAddControls={false}
                showAdvancedFilters={true}
                groupFilter={groupFilter}
                setGroupFilter={setGroupFilter}
                assigneeFilter={assigneeFilter}
                setAssigneeFilter={setAssigneeFilter}
                priorityFilter={priorityFilter}
                setPriorityFilter={setPriorityFilter}
                statusFilter={statusFilter}
                setStatusFilter={setStatusFilter}
                onAddSubtask={onAddSubtask}
                onToggleSubtask={onToggleSubtask}
                onDeleteSubtask={onDeleteSubtask}
            />
        </div>
    );
};

export default OverviewDashboard;