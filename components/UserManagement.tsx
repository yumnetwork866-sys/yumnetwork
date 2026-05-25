import React, { useState, useEffect, useRef } from 'react';
import { User, Task, Group } from '../types';
import { AVAILABLE_GROUP_COLORS } from '../constants';

interface BadgeProps {
  children: React.ReactNode;
  colorClass: string;
}

const Badge: React.FC<BadgeProps> = ({ children, colorClass }) => (
  <span className={`px-3 py-1 text-xs font-semibold rounded-full ${colorClass}`}>
    {children}
  </span>
);

interface ColorPickerProps {
    selectedColor: string;
    onSelectColor: (color: string) => void;
}

const ColorPicker: React.FC<ColorPickerProps> = ({ selectedColor, onSelectColor }) => (
    <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Màu nhóm</label>
        <div className="flex flex-wrap gap-2">
            {AVAILABLE_GROUP_COLORS.map(color => (
                <button
                    key={color}
                    type="button"
                    onClick={() => onSelectColor(color)}
                    className={`w-8 h-8 rounded-full ${color.split(' ')[0]} border-2 ${selectedColor === color ? 'border-blue-500 ring-2 ring-blue-300' : 'border-transparent'}`}
                    aria-label={`Chọn màu ${color}`}
                />
            ))}
        </div>
    </div>
);


interface GroupManagementModalProps {
    isOpen: boolean;
    onClose: () => void;
    groups: Group[];
    tasks: Task[];
    users: User[];
    onAddGroup: (name: string, colorClass: string) => void;
    onUpdateGroup: (group: Group) => void;
    onDeleteGroup: (id: number) => void;
}

