// functions/api/tasks/[[path]].ts

import type { PagesFunction } from '@cloudflare/workers-types/pages';
import type { Env } from '../../env';

enum Status {
  Completed = 'Hoàn thành',
  InProgress = 'Đang tiến độ',
  Pending = 'Đang chờ',
  NotStarted = 'Chưa bắt đầu',
}

enum Priority {
  High = 'Cao',
  Medium = 'Trung bình',
  Low = 'Thấp',
}

interface Task {
  id: number;
  name: string;
  deadline: string;
  groupId: number;
  assigneeId: number;
  priority: Priority;
  status: Status;
  notes: string;
}

const ensureTasksTableReferencesUsers = async (env: Env) => {
    try {
        const tasksSchemaStmt = env.DB.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='tasks'");
        const schemaResult = await tasksSchemaStmt.first<{ sql: string }>();
        const sql = schemaResult?.sql || "";
        
        // If the table schema contains references to users_old, migrate it
        if (sql && sql.toLowerCase().includes("users_old")) {
            console.log("Migrating 'tasks' table to remove 'users_old' reference. Current schema: ", sql);
            
            // 1. Rename existing tasks table to tasks_old
            await env.DB.prepare("ALTER TABLE tasks RENAME TO tasks_old").run();
            
            // 2. Create the new tasks table with correct foreign key constraint to users table
            await env.DB.prepare(`
                CREATE TABLE tasks (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    deadline TEXT NOT NULL,
                    groupId INTEGER,
                    assigneeId INTEGER,
                    priority TEXT NOT NULL,
                    status TEXT NOT NULL,
                    notes TEXT,
                    FOREIGN KEY(groupId) REFERENCES groups(id) ON DELETE SET NULL,
                    FOREIGN KEY(assigneeId) REFERENCES users(id) ON DELETE SET NULL
                )
            `).run();
            
            // 3. Re-populate data from tasks_old to the new structure
            await env.DB.prepare(`
                INSERT INTO tasks (id, name, deadline, groupId, assigneeId, priority, status, notes)
                SELECT id, name, deadline, groupId, assigneeId, priority, status, notes FROM tasks_old
            `).run();
            
            // 4. Clean up temp table
            await env.DB.prepare("DROP TABLE tasks_old").run();
            console.log("Successfully migrated 'tasks' table structure to reference 'users' correctly.");
        }
    } catch (error: any) {
        console.error("Failed to run 'users_old' reference check/migration on tasks table:", error);
    }
};

