export function ok(res, data = null, meta) {
  return res.json({ success: true, data, ...(meta ? { meta } : {}) });
}

export function created(res, data = null) {
  return res.status(201).json({ success: true, data });
}
