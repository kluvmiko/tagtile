
import { createHash, timingSafeEqual } from 'node:crypto';

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS'
};

const reply = (statusCode, body) => ({
  statusCode,
  headers,
  body: JSON.stringify(body)
});

const validId = id =>
  typeof id === 'string' && /^tt-[a-f0-9]{16}$/.test(id);

const hash = value =>
  createHash('sha256').update(value).digest('hex');

async function supabase(path, options = {}) {
  const base = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!base || !key) {
    throw new Error('Missing Supabase environment variables.');
  }

  return fetch(`${base}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: options.prefer || 'return=representation',
      ...(options.headers || {})
    }
  });
}

export default async (req) => {
  if (req.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers };
  }

  try {
    const body = req.body ? JSON.parse(req.body) : {};
    const id = body.id || req.queryStringParameters?.id;

    if (!validId(id)) {
      return reply(400, { error: 'Invalid TagTile ID.' });
    }

    if (req.httpMethod === 'GET') {
      const r = await supabase(
        `tagtiles?id=eq.${encodeURIComponent(id)}&select=id,data`
      );

      if (!r.ok) {
        return reply(502, {
          error: 'Could not load this TagTile.'
        });
      }

      const rows = await r.json();
      return reply(200, { profile: rows[0] || null });
    }

    if (req.httpMethod === 'POST') {
      if (
        typeof body.key !== 'string' ||
        body.key.length < 32 ||
        !body.data?.name
      ) {
        return reply(400, {
          error: 'A display name and setup key are required.'
        });
      }

      const r = await supabase('tagtiles', {
        method: 'POST',
        body: JSON.stringify({
          id,
          data: body.data,
          edit_token_hash: hash(body.key)
        })
      });

      if (r.status === 409) {
        return reply(409, {
          error: 'This TagTile has already been claimed. Scan it again to open its page.'
        });
      }

      if (!r.ok) {
        return reply(502, {
          error: 'Could not save your TagTile.'
        });
      }

      return reply(201, { ok: true });
    }

    if (req.httpMethod === 'PUT') {
      if (typeof body.key !== 'string' || !body.data?.name) {
        return reply(400, {
          error: 'Missing edit key or display name.'
        });
      }

      const lookup = await supabase(
        `tagtiles?id=eq.${encodeURIComponent(id)}&select=edit_token_hash`
      );

      if (!lookup.ok) {
        return reply(502, {
          error: 'Could not verify this edit link.'
        });
      }

      const rows = await lookup.json();

      if (!rows.length) {
        return reply(404, { error: 'TagTile not found.' });
      }

      const expected = Buffer.from(rows[0].edit_token_hash, 'hex');
      const supplied = Buffer.from(hash(body.key), 'hex');

      if (
        expected.length !== supplied.length ||
        !timingSafeEqual(expected, supplied)
      ) {
        return reply(403, {
          error: 'That private edit link is not valid.'
        });
      }

      const update = await supabase(
        `tagtiles?id=eq.${encodeURIComponent(id)}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ data: body.data })
        }
      );

      if (!update.ok) {
        return reply(502, {
          error: 'Could not update your TagTile.'
        });
      }

      return reply(200, { ok: true });
    }

    return reply(405, { error: 'Method not allowed.' });

  } catch (error) {
    return reply(500, {
      error: error.message || 'Unexpected server error.'
    });
  }
};