const handleRequest = async (request: Request, env: Env, id: string | undefined) => {
    // Run self-mending database migration check to ensure 'tasks' references correct 'users' table
    await ensureTasksTableReferencesUsers(env);

    switch (request.method) {
        case 'GET': {
             const stmt = env.DB.prepare('SELECT * FROM tasks ORDER BY deadline DESC, id DESC');
             const { results: tasks } = await stmt.all<Task>();
             
             // Setup subtasks table if not exists, and fetch all subtasks
             let subtasks: any[] = [];
             try {
                 await env.DB.prepare(`
                     CREATE TABLE IF NOT EXISTS subtasks (
                         id INTEGER PRIMARY KEY AUTOINCREMENT,
                         taskId INTEGER NOT NULL,
                         name TEXT NOT NULL,
                         isCompleted INTEGER DEFAULT 0,
                         FOREIGN KEY(taskId) REFERENCES tasks(id) ON DELETE CASCADE
                     )
                 `).run();
                 
                 const subStmt = env.DB.prepare('SELECT * FROM subtasks ORDER BY id ASC');
                 const { results } = await subStmt.all<any>();
                 subtasks = results || [];
             } catch (e) {
                 console.error("No subtasks table or failed to fetch subtasks:", e);
             }

             const tasksWithSubtasks = tasks.map(task => {
                 const taskSubtasks = subtasks
                     .filter(sub => sub.taskId === task.id)
                     .map(sub => ({
                         id: sub.id,
                         taskId: sub.taskId,
                         name: sub.name,
                         isCompleted: sub.isCompleted === 1
                     }));
                 return {
                     ...task,
                     subtasks: taskSubtasks
                 };
             });

             return new Response(JSON.stringify(tasksWithSubtasks), {
                 headers: { 'Content-Type': 'application/json' },
             });
        }
        case 'POST': {
            const body = await request.json();

            // Ensure notifications table exists
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
            } catch (err) {
                console.error("Failed to precheck notifications table: ", err);
            }

            if (Array.isArray(body)) {
                // Bulk insert
                const newTasks: Omit<Task, 'id'>[] = body;
                if (newTasks.length === 0) {
                    return new Response('Bad Request: Empty array for bulk insert', { status: 400 });
                }

                const statements = newTasks.map(task => 
                    env.DB.prepare('INSERT INTO tasks (name, deadline, groupId, assigneeId, priority, status, notes) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING *')
                        .bind(task.name, task.deadline, task.groupId, task.assigneeId, task.priority, task.status, task.notes)
                );
                
                const results = await env.DB.batch<Task>(statements);
                const insertedTasks = results.map(r => r.results?.[0]).filter(Boolean);

                // Auto-create notification for assignees
                try {
                    const createdAt = new Date().toISOString();
                    const notifStatements = insertedTasks.map(task => {
                        if (!task.assigneeId) return null;
                        return env.DB.prepare(`
                            INSERT INTO notifications (userId, type, title, message, isRead, taskId, createdAt)
                            VALUES (?, 'NEW_TASK', 'Công việc mới được giao', ?, 0, ?, ?)
                        `).bind(
                            task.assigneeId,
                            `Bạn đã được giao công việc: "${task.name}" (Hạn chót: ${task.deadline})`,
                            task.id,
                            createdAt
                        );
                    }).filter(Boolean);

                    if (notifStatements.length > 0) {
                        await env.DB.batch(notifStatements as any);
                    }
                } catch (notifErr) {
                    console.error("Failed to trigger bulk notifications:", notifErr);
                }

                return new Response(JSON.stringify(insertedTasks), {
                    status: 201,
                    headers: { 'Content-Type': 'application/json' },
                });

            } else {
                // Single insert
                // FIX: Add a type assertion to correctly type the request body for a single task insert.
                const newTask = body as Omit<Task, 'id'>;
                const stmt = env.DB.prepare('INSERT INTO tasks (name, deadline, groupId, assigneeId, priority, status, notes) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING *')
                    .bind(
                        newTask.name, 
                        newTask.deadline, 
                        newTask.groupId, 
                        newTask.assigneeId, 
                        newTask.priority, 
                        newTask.status, 
                        newTask.notes
                    );
                const result = await stmt.first<Task>();

                // Auto-create notification for assignee
                if (result && result.assigneeId) {
                    try {
                        const createdAt = new Date().toISOString();
                        await env.DB.prepare(`
                            INSERT INTO notifications (userId, type, title, message, isRead, taskId, createdAt)
                            VALUES (?, 'NEW_TASK', 'Công việc mới được giao', ?, 0, ?, ?)
                        `).bind(
                            result.assigneeId,
                            `Bạn đã được giao công việc: "${result.name}" (Hạn chót: ${result.deadline})`,
                            result.id,
                            createdAt
                        ).run();
                    } catch (notifErr) {
                        console.error("Failed to trigger task notification:", notifErr);
                    }
                }

                return new Response(JSON.stringify(result), {
                    status: 201,
                    headers: { 'Content-Type': 'application/json' },
                });
            }
        }
        case 'PUT': {
            if (!id) return new Response('Bad Request: Missing ID', { status: 400 });
            const updatedTask: Task = await request.json();
            const stmt = env.DB.prepare('UPDATE tasks SET name = ?, deadline = ?, groupId = ?, assigneeId = ?, priority = ?, status = ?, notes = ? WHERE id = ? RETURNING *')
                .bind(
                    updatedTask.name, 
                    updatedTask.deadline, 
                    updatedTask.groupId, 
                    updatedTask.assigneeId, 
                    updatedTask.priority, 
                    updatedTask.status, 
                    updatedTask.notes, 
                    id
                );
            const result = await stmt.first<Task>();
            return new Response(JSON.stringify(result), {
                headers: { 'Content-Type': 'application/json' },
            });
        }
        case 'DELETE': {
            if (id) {
                // Single delete
                await env.DB.prepare('DELETE FROM tasks WHERE id = ?').bind(id).run();
                return new Response(null, { status: 204 });
            } else {
                // Bulk delete
                const { ids } = await request.json() as { ids: number[] };
                if (!Array.isArray(ids) || ids.length === 0) {
                    return new Response('Bad Request: "ids" must be a non-empty array', { status: 400 });
                }
                const placeholders = ids.map(() => '?').join(',');
                const stmt = env.DB.prepare(`DELETE FROM tasks WHERE id IN (${placeholders})`).bind(...ids);
                await stmt.run();
                return new Response(null, { status: 204 });
            }
        }
        default:
            return new Response('Method Not Allowed', { status: 405 });
    }
}

export const onRequest: PagesFunction = async (context) => {
    const { request, params, env } = context;
    const id = params.path?.[0];

    try {
        return await handleRequest(request, env as Env, id);
    } catch (e: any) {
        console.error('Task API Error:', e.message);
        return new Response(e.message, { status: 500 });
    }
};