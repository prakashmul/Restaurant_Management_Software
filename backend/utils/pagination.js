// Opt-in pagination: returns null when the caller didn't ask for it, so
// existing callers that expect a plain array keep getting exactly that.
// Passing ?page=&limit= switches the response to { data, page, limit, total, totalPages }.
export function parsePagination(req) {
  const { page, limit } = req.query;
  if (page === undefined && limit === undefined) return null;

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  return { page: pageNum, limit: limitNum, skip: (pageNum - 1) * limitNum };
}

export function paginatedResponse(data, total, pagination) {
  return {
    data,
    page: pagination.page,
    limit: pagination.limit,
    total,
    totalPages: Math.ceil(total / pagination.limit),
  };
}