const GroupManagementModal: React.FC<GroupManagementModalProps> = ({ isOpen, onClose, groups, tasks, users, onAddGroup, onUpdateGroup, onDeleteGroup }) => {
    const [newGroup, setNewGroup] = useState({ name: '', colorClass: AVAILABLE_GROUP_COLORS[0] });
    const [editingGroup, setEditingGroup] = useState<Group | null>(null);

    if (!isOpen) return null;

    const handleAdd = () => {
        if (newGroup.name.trim()) {
            onAddGroup(newGroup.name.trim(), newGroup.colorClass);
            setNewGroup({ name: '', colorClass: AVAILABLE_GROUP_COLORS[0] });
        }
    };
    
    const handleUpdate = () => {
        if (editingGroup && editingGroup.name.trim()) {
            onUpdateGroup(editingGroup);
            setEditingGroup(null);
        }
    };

    const isGroupInUse = (groupId: number) => 
        tasks.some(task => task.groupId === groupId) || 
        users.some(user => user.groupId === groupId);

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
            <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-lg">
                <h2 className="text-xl font-bold mb-4">Quản lý nhóm</h2>
                <div className="space-y-4">
                    {/* Add new group form */}
                    <div className="p-4 border rounded-lg space-y-3">
                         <input
                            type="text"
                            value={newGroup.name}
                            onChange={(e) => setNewGroup({...newGroup, name: e.target.value})}
                            placeholder="Tên nhóm mới"
                            className="w-full border border-gray-300 rounded-md shadow-sm p-2"
                        />
                        <ColorPicker selectedColor={newGroup.colorClass} onSelectColor={(color) => setNewGroup({...newGroup, colorClass: color})} />
                        <button onClick={handleAdd} className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700">Thêm nhóm mới</button>
                    </div>
                    {/* List of groups */}
                    <div className="space-y-2 max-h-60 overflow-y-auto pr-2">
                        {groups.map(group => (
                            <div key={group.id} className="p-2 bg-gray-50 rounded-md">
                                {editingGroup?.id === group.id ? (
                                    <div className="space-y-3">
                                        <input 
                                            type="text" 
                                            value={editingGroup.name}
                                            onChange={(e) => setEditingGroup({...editingGroup, name: e.target.value})}
                                            className="w-full border border-gray-300 rounded-md p-2"
                                        />
                                        <ColorPicker selectedColor={editingGroup.colorClass} onSelectColor={(color) => setEditingGroup({...editingGroup, colorClass: color})} />
                                        <div className="flex justify-end space-x-2">
                                            <button onClick={() => setEditingGroup(null)} className="text-gray-600 hover:text-gray-800 text-xs">Hủy</button>
                                            <button onClick={handleUpdate} className="text-green-600 hover:text-green-800 text-xs font-bold">Lưu</button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex items-center space-x-2">
                                        <Badge colorClass={group.colorClass}>{group.name}</Badge>
                                        <span className="flex-grow">{/* spacer */}</span>
                                        <div className="flex-shrink-0">
                                            <button onClick={() => setEditingGroup({...group})} className="text-blue-600 hover:text-blue-800 text-xs mr-2">Sửa</button>
                                            <button
                                                onClick={() => onDeleteGroup(group.id)}
                                                className={`text-red-600 hover:text-red-800 text-xs ${isGroupInUse(group.id) ? 'opacity-50 cursor-not-allowed' : ''}`}
                                                disabled={isGroupInUse(group.id)}
                                                title={isGroupInUse(group.id) ? 'Không thể xóa nhóm đang sử dụng' : 'Xóa nhóm'}
                                            >
                                                Xóa
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
                <div className="flex justify-end space-x-2 mt-6">
                    <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-200 rounded-md hover:bg-gray-300">Đóng</button>
                </div>
            </div>
        </div>
    );
};


interface UserModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (user: Omit<User, 'id'> | User) => void;
    userToEdit: User | null;
    groups: Group[];
}

const UserModal: React.FC<UserModalProps> = ({ isOpen, onClose, onSave, userToEdit, groups }) => {
    const [user, setUser] = useState<Omit<User, 'id'> | User | null>(null);

    useEffect(() => {
        if (userToEdit) {
            setUser({
                ...userToEdit,
                password: '', // Prevent showing the password value in the DOM
                managedGroupIds: userToEdit.managedGroupIds || []
            });
        } else {
            setUser({ name: '', role: 'member', email: '', password: '', groupId: null, managedGroupIds: [] });
        }
    }, [userToEdit]);

    if (!isOpen || !user) return null;

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        if (name === 'groupId') {
             setUser({ ...user, groupId: value ? parseInt(value, 10) : null });
        } else {
             setUser({ ...user, [name]: value });
        }
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSave(user);
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
            <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-md">
                <h2 className="text-xl font-bold mb-4">{userToEdit ? 'Sửa người dùng' : 'Thêm người dùng mới'}</h2>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Tên người dùng</label>
                        <input type="text" name="name" value={user.name} onChange={handleChange} className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2" required />
                    </div>
                     <div>
                        <label className="block text-sm font-medium text-gray-700">Email</label>
                        <input type="email" name="email" value={user.email} onChange={handleChange} className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2" required />
                    </div>
                     <div>
                        <label className="block text-sm font-medium text-gray-700">Mật khẩu</label>
                        <input 
                            type="password" 
                            name="password" 
                            value={user.password} 
                            onChange={handleChange} 
                            placeholder={userToEdit ? "Để trống nếu không muốn đổi" : "Nhập mật khẩu mới"}
                            className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2" 
                            required={!userToEdit} 
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Vai trò</label>
                        <select name="role" value={user.role} onChange={handleChange} className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2">
                            <option value="member">member</option>
                            <option value="leader">leader</option>
                            <option value="admin">admin</option>
                        </select>
                    </div>
                     <div>
                        <label className="block text-sm font-medium text-gray-700">Nhóm chính</label>
                        <select name="groupId" value={user.groupId ?? ''} onChange={handleChange} className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2">
                           <option value="">Không có nhóm</option>
                           {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                        </select>
                     </div>
                     {user.role === 'leader' && (
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Các nhóm quản lý phụ (Có thể chọn nhiều)</label>
                            <div className="space-y-1.5 border border-gray-200 rounded-md p-3 max-h-40 overflow-y-auto">
                                {groups.map(g => {
                                    const isChecked = Array.isArray(user.managedGroupIds) && user.managedGroupIds.includes(g.id);
                                    return (
                                        <label key={g.id} className="flex items-center space-x-2 text-sm text-gray-700 cursor-pointer hover:bg-gray-50 p-1 rounded">
                                            <input
                                                type="checkbox"
                                                checked={isChecked}
                                                onChange={() => {
                                                    const currentManaged = Array.isArray(user.managedGroupIds) ? user.managedGroupIds : [];
                                                    const updatedManaged = isChecked
                                                        ? currentManaged.filter(id => id !== g.id)
                                                        : [...currentManaged, g.id];
                                                    setUser({ ...user, managedGroupIds: updatedManaged });
                                                }}
                                                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                            />
                                            <span className="flex-grow">{g.name}</span>
                                        </label>
                                    );
                                })}
                            </div>
                            <p className="mt-1 text-[11px] text-gray-500">Giúp phân quyền cho Trưởng nhóm có thể tham gia và quản trị nhiều nhóm khác nhau.</p>
                        </div>
                     )}
                    <div className="flex justify-end space-x-2 pt-2">
                        <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-200 rounded-md hover:bg-gray-300">Hủy</button>
                        <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700">Lưu</button>
                    </div>
                </form>
            </div>
        </div>
    );
};

interface UserManagementProps {
    users: User[];
    tasks: Task[];
    groups: Group[];
    currentUser: User;
    onAddUser: (user: Omit<User, 'id'>) => void;
    onUpdateUser: (user: User) => void;
    onDeleteUser: (id: number) => void;
    onDeleteMultipleUsers: (ids: number[]) => void;
    onAddGroup: (name: string, colorClass: string) => void;
    onUpdateGroup: (group: Group) => void;
    onDeleteGroup: (id: number) => void;
}

const UserManagement: React.FC<UserManagementProps> = ({ 
    users, 
    tasks, 
    groups, 
    currentUser, 
    onAddUser, 
    onUpdateUser, 
    onDeleteUser, 
    onDeleteMultipleUsers,
    onAddGroup,
    onUpdateGroup,
    onDeleteGroup,
}) => {
    const [isUserModalOpen, setIsUserModalOpen] = useState(false);
    const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
    const [userToEdit, setUserToEdit] = useState<User | null>(null);
    const [selectedUserIds, setSelectedUserIds] = useState<number[]>([]);
    const selectAllRef = useRef<HTMLInputElement>(null);

    const usersAvailableForSelection = users.filter(u => u.id !== currentUser.id);
    const isAllSelected = usersAvailableForSelection.length > 0 && selectedUserIds.length === usersAvailableForSelection.length;

    useEffect(() => {
      if (selectAllRef.current) {
        selectAllRef.current.checked = isAllSelected;
        selectAllRef.current.indeterminate = selectedUserIds.length > 0 && !isAllSelected;
      }
    }, [selectedUserIds, isAllSelected]);

    const handleOpenUserModal = (user: User | null) => {
        setUserToEdit(user);
        setIsUserModalOpen(true);
    };

    const handleCloseUserModal = () => {
        setUserToEdit(null);
        setIsUserModalOpen(false);
    };

    const handleSaveUser = (userData: Omit<User, 'id'> | User) => {
        if ('id' in userData) {
            onUpdateUser(userData);
        } else {
            onAddUser(userData);
        }
    };

    const handleDelete = (userId: number) => {
        const userHasTasks = tasks.some(task => task.assigneeId === userId);
        if (userHasTasks) {
            alert('Không thể xóa người dùng này vì họ có công việc được giao.');
            return;
        }
        if (window.confirm('Bạn có chắc chắn muốn xóa người dùng này không?')) {
            onDeleteUser(userId);
        }
    };

    const handleSelectUser = (userId: number) => {
        setSelectedUserIds(prev =>
            prev.includes(userId)
                ? prev.filter(id => id !== userId)
                : [...prev, userId]
        );
    };

    const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.checked) {
            setSelectedUserIds(usersAvailableForSelection.map(u => u.id));
        } else {
            setSelectedUserIds([]);
        }
    };
    
    const handleBulkDelete = () => {
        const usersWithTasks = selectedUserIds.filter(id => tasks.some(task => task.assigneeId === id));
        if (usersWithTasks.length > 0) {
            const userNames = users.filter(u => usersWithTasks.includes(u.id)).map(u => u.name).join(', ');
            alert(`Không thể xóa người dùng: ${userNames} vì họ có công việc được giao.`);
            return;
        }

        if (window.confirm(`Bạn có chắc chắn muốn xóa ${selectedUserIds.length} người dùng đã chọn không?`)) {
            onDeleteMultipleUsers(selectedUserIds);
            setSelectedUserIds([]);
        }
    };
    
    return (
        <div className="bg-white p-6 rounded-lg shadow-lg">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
                <h2 className="text-2xl font-bold text-gray-800">Quản lý người dùng</h2>
                 <div className="flex items-center flex-wrap gap-2 justify-start md:justify-end">
                    {selectedUserIds.length > 0 && (
                        <button 
                            onClick={handleBulkDelete}
                            className="px-4 py-2 bg-red-600 text-white font-semibold rounded-lg hover:bg-red-700 transition"
                        >
                            Xóa ({selectedUserIds.length}) người dùng
                        </button>
                    )}
                    <button onClick={() => setIsGroupModalOpen(true)} className="px-4 py-2 bg-gray-600 text-white font-semibold rounded-lg hover:bg-gray-700 transition">Quản lý nhóm</button>
                    <button onClick={() => handleOpenUserModal(null)} className="px-4 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition">Thêm người dùng</button>
                </div>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full">
                    <thead className="bg-gray-100">
                        <tr>
                            <th className="p-3 w-4">
                               <input
                                    type="checkbox"
                                    ref={selectAllRef}
                                    onChange={handleSelectAll}
                                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                />
                            </th>
                            <th className="p-3 text-left text-sm font-semibold text-gray-600 min-w-[60px]">ID</th>
                            <th className="p-3 text-left text-sm font-semibold text-gray-600 min-w-[150px]">Tên</th>
                            <th className="p-3 text-left text-sm font-semibold text-gray-600 min-w-[200px]">Email</th>
                            <th className="p-3 text-left text-sm font-semibold text-gray-600 min-w-[120px]">Vai trò</th>
                            <th className="p-3 text-left text-sm font-semibold text-gray-600 min-w-[150px]">Nhóm</th>
                            <th className="p-3 text-left text-sm font-semibold text-gray-600 min-w-[100px]"></th>
                        </tr>
                    </thead>
                    <tbody>
                        {users.map(user => {
                            const userGroup = user.groupId ? groups.find(g => g.id === user.groupId) : null;
                            return (
                            <tr key={user.id} className="border-b hover:bg-gray-50">
                                <td className="p-3">
                                    <input
                                        type="checkbox"
                                        className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:bg-gray-200"
                                        checked={selectedUserIds.includes(user.id)}
                                        onChange={() => handleSelectUser(user.id)}
                                        disabled={user.id === currentUser.id}
                                        title={user.id === currentUser.id ? 'Bạn không thể chọn chính mình' : ''}
                                    />
                                </td>
                                <td className="p-3 text-sm text-gray-700 whitespace-nowrap">{user.id}</td>
                                <td className="p-3 text-sm text-gray-700 whitespace-nowrap">{user.name}</td>
                                <td className="p-3 text-sm text-gray-700 whitespace-nowrap">{user.email}</td>
                                <td className="p-3 text-sm text-gray-700 whitespace-nowrap">
                                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${user.role === 'admin' ? 'bg-red-100 text-red-800' : user.role === 'leader' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'}`}>
                                        {user.role}
                                    </span>
                                </td>
                                <td className="p-3 text-sm text-gray-700 whitespace-nowrap">
                                    <div className="flex flex-wrap items-center gap-1">
                                        {userGroup ? (
                                            <Badge colorClass={userGroup.colorClass}>{userGroup.name}</Badge>
                                        ) : (
                                            <span className="text-gray-400">N/A</span>
                                        )}
                                        {user.role === 'leader' && Array.isArray(user.managedGroupIds) && user.managedGroupIds.length > 0 && (
                                            <>
                                                <span className="text-gray-400 text-xs font-bold font-mono px-1">+</span>
                                                {user.managedGroupIds.map(gId => {
                                                    const g = groups.find(gp => gp.id === gId);
                                                    if (!g) return null;
                                                    return (
                                                        <span key={g.id} className="px-2 py-0.5 text-[10px] font-semibold rounded bg-indigo-50 text-indigo-700 border border-indigo-200" title={`Nhóm quản lý: ${g.name}`}>
                                                            {g.name}
                                                        </span>
                                                    );
                                                })}
                                            </>
                                        )}
                                    </div>
                                </td>
                                <td className="p-3 text-right whitespace-nowrap">
                                    <button onClick={() => handleOpenUserModal(user)} className="text-blue-500 hover:text-blue-700 mr-4 text-xs font-semibold">Sửa</button>
                                </td>
                            </tr>
                        )})}
                    </tbody>
                </table>
            </div>
            <UserModal 
                isOpen={isUserModalOpen}
                onClose={handleCloseUserModal}
                onSave={handleSaveUser}
                userToEdit={userToEdit}
                groups={groups}
            />
            <GroupManagementModal
                isOpen={isGroupModalOpen}
                onClose={() => setIsGroupModalOpen(false)}
                groups={groups}
                tasks={tasks}
                users={users}
                onAddGroup={onAddGroup}
                onUpdateGroup={onUpdateGroup}
                onDeleteGroup={onDeleteGroup}
            />
        </div>
    );
};

export default UserManagement;