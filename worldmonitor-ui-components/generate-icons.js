// Pure Node.js PNG icon generator — no external deps
'use strict';
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

const BG = [8, 13, 22];    // #080d16
const AC = [0, 245, 255];  // #00f5ff

// maskable=true: solid background, no rounded corners, content scaled to 80%
// safe zone so Android adaptive icons don't clip design elements.
function generateIcon(size, { maskable = false } = {}) {
  const S = size;
  // In SVG, design is 192×192 centered at (96,96). For maskable icons the
  // Android safe zone is a circle of radius = 40% of icon size (80% diameter).
  // Scale design coordinates so the farthest element (WM text at 79px from
  // centre) sits comfortably inside that radius.
  const safeR = maskable ? S * 0.4 : S / 2;   // px radius for content
  const sc = safeR / 96;                        // 96 = half of 192 SVG canvas
  const ox = S / 2, oy = S / 2;                // pixel-space origin

  const pixels = new Uint8Array(S * S * 4);

  function setPixel(x, y, r, g, b, a) {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || x >= S || y < 0 || y >= S) return;
    const i = (y * S + x) * 4;
    if (a >= 255) {
      pixels[i] = r; pixels[i+1] = g; pixels[i+2] = b; pixels[i+3] = 255;
    } else if (a > 0) {
      const fa = a / 255, ea = pixels[i+3] / 255;
      const oa = fa + ea * (1 - fa);
      if (oa > 0) {
        pixels[i]   = Math.round((r * fa + pixels[i]   * ea * (1 - fa)) / oa);
        pixels[i+1] = Math.round((g * fa + pixels[i+1] * ea * (1 - fa)) / oa);
        pixels[i+2] = Math.round((b * fa + pixels[i+2] * ea * (1 - fa)) / oa);
        pixels[i+3] = Math.round(oa * 255);
      }
    }
  }

  // SVG coord → pixel coord
  const px = x => ox + (x - 96) * sc;
  const py = y => oy + (y - 96) * sc;

  // Fill background
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++)
      setPixel(x, y, BG[0], BG[1], BG[2], 255);

  // Rounded corners (rx=32 at 192px) — only for non-maskable icons
  if (!maskable) {
    const rx = 32 * (S / 192);
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        let outside = false;
        if (x < rx && y < rx)           outside = Math.hypot(x - rx, y - rx) > rx;
        else if (x > S-rx && y < rx)    outside = Math.hypot(x - (S-rx), y - rx) > rx;
        else if (x < rx && y > S-rx)    outside = Math.hypot(x - rx, y - (S-rx)) > rx;
        else if (x > S-rx && y > S-rx)  outside = Math.hypot(x - (S-rx), y - (S-rx)) > rx;
        if (outside) pixels[(y * S + x) * 4 + 3] = 0;
      }
    }
  }

  // Antialiased filled circle or ring
  function drawCircle(svgCx, svgCy, r, fill, sw = 0) {
    const cx = px(svgCx), cy = py(svgCy);
    const cr = r * sc;
    const inner = sw > 0 ? cr - (sw * sc) / 2 : 0;
    const outer = sw > 0 ? cr + (sw * sc) / 2 : cr;
    for (let y = Math.floor(cy - outer - 2); y <= Math.ceil(cy + outer + 2); y++) {
      for (let x = Math.floor(cx - outer - 2); x <= Math.ceil(cx + outer + 2); x++) {
        const d = Math.hypot(x - cx, y - cy);
        if (d > outer + 1 || (sw > 0 && d < inner - 1)) continue;
        let a = 1;
        if (d > outer) a = outer + 1 - d;
        else if (sw > 0 && d < inner) a = d - (inner - 1);
        setPixel(x, y, fill[0], fill[1], fill[2], Math.round(Math.max(0, Math.min(1, a)) * 255));
      }
    }
  }

  // Antialiased thick line with round caps
  function drawLine(x1s, y1s, x2s, y2s, sw) {
    const x1 = px(x1s), y1 = py(y1s), x2 = px(x2s), y2 = py(y2s);
    const hw = (sw * sc) / 2;
    const bx1 = Math.max(0, Math.floor(Math.min(x1,x2) - hw - 2));
    const bx2 = Math.min(S-1, Math.ceil(Math.max(x1,x2) + hw + 2));
    const by1 = Math.max(0, Math.floor(Math.min(y1,y2) - hw - 2));
    const by2 = Math.min(S-1, Math.ceil(Math.max(y1,y2) + hw + 2));
    const dx = x2-x1, dy = y2-y1, len2 = dx*dx + dy*dy;
    for (let y = by1; y <= by2; y++) {
      for (let x = bx1; x <= bx2; x++) {
        const t = Math.max(0, Math.min(1, ((x-x1)*dx + (y-y1)*dy) / len2));
        const d = Math.hypot(x - (x1+t*dx), y - (y1+t*dy));
        if (d <= hw + 1) {
          const a = Math.max(0, Math.min(1, hw + 1 - d));
          setPixel(x, y, AC[0], AC[1], AC[2], Math.round(a * 255));
        }
      }
    }
  }

  // Circle outline + centre dot
  drawCircle(96, 96, 50, AC, 6);
  drawCircle(96, 96, 8, AC);

  // Four crosshair ticks
  drawLine(96, 46, 96, 62, 4);
  drawLine(96, 130, 96, 146, 4);
  drawLine(46, 96, 62, 96, 4);
  drawLine(130, 96, 146, 96, 4);

  // "WM" bitmap text (position matches SVG: x=96 centred, y=175 baseline)
  const W_GLYPH = [
    [1,0,0,0,1],
    [1,0,0,0,1],
    [1,0,1,0,1],
    [1,0,1,0,1],
    [1,1,0,1,1],
    [0,1,0,1,0],
  ];
  const M_GLYPH = [
    [1,0,0,0,1],
    [1,1,0,1,1],
    [1,0,1,0,1],
    [1,0,0,0,1],
    [1,0,0,0,1],
    [1,0,0,0,1],
  ];

  const fontSz = 14 * sc;
  const dotPx = Math.max(1, Math.round(fontSz / 6));
  const charW = 5 * dotPx, charH = 6 * dotPx;
  const gap = Math.max(1, Math.round(3 * sc));
  const textW = charW * 2 + gap;
  const startX = Math.round(px(96) - textW / 2);
  const startY = Math.round(py(175)) - charH;

  [W_GLYPH, M_GLYPH].forEach((glyph, ci) => {
    const ox = startX + ci * (charW + gap);
    glyph.forEach((row, ri) =>
      row.forEach((bit, pi) => {
        if (!bit) return;
        for (let dy = 0; dy < dotPx; dy++)
          for (let dx = 0; dx < dotPx; dx++)
            setPixel(ox + pi*dotPx + dx, startY + ri*dotPx + dy, AC[0], AC[1], AC[2], 255);
      })
    );
  });

  return encodePNG(pixels, S, S);
}

