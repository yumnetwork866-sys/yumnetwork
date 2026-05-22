// functions/api/groups/[[path]].ts

// Fix: Import PagesFunction and Env types
// FIX: Changed to `import type` to correctly import type-only definitions.
// FIX: Import PagesFunction directly from its module to avoid resolution issues.
import type { PagesFunction } from '@cloudflare/workers-types/pages';
import type { Env } from '../../env';

interface Group {
  id: number;
  name: string;
  colorClass: string;
}

const handleRequest = async (request: Request, env: Env, id: string | undefined) => {
    switch (request.method) {
        case 'GET': {
            const stmt = env.DB.prepare('SELECT * FROM groups ORDER BY name');
            const { results } = await stmt.all<Group>();
            return new Response(JSON.stringify(results), {
                headers: { 'Content-Type': 'application/json' },
            });
        }
        case 'POST': {
            const newGroup: Omit<Group, 'id'> = await request.json();
            if (!newGroup.name || !newGroup.colorClass) {
                 return new Response('Bad Request: name and colorClass are required', { status: 400 });
            }
            const stmt = env.DB.prepare('INSERT INTO groups (name, colorClass) VALUES (?, ?) RETURNING *')
                .bind(newGroup.name, newGroup.colorClass);
            const result = await stmt.first<Group>();
            return new Response(JSON.stringify(result), {
                status: 201,
                headers: { 'Content-Type': 'application/json' },
            });
        }
        case 'PUT': {
            if (!id) return new Response('Bad Request: Missing ID', { status: 400 });
            const updatedGroup: Group = await request.json();
             if (!updatedGroup.name || !updatedGroup.colorClass) {
                 return new Response('Bad Request: name and colorClass are required', { status: 400 });
            }
            const stmt = env.DB.prepare('UPDATE groups SET name = ?, colorClass = ? WHERE id = ? RETURNING *')
                .bind(updatedGroup.name, updatedGroup.colorClass, id);
            const result = await stmt.first<Group>();
            return new Response(JSON.stringify(result), {
                headers: { 'Content-Type': 'application/json' },
            });
        }
        case 'DELETE': {
            if (!id) return new Response('Bad Request: Missing ID', { status: 400 });
            await env.DB.prepare('DELETE FROM groups WHERE id = ?').bind(id).run();
            return new Response(null, { status: 204 });
        }
        default:
            return new Response('Method Not Allowed', { status: 405 });
    }
}

export const onRequest: PagesFunction = async (context) => {
    const { request, params } = context;
    const env = context.env as Env;
    const id = params.path?.[0];

    try {
        return await handleRequest(request, env, id);
    } catch (e: any) {
        console.error(e);
        return new Response(e.message, { status: 500 });
    }
};