// functions/api/notifications/[[path]].ts

import type { PagesFunction } from '@cloudflare/workers-types/pages';
import type { Env } from '../../env';

interface Notification {
  id: number;
  userId: number;
  type: string; // 'NEW_TASK', 'EOD_WARNING'
  title: string;
  message: string;
  isRead: number; // 0 or 1
  taskId: number | null;
  createdAt: string;
}

interface Task {
  id: number;
  name: string;
  deadline: string;
  groupId: number;
  assigneeId: number;
  priority: string;
  status: string;
  notes: string;
}

const ensureNotificationsTableExists = async (env: Env) => {
    try {
        await env.DB.prepare(`
            CREATE TABLE IF NOT EXISTS notifications (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                userId INTEGER NOT NULL,
                type TEXT NOT NULL,
                title TEXT NOT NULL,
                message TEXT NOT NULL,
                isRead INTEGER DEFAULT 0,
                taskId INTEGER,
                createdAt TEXT NOT NULL,
                FOREIGN KEY(userId) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY(taskId) REFERENCES tasks(id) ON DELETE CASCADE
            )
        `).run();
    } catch (error: any) {
        console.error("Failed to create notifications table:", error);
    }
};

const handleRequest = async (request: Request, env: Env, pathId: string | undefined) => {
    await ensureNotificationsTableExists(env);

    const url = new URL(request.url);
    const userIdStr = url.searchParams.get('userId');
    const userId = userIdStr ? parseInt(userIdStr, 10) : null;

    // 1. Auto-clean old read notifications (> 30 days)
    try {
        await env.DB.prepare(`
            DELETE FROM notifications 
            WHERE isRead = 1 
              AND datetime(createdAt) < datetime('now', '-30 days')
        `).run();
    } catch (error) {
        console.error("Failed to auto-clean old notifications:", error);
    }

    switch (request.method) {
        case 'GET': {
            if (!userId) {
                return new Response('Bad Request: Missing userId parameter', { status: 400 });
            }

            const localDate = url.searchParams.get('localDate') || new Date().toISOString().split('T')[0];
            const localHourStr = url.searchParams.get('localHour');
            const localHour = localHourStr ? parseInt(localHourStr, 10) : null;
            const testEod = url.searchParams.get('testEod');

            // 2. Trigger dynamically EOD Warnings (Hạn chót & chưa hoàn thành)
            try {
                // Fetch incomplete tasks for this user whose deadline <= today
                const incompleteTasksStmt = env.DB.prepare(`
                    SELECT * FROM tasks 
                    WHERE assigneeId = ? 
                      AND status != 'Hoàn thành' 
                      AND deadline <= ?
                `).bind(userId, localDate);
                const { results: tasks } = await incompleteTasksStmt.all<Task>();

                if (tasks && tasks.length > 0) {
                    // Check existing warnings for these tasks
                    for (const task of tasks) {
                        const existingWarningStmt = env.DB.prepare(`
                            SELECT id FROM notifications 
                            WHERE userId = ? 
                              AND taskId = ? 
                              AND type = 'EOD_WARNING'
                        `).bind(userId, task.id);
                        
                        const existing = await existingWarningStmt.first();
                        
                        if (!existing) {
                            // Insert a dynamic warn notification
                            const title = 'Cảnh báo hạn chót';
                            const message = `Công việc "${task.name}" chưa hoàn thành (Hạn chót: ${task.deadline}). Vui lòng kiểm tra lại!`;
                            const createdAt = new Date().toISOString();

                            await env.DB.prepare(`
                                INSERT INTO notifications (userId, type, title, message, isRead, taskId, createdAt)
                                VALUES (?, 'EOD_WARNING', ?, ?, 0, ?, ?)
                            `).bind(userId, title, message, task.id, createdAt).run();
                        }
                    }
                }
            } catch (err) {
                console.error("Failed to check or insert EOD warnings:", err);
            }

            // 2b. Trigger daily 5:00 PM alerts for members and leaders
            let hourCheck = localHour;
            let datePattern = `${localDate}%`;
            
            if (testEod === 'true') {
                hourCheck = 17;
                // For simulated testing, use a pattern that won't match existing real daily notifications
                datePattern = `${localDate}-test-never-match%`;
            }

            if (hourCheck !== null && hourCheck >= 17) {
                try {
                    // Fetch user info first
                    const userStmt = env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(userId);
                    const user = await userStmt.first<any>();

                    if (user) {
                        // A. Check and trigger 'EOD_WARNING_DAILY' for current user if they have slow/incomplete tasks
                        const existingDailyStmt = env.DB.prepare(`
                            SELECT id FROM notifications 
                            WHERE userId = ? 
                              AND type = 'EOD_WARNING_DAILY' 
                              AND createdAt LIKE ?
                        `).bind(userId, datePattern);
                        const existingDaily = await existingDailyStmt.first();

                        if (!existingDaily) {
                            const incompleteStmt = env.DB.prepare(`
                                SELECT * FROM tasks 
                                WHERE assigneeId = ? 
                                  AND status != 'Hoàn thành' 
                                  AND deadline <= ?
                            `).bind(userId, localDate);
                            const { results: myTasks } = await incompleteStmt.all<any>();

                            if (myTasks && myTasks.length > 0) {
                                const title = '⏰ Cảnh báo hạn chót (5h chiều)';
                                const taskNamesStr = myTasks.map((t: any) => `"${t.name}"`).join(', ');
                                const message = `Bạn hiện có ${myTasks.length} công việc chưa hoàn thành hôm nay: ${taskNamesStr}. Vui lòng tập trung hoàn thành sớm!`;
                                const createdAt = new Date().toISOString();

                                await env.DB.prepare(`
                                    INSERT INTO notifications (userId, type, title, message, isRead, taskId, createdAt)
                                    VALUES (?, 'EOD_WARNING_DAILY', ?, ?, 0, NULL, ?)
                                `).bind(userId, title, message, createdAt).run();
                            }
                        }

                        // B. Check and trigger 'LEADER_WARNING_DAILY' if the user is a leader or admin
                        if (user.role === 'leader' || user.role === 'admin') {
                            const existingLeaderDailyStmt = env.DB.prepare(`
                                SELECT id FROM notifications 
                                WHERE userId = ? 
                                  AND type = 'LEADER_WARNING_DAILY' 
                                  AND createdAt LIKE ?
                        `).bind(userId, datePattern);
                            const existingLeaderDaily = await existingLeaderDailyStmt.first();

                            if (!existingLeaderDaily) {
                                // Gather managed group IDs
                                let groupIds: number[] = [];
                                if (user.groupId !== null && user.groupId !== undefined) {
                                    groupIds.push(Number(user.groupId));
                                }
                                if (typeof user.managedGroupIds === 'string' && user.managedGroupIds.trim() !== '') {
                                    try {
                                        const parsed: number[] = JSON.parse(user.managedGroupIds);
                                        if (Array.isArray(parsed)) {
                                            parsed.forEach(id => {
                                                if (id !== null && !groupIds.includes(Number(id))) {
                                                    groupIds.push(Number(id));
                                                }
                                            });
                                        }
                                    } catch (err) {
                                        console.error("Failed to parse leader managedGroupIds:", err);
                                    }
                                }

                                if (groupIds.length > 0) {
                                    const placeholders = groupIds.map(() => '?').join(',');
                                    const leaderQuery = `
                                        SELECT tasks.*, users.name as assigneeName 
                                        FROM tasks 
                                        LEFT JOIN users ON tasks.assigneeId = users.id 
                                        WHERE tasks.groupId IN (${placeholders}) 
                                          AND tasks.status != 'Hoàn thành' 
                                          AND tasks.deadline <= ?
                                    `;
                                    
                                    const bindParams = [...groupIds, localDate];
                                    const { results: teamPendingTasks } = await env.DB.prepare(leaderQuery).bind(...bindParams).all<any>();

                                    if (teamPendingTasks && teamPendingTasks.length > 0) {
                                        // Group tasks by assignee name
                                        const groupedByAssignee: { [key: string]: string[] } = {};
                                        teamPendingTasks.forEach((task: any) => {
                                            const name = task.assigneeName || 'Chưa phân công';
                                            if (!groupedByAssignee[name]) {
                                                groupedByAssignee[name] = [];
                                            }
                                            groupedByAssignee[name].push(`"${task.name}" (Hạn: ${task.deadline})`);
                                        });

                                        const delayDetails = Object.entries(groupedByAssignee)
                                            .map(([name, tasks]) => `- ${name}: ${tasks.join(', ')}`)
                                            .join('\n');

                                        const title = '📊 Báo cáo chậm tiến độ (5h chiều)';
                                        const message = `Báo cáo nhóm: Có ${teamPendingTasks.length} công việc chưa hoàn thành trễ hạn ngày hôm nay:\n${delayDetails}\nVui lòng kiểm tra và hỗ trợ thành viên kịp thời!`;
                                        const createdAt = new Date().toISOString();

                                        await env.DB.prepare(`
                                            INSERT INTO notifications (userId, type, title, message, isRead, taskId, createdAt)
                                            VALUES (?, 'LEADER_WARNING_DAILY', ?, ?, 0, NULL, ?)
                                        `).bind(userId, title, message, createdAt).run();
                                    }
                                }
                            }
                        }
                    }
                } catch (err: any) {
                    console.error("Failed to run 17:00 EOD notifications check:", err.message);
                }
            }

            // 3. Fetch notifications for user
            const fetchStmt = env.DB.prepare(`
                SELECT * FROM notifications 
                WHERE userId = ? 
                ORDER BY createdAt DESC, id DESC
            `).bind(userId);
            const { results: notifications } = await fetchStmt.all<Notification>();

            return new Response(JSON.stringify(notifications || []), {
                headers: { 'Content-Type': 'application/json' },
            });
        }

        case 'POST': {
            let body: any = {};
            try {
                const text = await request.text();
                if (text) {
                    body = JSON.parse(text);
                }
            } catch (err) {
                console.warn('Failed to parse request JSON or body is empty:', err);
            }

            // Mark all as read
            if (pathId === 'read-all') {
                if (!userId) {
                    return new Response('Bad Request: Missing userId in query', { status: 400 });
                }
                await env.DB.prepare('UPDATE notifications SET isRead = 1 WHERE userId = ?')
                    .bind(userId)
                    .run();

                return new Response(JSON.stringify({ success: true }), {
                    headers: { 'Content-Type': 'application/json' }
                });
            }

            // Create notification manually
            const { targetUserId, type, title, message, taskId } = body;
            if (!targetUserId || !type || !title || !message) {
                return new Response('Bad Request: Missing required fields', { status: 400 });
            }

            const createdAt = new Date().toISOString();
            const stmt = env.DB.prepare(`
                INSERT INTO notifications (userId, type, title, message, isRead, taskId, createdAt)
                VALUES (?, ?, ?, ?, 0, ?, ?)
                RETURNING *
            `).bind(targetUserId, type, title, message, taskId || null, createdAt);

            const result = await stmt.first<Notification>();
            return new Response(JSON.stringify(result), {
                status: 201,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        case 'PUT': {
            if (!pathId) {
                return new Response('Bad Request: Missing notification ID', { status: 400 });
            }

            // Mark single notification as read
            const stmt = env.DB.prepare('UPDATE notifications SET isRead = 1 WHERE id = ? RETURNING *')
                .bind(parseInt(pathId, 10));
            const result = await stmt.first<Notification>();

            if (!result) {
                return new Response('Not Found', { status: 404 });
            }

            return new Response(JSON.stringify(result), {
                headers: { 'Content-Type': 'application/json' },
            });
        }

        case 'DELETE': {
            if (pathId) {
                // Delete single
                await env.DB.prepare('DELETE FROM notifications WHERE id = ?').bind(parseInt(pathId, 10)).run();
                return new Response(null, { status: 204 });
            } else {
                return new Response('Bad Request: Missing ID', { status: 400 });
            }
        }

        default:
            return new Response('Method Not Allowed', { status: 405 });
    }
};

export const onRequest: PagesFunction = async (context) => {
    const { request, params, env } = context;
    const pathId = params.path?.[0];

    try {
        return await handleRequest(request, env as Env, pathId);
    } catch (e: any) {
        console.error('Notification API Error:', e.message);
        return new Response(e.message, { status: 500 });
    }
};
