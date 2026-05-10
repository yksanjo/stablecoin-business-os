// zod-backed request validation middleware.
//
// Usage:
//   app.post('/route', validate(mySchema), (req, res) => { req.validated })
//
// On success: parsed body is attached as req.validated.
// On failure: 400 with a structured error list.

export function validate(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const errors = result.error.issues.map((i) => ({
        path: i.path.join('.'),
        message: i.message,
      }));
      return res.status(400).json({ error: 'Validation failed', errors });
    }
    req.validated = result.data;
    next();
  };
}
