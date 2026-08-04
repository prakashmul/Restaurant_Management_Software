// Validates req.body against a Zod schema. On success, req.body is replaced
// with the parsed (and coerced/defaulted) value so downstream handlers can
// trust its shape instead of re-checking it.
export function validate(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        message: result.error.issues[0]?.message || 'Invalid request body.',
        errors: result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }
    req.body = result.data;
    next();
  };
}
