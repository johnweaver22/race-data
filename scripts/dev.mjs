import http from 'node:http';
import fs from 'node:fs/promises';
await import('./build.mjs');
const source = await fs.readFile(new URL('../dist/server/index.js', import.meta.url));
const { default: worker } = await import(`data:text/javascript;base64,${source.toString('base64')}`);
const port = Number(process.env.PORT || 4173);
http.createServer(async (req, res) => {
  try {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const response = await worker.fetch(new Request(`http://${req.headers.host}${req.url}`, {
      method: req.method, headers: req.headers,
      body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks),
    }));
    const bytes = Buffer.from(await response.arrayBuffer());
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(bytes);
  } catch { res.writeHead(500); res.end('Unable to serve this request'); }
}).listen(port, '0.0.0.0', () => console.log(`Race Data preview on ${port}`));
