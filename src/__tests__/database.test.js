// Database-layer tests. Uses an isolated, throwaway sql.js DB per test
// run via DATABASE_PATH so we don't clobber the dev database.

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'path';
import fs from 'fs';
import os from 'os';

const tmpDb = path.join(
  os.tmpdir(),
  `sbo-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`
);
process.env.DATABASE_PATH = tmpDb;

// Dynamic import so the env var is set before module init.
const dbModule = await import('../services/database.js');
await dbModule.getDb();

describe('createBusiness + getBusinessByApiKey', () => {
  test('returns a one-time apiKey and looks it up by key', () => {
    const created = dbModule.createBusiness({
      name: 'Acme',
      email: 'a@acme.com',
    });
    assert.ok(created.id);
    assert.ok(created.apiKey, 'apiKey should be returned once');
    assert.match(created.apiKey, /^sbk_[a-f0-9]{64}$/);

    const looked = dbModule.getBusinessByApiKey(created.apiKey);
    assert.equal(looked.id, created.id);
    assert.equal(looked.name, 'Acme');

    // Wrong key returns null.
    assert.equal(
      dbModule.getBusinessByApiKey('sbk_wrong'),
      null
    );
    assert.equal(dbModule.getBusinessByApiKey(''), null);
    assert.equal(dbModule.getBusinessByApiKey(null), null);
  });

  test('getBusiness never exposes the key hash or plaintext', () => {
    const created = dbModule.createBusiness({
      name: 'B',
      email: 'b@b.com',
    });
    const fetched = dbModule.getBusiness(created.id);
    assert.equal(fetched.api_key_hash, undefined);
    assert.equal(fetched.apiKey, undefined);
    // Prefix is OK to expose, it's just an identifier.
    assert.match(fetched.api_key_prefix, /^sbk_[a-f0-9]{8}$/);
  });

  test('each business gets a unique api key', () => {
    const a = dbModule.createBusiness({ name: 'C', email: 'c@c.com' });
    const b = dbModule.createBusiness({ name: 'D', email: 'd@d.com' });
    assert.notEqual(a.apiKey, b.apiKey);
  });
});

after(() => {
  try {
    fs.unlinkSync(tmpDb);
  } catch {
    /* best effort */
  }
});
