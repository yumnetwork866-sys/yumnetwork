import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Bell, Check, Trash2, Calendar, PlusCircle, AlertCircle, Sparkles, X } from 'lucide-react';
import { Notification, User } from '../types';
import { apiRequest } from '../api';

interface NotificationCenterProps {
  currentUser: User;
  refreshTrigger?: number; // Can be updated by parent when a task is added
}

interface ToastNotification {
  id: number;
  notification: Notification;
}

export const NotificationCenter: React.FC<NotificationCenterProps> = ({ currentUser, refreshTrigger }) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [toasts, setToasts] = useState<ToastNotification[]>([]);
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

  const unreadCount = isEnabled ? notifications.filter(n => Number(n.isRead) === 0).length : 0;

  const toggleNotifications = () => {
    setIsEnabled(prev => {
      const next = !prev;
      localStorage.setItem('notifications_enabled', String(next));
      return next;
    });
  };

  // Play a beautiful synthetic notification chime sound using Web Audio API
  const playNotificationSound = () => {
    if (!isEnabled) return;
    try {
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContext) return;
      const ctx = new AudioContext();
      
      // Chime note 1
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      gain1.gain.setValueAtTime(0.15, ctx.currentTime);
      gain1.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
      osc1.start(ctx.currentTime);
      osc1.stop(ctx.currentTime + 0.4);

      // Chime note 2 (harmonized slightly later for professional feel)
      setTimeout(() => {
        try {
          const osc2 = ctx.createOscillator();
          const gain2 = ctx.createGain();
          osc2.connect(gain2);
          gain2.connect(ctx.destination);
          osc2.type = 'sine';
          osc2.frequency.setValueAtTime(880, ctx.currentTime); // A5
          gain2.gain.setValueAtTime(0.15, ctx.currentTime);
          gain2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
          osc2.start(ctx.currentTime);
          osc2.stop(ctx.currentTime + 0.5);
        } catch {}
      }, 120);

    } catch (err) {
      console.warn('Audio Context is blocked or not supported yet: ', err);
    }
  };

  // Keep track of the original title and set up dynamic title flashing if page is hidden
  const titleFlashIntervalRef = useRef<any>(null);
  const originalTitleRef = useRef<string>(document.title || 'Quản lý công việc');

  const startTitleFlashing = (message: string) => {
    if (titleFlashIntervalRef.current) clearInterval(titleFlashIntervalRef.current);
    
    let isOriginal = false;
    titleFlashIntervalRef.current = setInterval(() => {
      document.title = isOriginal 
        ? originalTitleRef.current 
        : `🔔 [Thông báo] ${message.length > 20 ? message.substring(0, 20) + '...' : message}`;
      isOriginal = !isOriginal;
    }, 1200);
  };

  const stopTitleFlashing = () => {
    if (titleFlashIntervalRef.current) {
      clearInterval(titleFlashIntervalRef.current);
      titleFlashIntervalRef.current = null;
    }
    document.title = originalTitleRef.current;
  };

  // Stop title flashing immediately when browser becomes active/focused
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        stopTitleFlashing();
      }
    };
    
    const handleWindowFocus = () => {
      stopTitleFlashing();
      fetchNotifications();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleWindowFocus);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleWindowFocus);
      if (titleFlashIntervalRef.current) clearInterval(titleFlashIntervalRef.current);
    };
  }, [currentUser]); // Add currentUser to dependency array so fetchNotifications has the correct reference if it changes

  const triggerBrowserNotification = (notif: Notification) => {
    if (!isEnabled) return;
    
    // Play chime sound immediately
    playNotificationSound();

    // Flash tab title if page is in background
    if (document.hidden) {
      startTitleFlashing(notif.message || notif.title);
    }

    // Trigger floating in-app Toast notification for visual delight
    if (hasLoadedInitial.current) {
      const toastId = notif.id;
      setToasts(prev => {
        // Prevent duplicate toasts
        if (prev.some(t => t.id === toastId)) return prev;
        return [...prev, { id: toastId, notification: notif }];
      });
      // Auto-remove toast after 8 seconds
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== toastId));
      }, 8000);
    }

    if (!('Notification' in window)) return;
    if (window.Notification.permission === 'granted') {
      try {
        const bodyContent = notif.message;
        // Aesthetic professional image URLs
        const customIcon = (notif.type === 'EOD_WARNING' || notif.type === 'EOD_WARNING_DAILY')
          ? 'https://cdn-icons-png.flaticon.com/512/564/564619.png' // Alert triangle
          : notif.type === 'LEADER_WARNING_DAILY'
            ? 'https://cdn-icons-png.flaticon.com/512/3094/3094833.png' // Chart/Calendar reporting icon
            : 'https://cdn-icons-png.flaticon.com/512/9063/9063196.png'; // Task list checklist
          
        const n = new window.Notification(notif.title, {
          body: bodyContent,
          icon: customIcon,
          badge: customIcon,
          tag: `task-${notif.taskId || notif.id}`, // groups or prevents redundant popups
          requireInteraction: true // keeps banner open until actioned
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
      const localHour = new Date().getHours();
      // Pass localDate and localHour to assist backend with timezone-accurate end-of-day checks
      const data = await apiRequest<Notification[]>(
        `/api/notifications?userId=${currentUser.id}&localDate=${todayStr}&localHour=${localHour}`
      );
      const fetched = data || [];

      if (hasLoadedInitial.current && isEnabled) {
        // Only trigger browser notifications for new unread notifications that we haven't seen in this session
        fetched.forEach(item => {
          if (Number(item.isRead) === 0 && !knownNotificationIds.current.has(item.id)) {
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

  const isInsideIframe = () => {
    try {
      return window.self !== window.top;
    } catch (e) {
      return true;
    }
  };

  useEffect(() => {
    if ('Notification' in window) {
      setBrowserPermission(window.Notification.permission);
      // Auto-request permission on mount if it's default and not inside iframe
      if (window.Notification.permission === 'default' && !isInsideIframe()) {
        try {
          window.Notification.requestPermission().then(perm => {
            setBrowserPermission(perm);
          });
        } catch (e) {
          console.warn('Auto Notification request blocked:', e);
        }
      }
    }
  }, []);

  const requestBrowserPermission = async () => {
    if (!('Notification' in window)) return;
    try {
      let res: NotificationPermission;
      if (typeof window.Notification.requestPermission === 'function') {
        res = await window.Notification.requestPermission();
      } else {
        res = await new Promise<NotificationPermission>((resolve) => {
          (window.Notification as any).requestPermission((permission: NotificationPermission) => resolve(permission));
        });
      }
      setBrowserPermission(res);
      
      if (res === 'granted') {
        // Trigger a nice success system notification to verify it's working
        try {
          const n = new window.Notification('🔔 Đã bật thông báo thành công!', {
            body: 'Bạn sẽ nhận được cảnh báo góc màn hình ngay cả khi đang làm việc ở tab khác.',
            icon: 'https://cdn-icons-png.flaticon.com/512/9063/9063196.png'
          });
          n.onclick = () => {
            window.focus();
          };
        } catch (e) {
          console.warn('Could not fire welcome notification:', e);
        }
      }
    } catch (err) {
      console.warn('User interaction gesture required or iframe blocks permissions:', err);
    }
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

  const simulateEodCheck = async () => {
    if (!currentUser) return;
    try {
      setLoading(true);
      const todayStr = new Date().toISOString().split('T')[0];
      // Trigger EOD checks by mocking the time as 17:00 and appending the simulation flag
      const data = await apiRequest<Notification[]>(
        `/api/notifications?userId=${currentUser.id}&localDate=${todayStr}&localHour=17&testEod=true`
      );
      const fetched = data || [];
      if (fetched.length > 0) {
        // Trigger browser notification for any new ones
        fetched.forEach(item => {
          if (Number(item.isRead) === 0 && !knownNotificationIds.current.has(item.id)) {
            triggerBrowserNotification(item);
          }
        });
        fetched.forEach(item => knownNotificationIds.current.add(item.id));
        setNotifications(fetched);
      }
    } catch (err) {
      console.error('Error simulating EOD check:', err);
    } finally {
      setLoading(false);
    }
  };

  // Helper to get visual indicator icon & color based on notification type
  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'EOD_WARNING':
      case 'EOD_WARNING_DAILY':
        return {
          icon: <AlertCircle className="w-4 h-4 text-rose-500 animate-pulse" />,
          bg: 'bg-rose-50 border border-rose-100',
        };
      case 'LEADER_WARNING_DAILY':
        return {
          icon: <Calendar className="w-4 h-4 text-amber-500 animate-bounce" />,
          bg: 'bg-amber-50 border border-amber-100',
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
              <div className="flex items-center gap-2">
                {(currentUser.role === 'leader' || currentUser.role === 'admin') && (
                  <button
                    onClick={simulateEodCheck}
                    className="text-[10px] bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 rounded px-1.5 py-0.5 font-bold transition-all flex items-center gap-0.5 cursor-pointer"
                    title="Giả lập báo cáo chậm tiến độ 17h chiều để kiểm tra"
                  >
                    ⚡ Thử 17h
                  </button>
                )}
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
            {isEnabled && isInsideIframe() && (
              <div className="bg-blue-50/80 p-3.5 border-b border-blue-100/60 flex flex-col gap-2">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
                  <p className="text-[11px] text-blue-800 leading-normal font-medium">
                    Bạn đang xem thử phần mềm trong Frame của AI Studio. Để nhận thông báo đẩy <strong>nổi ngoài màn hình</strong> ngay cả khi làm việc ở ứng dụng khác:
                  </p>
                </div>
                <ol className="text-[10px] text-blue-800 list-decimal list-inside pl-1 space-y-1 bg-white/50 p-2 rounded border border-blue-100 font-semibold selection:bg-blue-200">
                  <li>Hãy bấm nút <strong className="text-blue-700">"Mở Tab Mới"</strong> trên thanh công cụ của AI Studio phía trên để mở rộng ứng dụng.</li>
                  <li>Nhấp vào biểu tượng chuông rồi bấm <strong className="text-blue-700">"Cho phép thông báo"</strong>!</li>
                </ol>
              </div>
            )}

            {isEnabled && !isInsideIframe() && browserPermission === 'default' && (
              <div className="bg-blue-50 p-3 border-b border-blue-100 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-blue-500 animate-pulse flex-shrink-0" />
                  <span className="text-[11px] text-blue-800 leading-snug">
                    Bật thông báo đẩy để nhận cảnh báo ngay lập tức trên góc màn hình khi có việc mới!
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
            
            {isEnabled && !isInsideIframe() && browserPermission === 'denied' && (
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
                      onClick={(e) => {
                        if (Number(notification.isRead) === 0) {
                          handleMarkAsRead(notification.id, e);
                        }
                      }}
                      className={`p-4 flex items-start gap-3 transition-colors select-none ${
                        Number(notification.isRead) === 0 
                          ? 'bg-blue-50/20 hover:bg-blue-50/40 cursor-pointer' 
                          : 'hover:bg-gray-50/50'
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
                        <p className={`text-xs leading-relaxed text-gray-600 whitespace-pre-line ${Number(notification.isRead) === 0 ? 'font-medium' : ''}`}>
                          {notification.message}
                        </p>
                      </div>

                      {/* Right actions (Mark Read/Delete) */}
                      <div className="flex flex-col items-center gap-1.5 flex-shrink-0 self-center">
                        {Number(notification.isRead) === 0 && (
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
              <span className="text-[10px] text-gray-400 font-medium">
                Lịch sử lưu trữ trong vòng 30 ngày qua
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating Gorgeous In-App Toast HUDs Container */}
      <div className="fixed top-24 right-4 z-[9999] flex flex-col gap-3 pointer-events-none max-w-sm w-full px-4 sm:px-0">
        <AnimatePresence>
          {toasts.map((toast) => {
            const isEod = toast.notification.type === 'EOD_WARNING' || toast.notification.type === 'EOD_WARNING_DAILY';
            const isLeader = toast.notification.type === 'LEADER_WARNING_DAILY';
            const isNew = toast.notification.type === 'NEW_TASK';
            
            // Premium gradients and configurations matching the modern clean brand style
            const accentColor = isEod 
              ? 'from-rose-500 to-red-650' 
              : isLeader 
                ? 'from-amber-400 to-orange-550'
                : isNew 
                  ? 'from-emerald-400 to-teal-600' 
                  : 'from-blue-500 to-indigo-650';
                
            const cardBg = 'bg-slate-900/95 backdrop-blur-xl border border-slate-800/80 text-white shadow-[0_20px_50px_-12px_rgba(0,0,0,0.35)]';
            const titleColor = 'text-white font-bold';
            const msgColor = 'text-slate-200';
            const badgeIconBg = isEod 
              ? 'bg-rose-500/10 border border-rose-500/20 text-rose-400' 
              : isLeader
                ? 'bg-amber-500/10 border border-amber-500/20 text-amber-500'
                : isNew 
                  ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400' 
                  : 'bg-blue-500/10 border border-blue-500/20 text-blue-400';

            return (
              <motion.div
                key={toast.id}
                initial={{ opacity: 0, x: 280, scale: 0.9, y: -10 }}
                animate={{ 
                  opacity: 1, 
                  x: 0, 
                  scale: 1, 
                  y: 0,
                  transition: { type: 'spring', stiffness: 380, damping: 25 }
                }}
                exit={{ 
                  opacity: 0, 
                  scale: 0.9, 
                  x: 150, 
                  transition: { duration: 0.22, ease: 'easeIn' } 
                }}
                className={`pointer-events-auto rounded-2xl p-4 flex gap-4 items-start relative overflow-hidden group transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer ring-1 ring-white/10 select-none ${cardBg}`}
                onClick={() => {
                  setIsOpen(true);
                  setToasts(prev => prev.filter(t => t.id !== toast.id));
                }}
              >
                {/* Brand glowing accent side line */}
                <div className={`absolute top-0 left-0 bottom-0 w-1.5 bg-gradient-to-b ${accentColor}`} />
                
                {/* Premium visual badge icon */}
                <div className={`p-2.5 rounded-xl flex-shrink-0 flex items-center justify-center ${badgeIconBg}`}>
                  {isEod ? (
                    <AlertCircle className="w-4 h-4 animate-pulse" />
                  ) : isLeader ? (
                    <Calendar className="w-4 h-4 animate-bounce" />
                  ) : isNew ? (
                    <PlusCircle className="w-4 h-4" />
                  ) : (
                    <Sparkles className="w-4 h-4 text-sky-400" />
                  )}
                </div>
                
                {/* Notification body details with typography layout spacing */}
                <div className="flex-grow min-w-0 pr-5">
                  <h4 className={`text-xs leading-normal mb-1 flex items-center gap-2 ${titleColor}`}>
                    {toast.notification.title}
                    <span className="flex h-2 w-2 relative">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-sky-500"></span>
                    </span>
                  </h4>
                  <p className={`text-xs leading-relaxed ${msgColor} font-medium whitespace-pre-line`}>
                    {toast.notification.message}
                  </p>
                  <span className="text-[10px] font-bold mt-2 pb-0.5 block text-sky-400 tracking-wider uppercase opacity-90 group-hover:opacity-100 transition-opacity">
                    Nhấp để mở chi tiết • Vừa mới nhận
                  </span>
                </div>

                {/* Dismiss X button */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setToasts(prev => prev.filter(t => t.id !== toast.id));
                  }}
                  className="text-slate-400 hover:text-white p-1 rounded-full hover:bg-white/10 transition-colors focus:outline-none flex-shrink-0 self-start -mt-1 -mr-1"
                  title="Đóng thông báo"
                >
                  <X className="w-4 h-4" />
                </button>

                {/* Remaining-time Progress Bar at the absolute base */}
                <div className="absolute bottom-0 left-1.5 right-0 h-[3.5px] bg-white/5 overflow-hidden">
                  <motion.div
                    initial={{ width: "100%" }}
                    animate={{ width: "0%" }}
                    transition={{ duration: 8, ease: "linear" }}
                    className={`h-full bg-gradient-to-r ${accentColor}`}
                  />
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default NotificationCenter;
