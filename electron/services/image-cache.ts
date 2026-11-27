import fs from 'fs';
import path from 'path';
import { net, protocol } from 'electron';
import { EVE_IMAGE_SERVER } from '@shared/constants/eve';

function detectImageMime(buf: Buffer): string {
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xd8) {
    return 'image/jpeg';
  }
  return 'image/png';
}

export function registerEveImageProtocol(userDataDir: string): void {
  const cacheRoot = path.join(userDataDir, 'cache', 'images');
  fs.mkdirSync(cacheRoot, { recursive: true });

  protocol.handle('eve-img', async (request) => {
    try {
      const parsed = new URL(request.url);
      const relPath = `/${parsed.host}${parsed.pathname}`.replace(/\/+/g, '/');
      const size = parsed.searchParams.get('size') ?? '64';
      const safeFileKey = `${relPath.replace(/[^a-zA-Z0-9_-]/g, '_')}_s${size}.img`;
      const localFile = path.join(cacheRoot, safeFileKey);

      if (fs.existsSync(localFile)) {
        const buf = fs.readFileSync(localFile);
        return new Response(new Uint8Array(buf), {
          status: 200,
          headers: {
            'Content-Type': detectImageMime(buf),
            'Cache-Control': 'public, max-age=604800'
          }
        });
      }

      const remoteUrl = `${EVE_IMAGE_SERVER}${relPath}?size=${encodeURIComponent(size)}`;
      let remoteRes: globalThis.Response;
      try {
        remoteRes = await fetch(remoteUrl, {
          headers: { 'User-Agent': 'NewEdenLens/0.1.0' }
        });
      } catch {
        remoteRes = await net.fetch(remoteUrl);
      }

      if (!remoteRes.ok) {
        return new Response(null, { status: remoteRes.status });
      }

      const arrayBuf = await remoteRes.arrayBuffer();
      const buf = Buffer.from(arrayBuf);
      const contentType = remoteRes.headers.get('content-type') ?? detectImageMime(buf);
      fs.writeFileSync(localFile, buf);

      return new Response(new Uint8Array(buf), {
        status: 200,
        headers: { 'Content-Type': contentType, 'Cache-Control': 'public, max-age=604800' }
      });
    } catch {
      return new Response(null, { status: 404 });
    }
  });
}
