import { parsePagination, pageMeta } from './pagination.js';

/**
 * Standard tenant-scoped list: filter + paginate + sort a Mongoose model.
 * Always injects workspaceId and excludes soft-deleted docs when supported.
 */
export async function listScoped(Model, { workspaceId, query = {}, filter = {}, sort = { createdAt: -1 }, populate } = {}) {
  const { page, limit, skip } = parsePagination(query);
  const base = { workspaceId, ...filter };
  if (Model.schema.path('deletedAt')) base.deletedAt = null;

  let q = Model.find(base).sort(sort).skip(skip).limit(limit);
  if (populate) q = q.populate(populate);
  const [items, total] = await Promise.all([q.lean(), Model.countDocuments(base)]);
  return { items, meta: pageMeta(total, page, limit) };
}

export async function getScoped(Model, { workspaceId, id, populate }) {
  let q = Model.findOne({ workspaceId, _id: id });
  if (populate) q = q.populate(populate);
  return q;
}