function encodePNG(pixels, w, h) {
  const rowBytes = w * 4;
  const raw = Buffer.alloc((1 + rowBytes) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (1 + rowBytes)] = 0;
    for (let x = 0; x < w; x++) {
      const si = (y * w + x) * 4;
      const di = y * (1 + rowBytes) + 1 + x * 4;
      raw[di] = pixels[si]; raw[di+1] = pixels[si+1];
      raw[di+2] = pixels[si+2]; raw[di+3] = pixels[si+3];
    }
  }
  const compressed = zlib.deflateSync(raw, { level: 6 });

  const tbl = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    tbl[i] = c;
  }
  function crc32(buf) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < buf.length; i++) c = tbl[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }
  function chunk(type, data) {
    const t = Buffer.from(type, 'ascii');
    const d = Buffer.isBuffer(data) ? data : Buffer.from(data);
    const len = Buffer.alloc(4); len.writeUInt32BE(d.length);
    const crcBuf = Buffer.alloc(4); crcBuf.writeUInt32BE(crc32(Buffer.concat([t, d])));
    return Buffer.concat([len, t, d, crcBuf]);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; // RGBA

  return Buffer.concat([
    Buffer.from([137,80,78,71,13,10,26,10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', compressed),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const outDir = path.join(__dirname, 'public', 'icons');
fs.mkdirSync(outDir, { recursive: true });

const tasks = [
  { file: 'icon-192.png',         size: 192, opts: {} },
  { file: 'icon-512.png',         size: 512, opts: {} },
  { file: 'icon-512-maskable.png', size: 512, opts: { maskable: true } },
];

for (const { file, size, opts } of tasks) {
  process.stdout.write(`Generating ${file}... `);
  const buf = generateIcon(size, opts);
  fs.writeFileSync(path.join(outDir, file), buf);
  console.log(`done (${buf.length} bytes)`);
}
