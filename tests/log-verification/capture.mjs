import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { mkdir } from 'node:fs/promises';
const server = createServer((req, res) => {
  if (req.url === '/api/success') { res.writeHead(200, {'Content-Type':'application/json'}); res.end('{"verified":true}'); }
  else if (req.url === '/api/failure') { res.writeHead(503, {'Content-Type':'application/json'}); res.end('{"error":"known-test-failure"}'); }
  else { res.writeHead(200, {'Content-Type':'text/html'}); res.end('<html><body>Log verification</body></html>'); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await chromium.launch({channel:'chrome', headless:true});
  const context = await browser.newContext();
  await context.tracing.start({screenshots:true, snapshots:true, sources:true});
  const page = await context.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.evaluate(async () => {
    console.log('VERIFY_CONSOLE_INFO');
    console.warn('VERIFY_CONSOLE_WARNING');
    console.error('VERIFY_CONSOLE_ERROR');
    const url = new URL(window.location.href);
    url.searchParams.set('log_verification', 'network_check');
    const response = await fetch(url.href, { cache: 'no-store' });
    console.log(`VERIFY_NETWORK_STATUS=${response.status}`);
    await fetch('/api/success');
    await fetch('/api/failure');
  });
  await mkdir('tests/log-verification/output', {recursive:true});
  await context.tracing.stop({path:'tests/log-verification/output/trace.zip'});
  await context.close();
  console.log('Real browser trace saved. Expected: info/warning/error messages, GET 200 and GET 503.');
} finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
