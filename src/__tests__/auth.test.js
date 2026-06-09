// Auth middleware behavior, in isolation from the routes.

import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { requireBusinessAuth } from '../middleware/auth.js';

function makeReq({ apiKey, paramsId } = {}) {
  return {
    header: (name) =>
      name === 'X-API-Key' && apiKey ? apiKey : undefined,
    params: paramsId ? { id: paramsId } : {},
  };
}

function makeRes() {
  const res = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
  return res;
}

describe('requireBusinessAuth', () => {
  test('rejects requests without X-API-Key', () => {
    const businessOps = { getBusinessByApiKey: () => null };
    const mw = requireBusinessAuth(businessOps);
    const req = makeReq();
    const res = makeRes();
    let nextCalled = false;
    mw(req, res, () => {
      nextCalled = true;
    });
    assert.equal(res.statusCode, 401);
    assert.equal(res.body.error, 'Missing X-API-Key header');
    assert.equal(nextCalled, false);
  });

  test('rejects unknown API keys', () => {
    const businessOps = { getBusinessByApiKey: () => null };
    const mw = requireBusinessAuth(businessOps);
    const req = makeReq({ apiKey: 'sbk_nope' });
    const res = makeRes();
    let nextCalled = false;
    mw(req, res, () => {
      nextCalled = true;
    });
    assert.equal(res.statusCode, 401);
    assert.equal(res.body.error, 'Invalid API key');
    assert.equal(nextCalled, false);
  });

  test('rejects when :id param does not match the key owner', () => {
    const businessOps = {
      getBusinessByApiKey: () => ({ id: 'biz-a', name: 'A' }),
    };
    const mw = requireBusinessAuth(businessOps);
    const req = makeReq({ apiKey: 'sbk_a', paramsId: 'biz-b' });
    const res = makeRes();
    let nextCalled = false;
    mw(req, res, () => {
      nextCalled = true;
    });
    assert.equal(res.statusCode, 403);
    assert.equal(nextCalled, false);
  });

  test('passes through and attaches req.business when key + id match', () => {
    const business = { id: 'biz-a', name: 'A' };
    const businessOps = { getBusinessByApiKey: () => business };
    const mw = requireBusinessAuth(businessOps);
    const req = makeReq({ apiKey: 'sbk_a', paramsId: 'biz-a' });
    const res = makeRes();
    let nextCalled = false;
    mw(req, res, () => {
      nextCalled = true;
    });
    assert.equal(nextCalled, true);
    assert.deepEqual(req.business, business);
  });

  test('passes through for routes without a :id param', () => {
    const business = { id: 'biz-a' };
    const businessOps = { getBusinessByApiKey: () => business };
    const mw = requireBusinessAuth(businessOps);
    const req = makeReq({ apiKey: 'sbk_a' });
    const res = makeRes();
    let nextCalled = false;
    mw(req, res, () => {
      nextCalled = true;
    });
    assert.equal(nextCalled, true);
    assert.deepEqual(req.business, business);
  });
});
