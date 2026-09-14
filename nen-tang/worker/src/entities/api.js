/**
 * Duong dan HTTP cho entity.
 *
 *   GET    /api/entities/:Ten?filter=<json>&sort=-created_date&limit=&offset=
 *   GET    /api/entities/:Ten/:id
 *   POST   /api/entities/:Ten
 *   PUT    /api/entities/:Ten/:id
 *   DELETE /api/entities/:Ten/:id
 *   POST   /api/entities/:Ten/updateMany
 *
 * Tra ve MANG/DOI TUONG TRAN (khong boc trong {data}) vi lop thay the SDK o
 * frontend doi dung hinh dang do.
 */
import { json, apiError } from '../lib/respond.js';
import { requireUser } from '../auth/guard.js';
import { createEntityRepo, PolicyError } from './repo.js';

const PATH_RE = /^\/api\/entities\/([A-Za-z][A-Za-z0-9]*)(?:\/(.+))?$/;

export async function handleEntities(rc) {
  const match = PATH_RE.exec(rc.url.pathname);
  if (!match) return null;

  const denied = await requireUser(rc);
  if (denied) return denied;

  const [, name, tail] = match;
  const method = rc.request.method;
  const repo = createEntityRepo(rc);

  try {
    if (tail === 'updateMany') {
      if (method !== 'POST') return apiError(405, 'method_not_allowed', 'Method không hỗ trợ');
      return json(await repo.updateMany(name, rc.body?.filter, rc.body?.update));
    }

    if (tail) {
      const id = decodeURIComponent(tail);
      if (method === 'GET') return json(await repo.get(name, id));
      if (method === 'PUT' || method === 'PATCH') return json(await repo.update(name, id, rc.body));
      if (method === 'DELETE') return json(await repo.remove(name, id));
      return apiError(405, 'method_not_allowed', 'Method không hỗ trợ');
    }

    if (method === 'GET') {
      let filter;
      const raw = rc.url.searchParams.get('filter');
      if (raw) {
        try {
          filter = JSON.parse(raw);
        } catch {
          return apiError(400, 'bad_filter', 'Điều kiện lọc không hợp lệ');
        }
        if (!filter || typeof filter !== 'object' || Array.isArray(filter)) {
          return apiError(400, 'bad_filter', 'Điều kiện lọc không hợp lệ');
        }
      }
      return json(await repo.list(name, {
        filter,
        sort: rc.url.searchParams.get('sort'),
        limit: rc.url.searchParams.get('limit'),
        offset: rc.url.searchParams.get('offset'),
      }));
    }

    if (method === 'POST') return json(await repo.create(name, rc.body), 201);
    return apiError(405, 'method_not_allowed', 'Method không hỗ trợ');
  } catch (err) {
    if (err instanceof PolicyError) {
      return apiError(err.status, err.status === 403 ? 'forbidden' : 'error', err.message);
    }
    throw err;
  }
}
