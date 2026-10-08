const http = require('node:http');

function startKeepAlive(port) {
  const p = Number(port || process.env.PORT || 3000);
  const server = http.createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, bot: 'icemm', uptime: process.uptime() }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('ICEMM bot is running');
  });
  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      console.warn(`[keepalive] port ${p} is already in use; health server skipped.`);
      return;
    }
    console.error('[keepalive] server error:', error);
  });
  server.listen(p, () => console.log(`[keepalive] listening on ${p}`));
  return server;
}

module.exports = { startKeepAlive };
