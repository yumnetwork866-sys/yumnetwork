// functions/api/subtasks/[[path]].ts

import type { PagesFunction } from '@cloudflare/workers-types/pages';
import type { Env } from '../../env';

interface Subtask {
  id: number;
  taskId: number;
  name: string;
  isCompleted: number;
}

const ensureSubtasksTableExists = async (env: Env) => {
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
    } catch (error: any) {
        console.error("Failed to run 'subtasks' table setup:", error);
    }
};

const handleRequest = async (request: Request, env: Env, id: string | undefined) => {
    await ensureSubtasksTableExists(env);

    switch (request.method) {
        case 'GET': {
            const url = new URL(request.url);
            const taskId = url.searchParams.get('taskId');
            
            if (taskId) {
                const stmt = env.DB.prepare('SELECT * FROM subtasks WHERE taskId = ? ORDER BY id ASC');
                const { results } = await stmt.bind(taskId).all<Subtask>();
                return new Response(JSON.stringify(results.map(r => ({ ...r, isCompleted: r.isCompleted === 1 }))), {
                    headers: { 'Content-Type': 'application/json' },
                });
            } else {
                const stmt = env.DB.prepare('SELECT * FROM subtasks ORDER BY id ASC');
                const { results } = await stmt.all<Subtask>();
                return new Response(JSON.stringify(results.map(r => ({ ...r, isCompleted: r.isCompleted === 1 }))), {
                    headers: { 'Content-Type': 'application/json' },
                });
            }
        }
        case 'POST': {
            const body: { taskId: number; name: string; isCompleted?: boolean } = await request.json();
            if (!body.taskId || !body.name) {
                return new Response('Bad Request: Missing taskId or name', { status: 400 });
            }
            
            const isCompletedNumeric = body.isCompleted ? 1 : 0;
            const stmt = env.DB.prepare('INSERT INTO subtasks (taskId, name, isCompleted) VALUES (?, ?, ?) RETURNING *')
                .bind(body.taskId, body.name, isCompletedNumeric);
            
            const result = await stmt.first<Subtask>();
            if (!result) {
                return new Response('Database Error: Failed to insert subtask', { status: 500 });
            }
            
            return new Response(JSON.stringify({ ...result, isCompleted: result.isCompleted === 1 }), {
                status: 201,
                headers: { 'Content-Type': 'application/json' },
            });
        }
        case 'PUT': {
            if (!id) return new Response('Bad Request: Missing ID', { status: 400 });
            const body: { name?: string; isCompleted?: boolean } = await request.json();
            
            // Get existing subtask first to merge values if keys are missing
            const checkStmt = env.DB.prepare('SELECT * FROM subtasks WHERE id = ?').bind(id);
            const existing = await checkStmt.first<Subtask>();
            if (!existing) {
                return new Response('Not Found: Subtask does not exist', { status: 404 });
            }

            const newName = body.name !== undefined ? body.name : existing.name;
            const newIsCompleted = body.isCompleted !== undefined ? (body.isCompleted ? 1 : 0) : existing.isCompleted;

            const stmt = env.DB.prepare('UPDATE subtasks SET name = ?, isCompleted = ? WHERE id = ? RETURNING *')
                .bind(newName, newIsCompleted, id);
            
            const result = await stmt.first<Subtask>();
            if (!result) {
                return new Response('Database Error: Failed to update subtask', { status: 500 });
            }
            
            return new Response(JSON.stringify({ ...result, isCompleted: result.isCompleted === 1 }), {
                headers: { 'Content-Type': 'application/json' },
            });
        }
        case 'DELETE': {
            if (!id) return new Response('Bad Request: Missing ID', { status: 400 });
            await env.DB.prepare('DELETE FROM subtasks WHERE id = ?').bind(id).run();
            return new Response(null, { status: 204 });
        }
        default:
            return new Response('Method Not Allowed', { status: 405 });
    }
};

export const onRequest: PagesFunction = async (context) => {
    const { request, params, env } = context;
    const id = params.path?.[0];

    try {
        return await handleRequest(request, env as Env, id);
    } catch (e: any) {
        console.error('Subtask API Error:', e.message);
        return new Response(e.message, { status: 500 });
    }
};
