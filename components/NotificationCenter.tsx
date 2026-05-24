import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Bell, Check, Trash2, Calendar, PlusCircle, AlertCircle, Sparkles } from 'lucide-react';
import { Notification, User } from '../types';
import { apiRequest } from '../api';

interface NotificationCenterProps {
  currentUser: User;
  refreshTrigger?: number; // Can be updated by parent when a task is added
}

export const NotificationCenter: React.FC<NotificationCenterProps> = ({ currentUser, refreshTrigger }) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [browserPermission, setBrowserPermission] = useState<NotificationPermission>('default');
  const [isEnabled, setIsEnabled] = useState<boolean>(() => {
    const saved = localStorage.getItem('notifications_enabled');
    return saved !== 'false'; // Default to true if not set
  });
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Keep track of already shown notification IDs to prevent duplicate browser notifications
  const knownNotificationIds = useRef<Set<number>>(new Set());
  const hasLoadedInitial = useRef(false);

  const unreadCount = isEnabled ? notifications.filter(n => n.isRead === 0).length : 0;

  const toggleNotifications = () => {
    setIsEnabled(prev => {
      const next = !prev;
      localStorage.setItem('notifications_enabled', String(next));
      return next;
    });
  };

  const triggerBrowserNotification = (notif: Notification) => {
    if (!isEnabled) return;
    if (!('Notification' in window)) return;
    if (window.Notification.permission === 'granted') {
      try {
        const bodyContent = notif.message;
        const n = new window.Notification(notif.title, {
          body: bodyContent,
          icon: '/favicon.ico',
        });

        n.onclick = () => {
          window.focus();
          setIsOpen(true);
        };
      } catch (err) {
        console.error('Error showing browser notification:', err);
      }
    }
  };

  const fetchNotifications = async () => {
    if (!currentUser) return;
    // Even if disabled, retrieve them on manual dropdown open/load, 
    // but we can skip background polling when disabled.
    try {
      setLoading(true);
      const todayStr = new Date().toISOString().split('T')[0];
      // Pass localDate to assist backend with timezone-accurate end-of-day checks
      const data = await apiRequest<Notification[]>(
        `/api/notifications?userId=${currentUser.id}&localDate=${todayStr}`
      );
      const fetched = data || [];

      if (hasLoadedInitial.current && isEnabled) {
        // Only trigger browser notifications for new unread notifications that we haven't seen in this session
        fetched.forEach(item => {
          if (item.isRead === 0 && !knownNotificationIds.current.has(item.id)) {
            triggerBrowserNotification(item);
          }
        });
      }

      // Add everything fetched to the known set so we don't trigger them next time
      fetched.forEach(item => knownNotificationIds.current.add(item.id));
      hasLoadedInitial.current = true;
      setNotifications(fetched);
    } catch (error) {
      console.error('Failed to fetch notifications:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if ('Notification' in window) {
      setBrowserPermission(window.Notification.permission);
      // Auto-request permission on mount if it's default
      if (window.Notification.permission === 'default') {
        window.Notification.requestPermission().then(perm => {
          setBrowserPermission(perm);
        });
      }
    }
  }, []);

  const requestBrowserPermission = async () => {
    if (!('Notification' in window)) return;
    const res = await window.Notification.requestPermission();
    setBrowserPermission(res);
  };

  useEffect(() => {
    fetchNotifications();
  }, [currentUser, refreshTrigger]);

  // Read periodically (every 45s) for auto EOD triggers
  useEffect(() => {
    if (!isEnabled) return;
    const interval = setInterval(fetchNotifications, 45000);
    return () => clearInterval(interval);
  }, [currentUser, isEnabled]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleMarkAsRead = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      // Optimistic update
      setNotifications(prev =>
        prev.map(n => n.id === id ? { ...n, isRead: 1 } : n)
      );
      await apiRequest(`/api/notifications/${id}`, 'PUT');
    } catch (error) {
      console.error('Failed to mark notification as read:', error);
      fetchNotifications();
    }
  };

  const handleMarkAllRead = async () => {
    try {
      // Optimistic update
      setNotifications(prev => prev.map(n => ({ ...n, isRead: 1 })));
      await apiRequest(`/api/notifications/read-all?userId=${currentUser.id}`, 'POST');
    } catch (error) {
      console.error('Failed to mark all as read:', error);
      fetchNotifications();
    }
  };

  const handleDeleteNotification = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      // Optimistic update
      setNotifications(prev => prev.filter(n => n.id !== id));
      await apiRequest(`/api/notifications/${id}`, 'DELETE');
    } catch (error) {
      console.error('Failed to delete notification:', error);
      fetchNotifications();
    }
  };

  // Helper to render relative time or standard localized date/time
  const formatTime = (isoString: string) => {
    try {
      const date = new Date(isoString);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffSec = Math.floor(diffMs / 1000);
      const diffMin = Math.floor(diffSec / 60);
      const diffHr = Math.floor(diffMin / 60);
      const diffDay = Math.floor(diffHr / 24);

      if (diffSec < 60) return 'Vừa xong';
      if (diffMin < 60) return `${diffMin} phút trước`;
      if (diffHr < 24) return `${diffHr} giờ trước`;
      if (diffDay < 7) return `${diffDay} ngày trước`;

      return date.toLocaleDateString('vi-VN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return '';
    }
  };

  // Helper to get visual indicator icon & color based on notification type
  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'EOD_WARNING':
        return {
          icon: <AlertCircle className="w-4 h-4 text-rose-500" />,
          bg: 'bg-rose-50 border border-rose-100',
        };
      case 'NEW_TASK':
        return {
          icon: <PlusCircle className="w-4 h-4 text-emerald-500" />,
          bg: 'bg-emerald-50 border border-emerald-100',
        };
      default:
        return {
          icon: <Sparkles className="w-4 h-4 text-blue-500" />,
          bg: 'bg-blue-50 border border-blue-100',
        };
    }
  };

  return (
    <div className="relative inline-block" ref={dropdownRef} id="notification-center-container">
      {/* Bell Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 rounded-full hover:bg-gray-100 text-gray-600 transition-colors focus:outline-none"
        title="Thông báo"
        id="notification-bell-btn"
      >
        <Bell className={`w-5 h-5 ${isOpen ? 'text-blue-600' : ''}`} />
        <AnimatePresence>
          {unreadCount > 0 && (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              className="absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white shadow-sm ring-2 ring-white"
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </motion.span>
          )}
        </AnimatePresence>
      </button>

      {/* Notifications Dropdown Panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.95 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className="absolute right-0 mt-2 w-96 max-w-[calc(100vw-2rem)] bg-white rounded-xl shadow-xl border border-gray-100 z-50 overflow-hidden"
            id="notification-dropdown-panel"
          >
            {/* Dropdown Header */}
            <div className="p-4 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className="font-semibold text-gray-800 text-sm">Thông báo</span>
                {unreadCount > 0 && (
                  <span className="text-[11px] font-bold bg-blue-500 text-white rounded-full px-1.5 py-0.5 leading-none">
                    {unreadCount} mới
                  </span>
                )}
              </div>
              {isEnabled && unreadCount > 0 && (
                <button
                  onClick={handleMarkAllRead}
                  className="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-800 hover:underline transition-colors focus:outline-none"
                >
                  <Check className="w-3.5 h-3.5" />
                  Đã đọc tất cả
                </button>
              )}
            </div>

            {/* In-app Notification Toggle Panel */}
            <div className="px-4 py-2 bg-slate-50/80 border-b border-gray-100 flex items-center justify-between select-none">
              <span className={`text-xs font-semibold transition-colors ${isEnabled ? 'text-gray-700' : 'text-gray-400'}`}>
                {isEnabled ? 'Đang nhận thông báo' : 'Đã tắt nhận thông báo'}
              </span>
              <button
                type="button"
                onClick={toggleNotifications}
                className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-250 ease-in-out focus:outline-none ${
                  isEnabled ? 'bg-blue-600' : 'bg-gray-200'
                }`}
                aria-pressed={isEnabled}
                title={isEnabled ? "Tắt nhận thông báo" : "Bật nhận thông báo"}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-250 ease-in-out ${
                    isEnabled ? 'translate-x-4' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Browser Permission Banner */}
            {isEnabled && browserPermission === 'default' && (
              <div className="bg-blue-50 p-3 border-b border-blue-100 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-blue-500 animate-pulse flex-shrink-0" />
                  <span className="text-[11px] text-blue-800 leading-snug">
                    Bật thông báo để nhận cảnh báo ngay lập tức khi có việc mới hoặc chưa xong!
                  </span>
                </div>
                <button
                  onClick={requestBrowserPermission}
                  className="bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-bold py-1 px-2.5 rounded shadow-sm focus:outline-none flex-shrink-0 transition-colors"
                >
                  Cho phép
                </button>
              </div>
            )}
            {isEnabled && browserPermission === 'denied' && (
              <div className="bg-amber-50 p-2.5 border-b border-amber-100 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                <span className="text-[11px] text-amber-800 leading-tight">
                  Thông báo trình duyệt đang bị chặn. Vui lòng cho phép quyền thông báo trong cài đặt để nhận cảnh báo tức thời.
                </span>
              </div>
            )}

            {/* Notifications List Content */}
            <div className="max-h-96 overflow-y-auto divide-y divide-gray-50" id="notification-items-container">
              {notifications.length === 0 ? (
                <div className="p-8 text-center flex flex-col items-center justify-center text-gray-400 gap-2">
                  <div className="p-3 bg-gray-50 rounded-full text-gray-300">
                    <Bell className="w-6 h-6" />
                  </div>
                  <p className="text-xs font-medium">Hộp thư thông báo của bạn trống</p>
                  <p className="text-[10px] text-gray-400">Bạn sẽ nhận được cảnh báo công việc được giao hoặc hết hạn tại đây.</p>
                </div>
              ) : (
                notifications.map((notification) => {
                  const val = getNotificationIcon(notification.type);
                  return (
                    <div
                      key={notification.id}
                      className={`p-4 flex items-start gap-3 transition-colors ${
                        notification.isRead === 0 ? 'bg-blue-50/20 hover:bg-blue-50/40' : 'hover:bg-gray-50/50'
                      }`}
                    >
                      {/* Left icon badge */}
                      <div className={`p-1.5 rounded-lg flex-shrink-0 ${val.bg}`}>
                        {val.icon}
                      </div>

                      {/* Middle description content */}
                      <div className="flex-grow min-w-0 flex flex-col gap-0.5">
                        <div className="flex items-baseline justify-between gap-1">
                          <span className={`text-xs font-bold text-gray-800 truncate`}>
                            {notification.title}
                          </span>
                          <span className="text-[10px] text-gray-400 flex-shrink-0 whitespace-nowrap">
                            {formatTime(notification.createdAt)}
                          </span>
                        </div>
                        <p className={`text-xs leading-relaxed text-gray-600 ${notification.isRead === 0 ? 'font-medium' : ''}`}>
                          {notification.message}
                        </p>
                      </div>

                      {/* Right actions (Mark Read/Delete) */}
                      <div className="flex flex-col items-center gap-1.5 flex-shrink-0 self-center">
                        {notification.isRead === 0 && (
                          <button
                            onClick={(e) => handleMarkAsRead(notification.id, e)}
                            className="p-1 rounded-full text-blue-500 hover:bg-blue-50 transition-colors focus:outline-none"
                            title="Đánh dấu đã đọc"
                          >
                            <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                          </button>
                        )}
                        <button
                          onClick={(e) => handleDeleteNotification(notification.id, e)}
                          className="p-1 rounded-full text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors focus:outline-none"
                          title="Xóa thông báo"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Dropdown Footer */}
            <div className="p-2 bg-gray-50/50 border-t border-gray-100 text-center">
              <span className="text-[10px] text-gray-400">
                Lịch sử lưu trữ trong vòng 30 ngày qua
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default NotificationCenter;
