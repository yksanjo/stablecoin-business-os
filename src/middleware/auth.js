// API-key auth middleware.
//
// Every authenticated route reads the X-API-Key header, looks up the
// owning business in the DB, and rejects requests where either:
//   - the API key is missing or unknown, or
//   - the URL :id path parameter does not match the API key's business.
//
// The matched business is attached as req.business for downstream
// handlers.

export function requireBusinessAuth(businessOps) {
  return (req, res, next) => {
    const apiKey = req.header('X-API-Key');
    if (!apiKey) {
      return res
        .status(401)
        .json({ error: 'Missing X-API-Key header' });
    }

    const business = businessOps.getBusinessByApiKey(apiKey);
    if (!business) {
      return res.status(401).json({ error: 'Invalid API key' });
    }

    // If the route includes a :id segment for a business, it must
    // belong to the API key's business.
    const pathBusinessId = req.params.id;
    if (pathBusinessId && pathBusinessId !== business.id) {
      return res
        .status(403)
        .json({ error: 'API key does not own this resource' });
    }

    req.business = business;
    next();
  };
}

// Helper for routes that operate on a sub-resource (invoice, payout,
// payout) and need to confirm the resource belongs to the caller.
export function requireOwnership(businessOps, lookupFn) {
  return (req, res, next) => {
    if (!req.business) {
      return res.status(500).json({ error: 'Auth middleware not wired' });
    }
    const resource = lookupFn(req.params.id);
    if (!resource) {
      return res.status(404).json({ error: 'Resource not found' });
    }
    if (resource.business_id !== req.business.id) {
      return res
        .status(403)
        .json({ error: 'API key does not own this resource' });
    }
    req.resource = resource;
    next();
  };
}
