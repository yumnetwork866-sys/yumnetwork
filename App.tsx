import React, { useState, useMemo, useEffect } from 'react';
import { Task, User, View, Group, Status } from './types';
import TodoList from './components/TodoList';
import OverviewDashboard from './components/OverviewDashboard';
import CalendarView from './components/CalendarView';
import UserManagement from './components/UserManagement';
import Login from './components/Login';
import { apiRequest } from './api';

const App: React.FC = () => {
  const [activeView, setActiveView] = useState<View>('Tổng quan');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listDateFilter, setListDateFilter] = useState<string | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const [loggedInUser, setLoggedInUser] = useState<User | null>(() => {
    const savedUser = localStorage.getItem('loggedInUser');
    try {
        return savedUser ? JSON.parse(savedUser) : null;
    } catch {
        localStorage.removeItem('loggedInUser');
        return null;
    }
  });

  useEffect(() => {
    if (loggedInUser) {
        const fetchData = async () => {
            setIsLoading(true);
            setError(null);
            try {
                const [usersData, groupsData, tasksData] = await Promise.all([
                    apiRequest<User[]>('/api/users'),
                    apiRequest<Group[]>('/api/groups'),
                    apiRequest<Task[]>('/api/tasks')
                ]);
                setUsers(usersData);
                setGroups(groupsData);
                setTasks(tasksData);
            } catch (err: any) {
                setError(`Không thể tải dữ liệu bảng điều khiển: ${err.message}`);
                console.error(err);
            } finally {
                setIsLoading(false);
            }
        };
        fetchData();
    }
  }, [loggedInUser]);

  const visibleTasks = useMemo(() => {
    if (!loggedInUser) return [];
    return tasks.filter(task => {
      if (loggedInUser.role === 'admin') return true;

      // Find role of the assignee
      const assignee = users.find(u => u.id === task.assigneeId);
      const isAssigneeLeader = assignee?.role === 'leader';

      if (loggedInUser.role === 'leader') {
        // Leader: can only see tasks of their team
        if (task.groupId !== loggedInUser.groupId) return false;

        // Leader's tasks can only be seen by admin and themselves
        if (isAssigneeLeader && task.assigneeId !== loggedInUser.id) {
          return false;
        }
        return true;
      }

      if (loggedInUser.role === 'member') {
        // Standard member: cannot see leader tasks
        if (isAssigneeLeader) return false;
        // See tasks of their own group
        if (loggedInUser.groupId !== null && task.groupId !== loggedInUser.groupId) return false;
        return true;
      }

      return false;
    });
  }, [tasks, loggedInUser, users]);

  const visibleUsers = useMemo(() => {
    if (!loggedInUser) return [];
    if (loggedInUser.role === 'admin') return users;
    return users.filter(u => u.groupId === loggedInUser.groupId || u.role === 'admin');
  }, [users, loggedInUser]);

  const availableViews = useMemo(() => {
    if (!loggedInUser) return [];
    if (loggedInUser.role === 'admin') {
      return ['Tổng quan', 'Danh sách công việc', 'Lịch', 'Người dùng'] as View[];
    } else if (loggedInUser.role === 'leader') {
      return ['Tổng quan', 'Danh sách công việc', 'Lịch'] as View[];
    } else {
      return ['Tổng quan', 'Danh sách công việc', 'Lịch'] as View[];
    }
  }, [loggedInUser]);

  useEffect(() => {
    if (loggedInUser) {
      if (loggedInUser.role === 'member' && activeView === 'Người dùng') {
        setActiveView('Tổng quan');
      } else if (loggedInUser.role === 'leader' && activeView === 'Người dùng') {
        setActiveView('Tổng quan');
      }
    } else {
      setActiveView('Tổng quan');
    }
  }, [loggedInUser, activeView]);

  const handleLogin = async (email: string, password: string): Promise<boolean> => {
    try {
      // Fetch all users to check credentials. In a real app, this would be a dedicated login endpoint.
      const allUsers = await apiRequest<User[]>('/api/users');
      const user = allUsers.find(u => u.email === email && u.password === password);
      if (user) {
        localStorage.setItem('loggedInUser', JSON.stringify(user));
        setLoggedInUser(user);
        return true;
      }
      return false;
    } catch (err) {
      console.error("Đăng nhập thất bại:", err);
      setError('Yêu cầu đăng nhập thất bại. Vui lòng thử lại.');
      return false;
    }
  };


  const handleLogout = () => {
    localStorage.removeItem('loggedInUser');
    setLoggedInUser(null);
    setUsers([]);
    setTasks([]);
    setGroups([]);
  };

  const handleUpdateTask = async (updatedTask: Task) => {
    try {
        const result = await apiRequest<Task>(`/api/tasks/${updatedTask.id}`, 'PUT', updatedTask);
        if (result) {
            setTasks(tasks.map((task) => (task.id === result.id ? result : task)));
        }
    } catch (error) { console.error("Không thể cập nhật công việc:", error); }
  };

  const handleAddTask = async (newTask: Omit<Task, 'id'>) => {
    if (!loggedInUser) return;
    const isLeaderOfGroup = loggedInUser.role === 'leader' && loggedInUser.groupId !== null && newTask.groupId === loggedInUser.groupId;
    const isMemberOfTheirOwnTask = loggedInUser.role === 'member' && newTask.assigneeId === loggedInUser.id;
    if (loggedInUser.role !== 'admin' && !isLeaderOfGroup && !isMemberOfTheirOwnTask) return;
    try {
        const result = await apiRequest<Task>('/api/tasks', 'POST', newTask);
        if (result) {
            const updatedTasks = [...tasks, result].sort((a, b) => {
                const diff = new Date(b.deadline).getTime() - new Date(a.deadline).getTime();
                if (diff !== 0) return diff;
                return b.id - a.id;
            });
            setTasks(updatedTasks);
        }
    } catch (error) { console.error("Không thể thêm công việc:", error); }
  };

  const handleBulkAddTask = async (newTasks: Omit<Task, 'id'>[]) => {
    if (!loggedInUser || newTasks.length === 0) return;
    const hasPermission = newTasks.every(task => {
        if (loggedInUser.role === 'admin') return true;
        if (loggedInUser.role === 'leader' && loggedInUser.groupId !== null && task.groupId === loggedInUser.groupId) return true;
        if (loggedInUser.role === 'member' && task.assigneeId === loggedInUser.id) return true;
        return false;
    });
    if (!hasPermission) return;
    try {
        const results = await apiRequest<Task[]>('/api/tasks', 'POST', newTasks);
        if (results && results.length > 0) {
            setTasks(prevTasks => [...prevTasks, ...results].sort((a, b) => {
                const diff = new Date(b.deadline).getTime() - new Date(a.deadline).getTime();
                if (diff !== 0) return diff;
                return b.id - a.id;
            }));
        }
    } catch (error) {
        console.error("Không thể thêm nhiều công việc:", error);
        // Re-throw to let the caller component handle UI feedback
        throw error;
    }
  };

  const handleDeleteTask = async (taskId: number) => {
    if (!loggedInUser) return;
    const taskToDelete = tasks.find((t) => t.id === taskId);
    if (!taskToDelete) return;
    const isLeaderOfGroup = loggedInUser.role === 'leader' && loggedInUser.groupId !== null && taskToDelete.groupId === loggedInUser.groupId;
    const isMemberOfTheirOwnTask = loggedInUser.role === 'member' && taskToDelete.assigneeId === loggedInUser.id;
    if (loggedInUser.role !== 'admin' && !isLeaderOfGroup && !isMemberOfTheirOwnTask) return;
     try {
        await apiRequest(`/api/tasks/${taskId}`, 'DELETE');
        setTasks(tasks.filter((task) => task.id !== taskId));
    } catch (error) { console.error("Không thể xóa công việc:", error); }
  };
  
  const handleDeleteMultipleTasks = async (taskIds: number[]) => {
    if (!loggedInUser) return;
    const tasksToDelete = tasks.filter((t) => taskIds.includes(t.id));
    const hasPermission = tasksToDelete.every(task => {
        if (loggedInUser.role === 'admin') return true;
        if (loggedInUser.role === 'leader' && loggedInUser.groupId !== null && task.groupId === loggedInUser.groupId) return true;
        if (loggedInUser.role === 'member' && task.assigneeId === loggedInUser.id) return true;
        return false;
    });
    if (!hasPermission) return;
    try {
        await apiRequest('/api/tasks', 'DELETE', { ids: taskIds });
        setTasks(tasks.filter((task) => !taskIds.includes(task.id)));
    } catch (error) { console.error("Không thể xóa nhiều công việc:", error); }
  };

  const handleAddUser = async (newUser: Omit<User, 'id'>) => {
    if (loggedInUser?.role !== 'admin') return;
     try {
        const result = await apiRequest<User>('/api/users', 'POST', newUser);
        if (result) {
            setUsers([...users, result]);
        }
    } catch (error) { console.error("Không thể thêm người dùng:", error); }
  };

  const handleUpdateUser = async (updatedUser: User) => {
    if (loggedInUser?.role !== 'admin') return;
    try {
        const result = await apiRequest<User>(`/api/users/${updatedUser.id}`, 'PUT', updatedUser);
        if (result) {
            setUsers(users.map(u => u.id === result.id ? result : u));
            
            if (loggedInUser.id === result.id) {
                setLoggedInUser(result);
                localStorage.setItem('loggedInUser', JSON.stringify(result));
            }
            // Refetch tasks if a user's group changed, as it might affect task groups.
            const originalUser = users.find(u => u.id === updatedUser.id);
            if (originalUser && originalUser.groupId !== updatedUser.groupId) {
                 const tasksData = await apiRequest<Task[]>('/api/tasks');
                 setTasks(tasksData);
            }
        }
    } catch (error) { console.error("Không thể cập nhật người dùng:", error); }
  };

  const handleDeleteUser = async (userId: number) => {
    if (loggedInUser?.role !== 'admin') return;
    // Client-side validation remains
    const adminCount = users.filter(u => u.role === 'admin').length;
    const userToDelete = users.find(u => u.id === userId);
    if(userToDelete?.role === 'admin' && adminCount <= 1) {
        alert("Không thể xóa quản trị viên cuối cùng.");
        return;
    }
    try {
        await apiRequest(`/api/users/${userId}`, 'DELETE');
        setTasks(tasks.filter(task => task.assigneeId !== userId));
        setUsers(users.filter(user => user.id !== userId));
    } catch(error) { console.error("Không thể xóa người dùng:", error); }
  };

  const handleDeleteMultipleUsers = async (userIds: number[]) => {
    if (loggedInUser?.role !== 'admin') return;
     // Client-side validation remains
    const totalAdminCount = users.filter(u => u.role === 'admin').length;
    const adminsToDeleteCount = users.filter(u => userIds.includes(u.id) && u.role === 'admin').length;
    if (totalAdminCount > 0 && adminsToDeleteCount >= totalAdminCount) {
        alert("Không thể xóa (các) quản trị viên cuối cùng.");
        return;
    }
    try {
        await apiRequest('/api/users', 'DELETE', { ids: userIds });
        setTasks(tasks.filter(task => !userIds.includes(task.assigneeId)));
        setUsers(users.filter(user => !userIds.includes(user.id)));
    } catch(error) { console.error("Không thể xóa nhiều người dùng:", error); }
  };

  const handleAddGroup = async (groupName: string, colorClass: string) => {
    if (loggedInUser?.role !== 'admin') return;
    try {
        const result = await apiRequest<Group>('/api/groups', 'POST', { name: groupName, colorClass });
        if (result) {
            setGroups([...groups, result]);
        }
    } catch(error) { console.error("Không thể thêm nhóm:", error); }
  };

  const handleUpdateGroup = async (updatedGroup: Group) => {
    if (loggedInUser?.role !== 'admin') return;
    try {
        const result = await apiRequest<Group>(`/api/groups/${updatedGroup.id}`, 'PUT', updatedGroup);
        if (result) {
            setGroups(groups.map(g => g.id === result.id ? result : g));
        }
    } catch(error) { console.error("Không thể cập nhật nhóm:", error); }
  };

  const handleDeleteGroup = async (groupId: number) => {
    if (loggedInUser?.role !== 'admin') return;
    // Client-side validation remains
    const isGroupInUseByTask = tasks.some(task => task.groupId === groupId);
    if (isGroupInUseByTask) {
        alert("Không thể xóa nhóm này vì nó đang được sử dụng trong các công việc.");
        return;
    }
    const isGroupInUseByUser = users.some(user => user.groupId === groupId);
    if (isGroupInUseByUser) {
        alert("Không thể xóa nhóm này vì nó được gán cho các thành viên.");
        return;
    }
    try {
        await apiRequest(`/api/groups/${groupId}`, 'DELETE');
        setGroups(groups.filter(g => g.id !== groupId));
    } catch(error) { console.error("Không thể xóa nhóm:", error); }
  };

  const handleCalendarDateSelect = (date: string) => {
    setListDateFilter(date);
    setActiveView('Tổng quan');
  };

  const handleViewChange = (view: View) => {
      setActiveView(view);
      setListDateFilter(null); // Reset date filter on manual view change
  };

  if (!loggedInUser) {
    return <Login onLogin={handleLogin} />;
  }
  
  const renderView = () => {
    if (isLoading) {
      return <div className="text-center p-10">Đang tải dữ liệu...</div>;
    }
    if (error) {
      return <div className="text-center p-10 text-red-600">Lỗi: {error}</div>;
    }
    switch (activeView) {
      case 'Tổng quan':
        return <OverviewDashboard 
                  tasks={visibleTasks} 
                  users={visibleUsers}
                  groups={groups}
                  currentUser={loggedInUser}
                  onUpdateTask={handleUpdateTask}
                  onAddTask={handleAddTask}
                  onBulkAddTask={handleBulkAddTask}
                  onDeleteTask={handleDeleteTask}
                  onDeleteMultipleTasks={handleDeleteMultipleTasks}
                  initialDateFilter={listDateFilter}
                  onClearFilter={() => setListDateFilter(null)}
                />;
      case 'Danh sách công việc':
        return <TodoList 
                  tasks={visibleTasks} 
                  users={visibleUsers} 
                  groups={groups}
                  currentUser={loggedInUser} 
                  onUpdateTask={handleUpdateTask} 
                  onAddTask={handleAddTask}
                  onBulkAddTask={handleBulkAddTask}
                  onDeleteTask={handleDeleteTask}
                  onDeleteMultipleTasks={handleDeleteMultipleTasks}
                  initialDateFilter={listDateFilter}
                  onClearFilter={() => setListDateFilter(null)}
                />;
      case 'Lịch':
        return <CalendarView 
                  tasks={visibleTasks} 
                  users={visibleUsers} 
                  onDateSelect={handleCalendarDateSelect}
                />;
      case 'Người dùng':
        if (loggedInUser.role !== 'admin') return null;
        return <UserManagement 
                  users={users} 
                  tasks={tasks}
                  groups={groups}
                  currentUser={loggedInUser}
                  onAddUser={handleAddUser}
                  onUpdateUser={handleUpdateUser}
                  onDeleteUser={handleDeleteUser}
                  onDeleteMultipleUsers={handleDeleteMultipleUsers}
                  onAddGroup={handleAddGroup}
                  onUpdateGroup={handleUpdateGroup}
                  onDeleteGroup={handleDeleteGroup}
                />;
      default:
        return <OverviewDashboard 
                  tasks={visibleTasks} 
                  users={visibleUsers}
                  groups={groups}
                  currentUser={loggedInUser}
                  onUpdateTask={handleUpdateTask}
                  onAddTask={handleAddTask}
                  onBulkAddTask={handleBulkAddTask}
                  onDeleteTask={handleDeleteTask}
                  onDeleteMultipleTasks={handleDeleteMultipleTasks}
                />;
    }
  };

  return (
    <div className="bg-gray-50 min-h-screen font-sans">
      <header className="bg-white shadow-sm p-4 flex justify-between items-center relative">
        <div className="flex items-center">
          <img 
            src="/favicon.png" 
            alt="YUM Network Logo" 
            className="h-[4.5rem] w-[4.5rem] object-contain rounded-md" 
            referrerPolicy="no-referrer" 
          />
        </div>

        {/* Desktop Navigation & User Info */}
        <div className="hidden md:flex items-center gap-4">
            <nav className="flex space-x-1 bg-gray-100 p-1 rounded-md">
                {availableViews.map((view) => (
                <button
                    key={view}
                    onClick={() => handleViewChange(view)}
                    className={`px-4 py-2 text-sm font-semibold rounded-md transition-colors ${
                    activeView === view
                        ? 'bg-white text-blue-600 shadow'
                        : 'text-gray-600 hover:bg-gray-200'
                    }`}
                >
                    {view}
                </button>
                ))}
            </nav>
            <div className="flex items-center space-x-4">
                <span className="text-sm text-gray-700 font-bold">
                    {loggedInUser.name}
                </span>
                <button
                    onClick={handleLogout}
                    className="px-4 py-2 text-sm font-semibold rounded-md transition-colors bg-red-500 text-white hover:bg-red-600"
                >
                    Đăng xuất
                </button>
            </div>
        </div>

        {/* Mobile Menu Button (Hamburger) */}
        <div className="md:hidden">
            <button
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                className="p-2 rounded-md text-gray-600 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500"
                aria-label="Open main menu"
            >
                <svg className="h-6 w-6" stroke="currentColor" fill="none" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
                </svg>
            </button>
        </div>

        {/* Mobile Menu (Dropdown) */}
        {isMobileMenuOpen && (
            <div className="absolute top-full right-0 mt-2 w-64 bg-white rounded-md shadow-lg p-2 z-20 md:hidden">
                <nav className="flex flex-col space-y-1">
                    {availableViews.map((view) => (
                        <button
                            key={view}
                            onClick={() => {
                                handleViewChange(view);
                                setIsMobileMenuOpen(false); // Close menu on selection
                            }}
                            className={`px-4 py-2 text-sm font-semibold rounded-md text-left transition-colors ${
                                activeView === view
                                    ? 'bg-blue-100 text-blue-600'
                                    : 'text-gray-700 hover:bg-gray-100'
                            }`}
                        >
                            {view}
                        </button>
                    ))}
                </nav>
                <div className="border-t my-2"></div>
                <div className="p-2">
                    <span className="block text-sm text-gray-700 font-bold mb-2">
                        {loggedInUser.name}
                    </span>
                    <button
                        onClick={() => {
                            handleLogout();
                            setIsMobileMenuOpen(false);
                        }}
                        className="w-full text-left px-4 py-2 text-sm font-semibold rounded-md transition-colors bg-red-500 text-white hover:bg-red-600"
                    >
                        Đăng xuất
                    </button>
                </div>
            </div>
        )}
      </header>
      <main className="p-2 sm:p-6">
        {renderView()}
      </main>
    </div>
  );
};

export default App;