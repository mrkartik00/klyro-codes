export function parsePagination(query, { maxLimit = 100, defaultLimit = 20 } = {}) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(maxLimit, Math.max(1, parseInt(query.limit, 10) || defaultLimit));
  return { page, limit, skip: (page - 1) * limit };
}

export function pageMeta(total, page, limit) {
  return { total, page, limit, pages: Math.ceil(total / limit) };
}
