// functions/api/users/[[path]].ts

// Fix: Import PagesFunction and Env types
// FIX: Changed to `import type` to correctly import type-only definitions.
// FIX: Import PagesFunction directly from its module to avoid resolution issues.
import type { PagesFunction } from '@cloudflare/workers-types/pages';
import type { Env } from '../../env';

interface User {
  id: number;
  name: string;
  role: 'admin' | 'member' | 'leader';
  email: string;
  password: string;
  groupId: number | null;
  managedGroupIds?: string | number[] | null;
}

const ensureManagedGroupIdsColumnSupported = async (env: Env) => {
    try {
        const usersSchemaStmt = env.DB.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='users'");
        const schemaResult = await usersSchemaStmt.first<{ sql: string }>();
        const sql = schemaResult?.sql || "";
        
        if (sql && !sql.toLowerCase().includes("managedgroupids")) {
            console.log("Altering 'users' table to add 'managedGroupIds' column.");
            await env.DB.prepare("ALTER TABLE users ADD COLUMN managedGroupIds TEXT DEFAULT '[]'").run();
            console.log("Successfully added 'managedGroupIds' column.");
        }
    } catch (error: any) {
        console.error("Failed to run 'managedGroupIds' column check/migration on users table:", error);
    }
};

const ensureLeaderRoleSupported = async (env: Env) => {
    try {
        const usersSchemaStmt = env.DB.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='users'");
        const schemaResult = await usersSchemaStmt.first<{ sql: string }>();
        const sql = schemaResult?.sql || "";
        
        // If the table schema contains CHECK constraints but lacks 'leader' role, migrate it.
        if (sql && sql.toLowerCase().includes("check") && !sql.toLowerCase().includes("'leader'")) {
            console.log("Migrating 'users' table to support 'leader' role. Current schema: ", sql);
            
            // 1. Rename existing users table to users_old
            await env.DB.prepare("ALTER TABLE users RENAME TO users_old").run();
            
            // 2. Create the new users table with matching column structure supporting the 'leader' role is CHECK constraint
            await env.DB.prepare(`
                CREATE TABLE users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    role TEXT NOT NULL CHECK(role IN ('admin', 'member', 'leader')),
                    email TEXT NOT NULL UNIQUE,
                    password TEXT NOT NULL,
                    groupId INTEGER,
                    managedGroupIds TEXT DEFAULT '[]',
                    FOREIGN KEY(groupId) REFERENCES groups(id) ON DELETE SET NULL
                )
            `).run();
            
            // 3. Re-populate data from the temp table to the new table structure
            await env.DB.prepare(`
                INSERT INTO users (id, name, role, email, password, groupId, managedGroupIds)
                SELECT id, name, role, email, password, groupId, '[]' FROM users_old
            `).run();
            
            // 4. Clean up temp table
            await env.DB.prepare("DROP TABLE users_old").run();
            console.log("Successfully migrated 'users' table structure to support 'leader' role.");
        }
    } catch (error: any) {
        console.error("Failed to run 'leader' role check/migration on users table:", error);
    }
};

