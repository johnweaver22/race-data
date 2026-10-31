import { createExcelExport, excelFilename, EXCEL_MIME } from '../web/excel-export.mjs';

const types = { html: 'text/html; charset=utf-8', mjs: 'text/javascript; charset=utf-8',
  js: 'text/javascript; charset=utf-8', css: 'text/css; charset=utf-8', png: 'image/png',
  xlsx: EXCEL_MIME, md: 'text/plain; charset=utf-8' };

export function createRaceWorker(assets) {
  const decode = path => Uint8Array.from(atob(assets[path]), character => character.charCodeAt(0));
  return {
    async fetch(request) {
      const url = new URL(request.url);
      if (url.pathname === '/api/export.xlsx') {
        if (request.method !== 'POST') return new Response('Use Export Excel from completed race results.', { status: 405, headers: { Allow: 'POST' } });
        try {
          const raw = await request.text();
          if (raw.length > 65536) throw new Error('Export too large');
          const { config, timestamps } = JSON.parse(new URLSearchParams(raw).get('payload'));
          if (!config || typeof config.swimmer !== 'string' || config.swimmer.length > 100
            || typeof config.meet !== 'string' || config.meet.length > 150
            || !Array.isArray(timestamps) || timestamps.length > 242) throw new Error('Invalid export');
          const date = new Date();
          const bytes = await createExcelExport(config, timestamps, decode('/assets/race-export-template.xlsx'), date);
          const filename = excelFilename(config, date);
          const asciiName = filename.replace(/[^\x20-\x7E]/g, '_');
          return new Response(bytes, { headers: {
            'Content-Type': EXCEL_MIME,
            'Content-Disposition': `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
            'Content-Length': String(bytes.byteLength),
            'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
          } });
        } catch {
          return Response.json({ error: 'Could not export this race. Please retry from completed results.' },
            { status: 400, headers: { 'Cache-Control': 'no-store' } });
        }
      }
      if (!['GET', 'HEAD'].includes(request.method)) return new Response('Method not allowed', { status: 405 });
      const path = url.pathname === '/' ? '/index.html' : url.pathname;
      if (!Object.hasOwn(assets, path)) return new Response('Not found', { status: 404 });
      return new Response(request.method === 'HEAD' ? null : decode(path), { headers: {
        'Content-Type': types[path.split('.').at(-1)] ?? 'application/octet-stream',
        'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff',
      } });
    },
  };
}
