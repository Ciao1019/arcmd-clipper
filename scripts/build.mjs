import { build, context as esbuildContext } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const distDir = path.join(root, 'dist');
const releaseDir = path.join(root, 'release');

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const args = new Set(process.argv.slice(2));
const watchMode = args.has('--watch');
const zipMode = args.has('--zip');

// --- CRC32 for PNG chunks and ZIP archive ---
const CRC_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  CRC_TABLE[i] = c >>> 0;
}

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const tag = Buffer.from(type, 'ascii');
  const body = Buffer.concat([tag, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

/**
 * Generates crisp RGBA PNG extension icons (rounded blue-indigo gradient squircle
 * with an ArcMD geometric "A" + corner clip notch) without native image deps.
 */
function renderIconPNG(size) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  const rad = size * 0.24;

  const insideRoundedRect = (x, y) => {
    const cx = Math.min(Math.max(x, rad), size - rad);
    const cy = Math.min(Math.max(y, rad), size - rad);
    const dx = x - cx;
    const dy = y - cy;
    return Math.hypot(dx, dy) <= rad;
  };

  const distSeg = (px, py, ax, ay, bx, by) => {
    const abx = bx - ax;
    const aby = by - ay;
    const t = Math.max(0, Math.min(1, ((px - ax) * abx + (py - ay) * aby) / (abx * abx + aby * aby || 1)));
    return Math.hypot(px - (ax + t * abx), py - (ay + t * aby));
  };

  for (let y = 0; y < size; y++) {
    const rowOff = y * (size * 4 + 1);
    raw[rowOff] = 0; // filter byte
    for (let x = 0; x < size; x++) {
      // 2x2 supersampling for crisp edges
      let rAcc = 0;
      let gAcc = 0;
      let bAcc = 0;
      let aAcc = 0;
      for (let sy = 0; sy < 2; sy++) {
        for (let sx = 0; sx < 2; sx++) {
          const px = x + (sx + 0.5) * 0.5;
          const py = y + (sy + 0.5) * 0.5;
          if (!insideRoundedRect(px, py)) continue;
          const u = px / size;
          const v = py / size;
          // Gradient from #3b82f6 -> #6366f1
          let r = 59 + (99 - 59) * ((u + v) * 0.5);
          let g = 130 + (102 - 130) * ((u + v) * 0.5);
          let b = 246 + (241 - 246) * ((u + v) * 0.5);

          // Geometric crisp white "A" + clip bar
          const stroke = Math.max(1.2, size * 0.088);
          const dLeft = distSeg(u, v, 0.5, 0.23, 0.27, 0.77);
          const dRight = distSeg(u, v, 0.5, 0.23, 0.73, 0.77);
          const dBar = distSeg(u, v, 0.36, 0.59, 0.64, 0.59);
          const minD = Math.min(dLeft, dRight, dBar) * size;
          if (minD <= stroke * 0.55) {
            r = 255;
            g = 255;
            b = 255;
          }
          // Subtle top-right clip badge dot
          if (Math.hypot(u - 0.77, v - 0.25) <= 0.075) {
            r = 254;
            g = 240;
            b = 138;
          }
          rAcc += r;
          gAcc += g;
          bAcc += b;
          aAcc += 255;
        }
      }
      const off = rowOff + 1 + x * 4;
      const samples = aAcc > 0 ? aAcc / 255 : 0;
      raw[off] = samples > 0 ? Math.round(rAcc / samples) : 0;
      raw[off + 1] = samples > 0 ? Math.round(gAcc / samples) : 0;
      raw[off + 2] = samples > 0 ? Math.round(bAcc / samples) : 0;
      raw[off + 3] = Math.round(aAcc / 4);
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, pngChunk('IHDR', ihdr), pngChunk('IDAT', idat), pngChunk('IEND', Buffer.alloc(0))]);
}

function writeIcons() {
  const iconsDir = path.join(distDir, 'icons');
  fs.mkdirSync(iconsDir, { recursive: true });
  for (const size of [16, 32, 48, 128]) {
    fs.writeFileSync(path.join(iconsDir, `icon-${size}.png`), renderIconPNG(size));
  }
}

async function writeManifest() {
  // Compile src/manifest.ts in memory so TS stays the single source of truth.
  const out = await build({
    entryPoints: [path.join(root, 'src/manifest.ts')],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
  });
  const code = out.outputFiles[0].text;
  const dataUrl = `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
  const mod = await import(dataUrl);
  const manifest = mod.buildManifest(pkg.version);
  fs.writeFileSync(path.join(distDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
}

function copyStaticPages() {
  for (const page of ['popup', 'options']) {
    const srcDir = path.join(root, 'src', page);
    const outDir = path.join(distDir, page);
    fs.mkdirSync(outDir, { recursive: true });
    const html = fs
      .readFileSync(path.join(srcDir, 'index.html'), 'utf8')
      .replace('./main.ts', './main.js');
    fs.writeFileSync(path.join(outDir, 'index.html'), html);
    const cssName = `${page}.css`;
    fs.copyFileSync(path.join(srcDir, cssName), path.join(outDir, cssName));
  }
}

function collectFiles(dir, base = dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectFiles(full, base));
    } else {
      results.push({
        full,
        rel: path.relative(base, full).replace(/\\/g, '/'),
      });
    }
  }
  return results;
}

/**
 * Pure Node deterministic ZIP builder (Deflate level 9) — zero external zip binary required.
 */
function createZipFromDir(sourceDir, outZipPath) {
  fs.mkdirSync(path.dirname(outZipPath), { recursive: true });
  const files = collectFiles(sourceDir).sort((a, b) => a.rel.localeCompare(b.rel));
  const localChunks = [];
  const centralChunks = [];
  let offset = 0;

  for (const f of files) {
    const data = fs.readFileSync(f.full);
    const compressed = zlib.deflateRawSync(data, { level: 9 });
    const nameBuf = Buffer.from(f.rel, 'utf8');
    const crc = crc32(data);

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0); // signature
    localHeader.writeUInt16LE(20, 4); // version needed
    localHeader.writeUInt16LE(0x0800, 6); // UTF-8 flag
    localHeader.writeUInt16LE(8, 8); // deflate
    localHeader.writeUInt16LE(0, 10); // mod time
    localHeader.writeUInt16LE(0x5421, 12); // mod date
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(compressed.length, 18);
    localHeader.writeUInt32LE(data.length, 22);
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28);

    localChunks.push(localHeader, nameBuf, compressed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0x5421, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centralChunks.push(central, nameBuf);

    offset += localHeader.length + nameBuf.length + compressed.length;
  }

  const centralDirBuf = Buffer.concat(centralChunks);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralDirBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  fs.writeFileSync(outZipPath, Buffer.concat([...localChunks, centralDirBuf, eocd]));
}

async function runBuild() {
  fs.rmSync(distDir, { recursive: true, force: true });
  fs.mkdirSync(distDir, { recursive: true });

  const common = {
    bundle: true,
    sourcemap: watchMode,
    minify: !watchMode,
    target: ['chrome114'],
    logLevel: 'info',
  };

  const configs = [
    {
      ...common,
      entryPoints: [path.join(root, 'src/background/index.ts')],
      outfile: path.join(distDir, 'background.js'),
      format: 'esm',
    },
    {
      ...common,
      entryPoints: [path.join(root, 'src/content/index.ts')],
      outfile: path.join(distDir, 'content.js'),
      format: 'iife',
    },
    {
      ...common,
      entryPoints: [path.join(root, 'src/popup/main.ts')],
      outfile: path.join(distDir, 'popup/main.js'),
      format: 'esm',
    },
    {
      ...common,
      entryPoints: [path.join(root, 'src/options/main.ts')],
      outfile: path.join(distDir, 'options/main.js'),
      format: 'esm',
    },
  ];

  writeIcons();
  copyStaticPages();
  await writeManifest();

  if (watchMode) {
    const ctxs = await Promise.all(configs.map((cfg) => esbuildContext(cfg)));
    await Promise.all(ctxs.map((c) => c.watch()));
    console.log('Watching ArcMD Web Clipper sources…');
    return;
  }

  await Promise.all(configs.map((cfg) => build(cfg)));
  console.log(`Built ArcMD Web Clipper v${pkg.version} into ${distDir}`);

  if (zipMode) {
    const zipPath = path.join(releaseDir, `arcmd-clipper-v${pkg.version}.zip`);
    createZipFromDir(distDir, zipPath);
    console.log(`Packaged ${zipPath}`);
  }
}

runBuild().catch((err) => {
  console.error(err);
  process.exit(1);
});