const handleRequest = async (request: Request, env: Env, id: string | undefined) => {
    // Run the self-mending database migration check to ensure 'leader' is a valid role value
    await ensureLeaderRoleSupported(env);
    await ensureManagedGroupIdsColumnSupported(env);

    switch (request.method) {
        case 'GET': {
             const url = new URL(request.url);
             if (url.searchParams.get('schema') === 'true') {
                 const usersSchemaStmt = env.DB.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='users'");
                 const usersSchema = await usersSchemaStmt.first<{ sql: string }>();
                 const tasksSchemaStmt = env.DB.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='tasks'");
                 const tasksSchema = await tasksSchemaStmt.first<{ sql: string }>();
                 return new Response(JSON.stringify({ users: usersSchema?.sql, tasks: tasksSchema?.sql }), {
                     headers: { 'Content-Type': 'application/json' },
                 });
             }
             const stmt = env.DB.prepare('SELECT * FROM users ORDER BY name');
             const { results } = await stmt.all<User>();
             
             // Cast/parse managedGroupIds to arrays of numbers
             const parsedResults = results.map(u => {
                 let managedGroupIds: number[] = [];
                 if (typeof u.managedGroupIds === 'string' && u.managedGroupIds.trim() !== '') {
                     try {
                         managedGroupIds = JSON.parse(u.managedGroupIds);
                     } catch (e) {
                         console.error("Failed to parse managedGroupIds JSON:", u.managedGroupIds, e);
                         managedGroupIds = [];
                     }
                 }
                 return { ...u, managedGroupIds };
             });

             return new Response(JSON.stringify(parsedResults), {
                 headers: { 'Content-Type': 'application/json' },
             });
        }
        case 'POST': {
            const newUser: Omit<User, 'id'> = await request.json();
            const managedGroupIdsStr = Array.isArray(newUser.managedGroupIds)
                ? JSON.stringify(newUser.managedGroupIds)
                : '[]';

            const stmt = env.DB.prepare('INSERT INTO users (name, role, email, password, groupId, managedGroupIds) VALUES (?, ?, ?, ?, ?, ?) RETURNING *')
                .bind(newUser.name, newUser.role, newUser.email, newUser.password, newUser.groupId, managedGroupIdsStr);
            const result = await stmt.first<User>();
            
            if (result) {
                let parsedIds: number[] = [];
                if (typeof result.managedGroupIds === 'string' && result.managedGroupIds.trim() !== '') {
                    try { parsedIds = JSON.parse(result.managedGroupIds); } catch {}
                }
                return new Response(JSON.stringify({ ...result, managedGroupIds: parsedIds }), {
                    status: 201,
                    headers: { 'Content-Type': 'application/json' },
                });
            } else {
                return new Response('Failed to insert user', { status: 500 });
            }
        }
        case 'PUT': {
            if (!id) return new Response('Bad Request: Missing ID', { status: 400 });
            const updatedUser: User = await request.json();
            const managedGroupIdsStr = Array.isArray(updatedUser.managedGroupIds)
                ? JSON.stringify(updatedUser.managedGroupIds)
                : '[]';
            
            const updateUserStmt = env.DB.prepare('UPDATE users SET name = ?, role = ?, email = ?, password = ?, groupId = ?, managedGroupIds = ? WHERE id = ? RETURNING *')
                .bind(updatedUser.name, updatedUser.role, updatedUser.email, updatedUser.password, updatedUser.groupId, managedGroupIdsStr, id);
            const result = await updateUserStmt.first<User>();

            // If user's group changed, update their assigned tasks' group
            if (result && updatedUser.groupId !== null) {
                const updateTasksStmt = env.DB.prepare('UPDATE tasks SET groupId = ? WHERE assigneeId = ?')
                    .bind(updatedUser.groupId, id);
                await updateTasksStmt.run();
            }

            if (result) {
                let parsedIds: number[] = [];
                if (typeof result.managedGroupIds === 'string' && result.managedGroupIds.trim() !== '') {
                    try { parsedIds = JSON.parse(result.managedGroupIds); } catch {}
                }
                return new Response(JSON.stringify({ ...result, managedGroupIds: parsedIds }), {
                    headers: { 'Content-Type': 'application/json' },
                });
            } else {
                return new Response('User not found or failed to update', { status: 404 });
            }
        }
        case 'DELETE': {
             if (id) {
                // Single delete
                await env.DB.prepare('DELETE FROM users WHERE id = ?').bind(id).run();
                return new Response(null, { status: 204 });
            } else {
                // Bulk delete
                // Fix: request.json() does not take a type argument. Use a type assertion instead.
                const { ids } = await request.json() as { ids: number[] };
                if (!Array.isArray(ids) || ids.length === 0) {
                    return new Response('Bad Request: "ids" must be a non-empty array', { status: 400 });
                }
                const placeholders = ids.map(() => '?').join(',');
                const stmt = env.DB.prepare(`DELETE FROM users WHERE id IN (${placeholders})`).bind(...ids);
                await stmt.run();
                return new Response(null, { status: 204 });
            }
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