module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'method_not_allowed' });
    return;
  }

  try {
    const body = req.body || {};
    const event = body.event || 'unknown_event';
    const payload = body.payload || {};

    // Keep logs compact + safe (no full api key expected from client)
    console.log(JSON.stringify({
      scope: 'market-lens',
      event,
      ts: body.ts || new Date().toISOString(),
      userAgent: req.headers['user-agent'] || null,
      xForwardedFor: req.headers['x-forwarded-for'] || null,
      payload,
    }));

    res.status(200).json({ ok: true });
  } catch (e) {
    console.error('log_api_error', e?.message || String(e));
    res.status(500).json({ ok: false });
  }
};
