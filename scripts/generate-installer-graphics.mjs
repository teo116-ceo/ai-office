/**
 * NSIS 설치 화면용 BMP 이미지 생성기 (고화질 박스 필터 리샘플링)
 *
 * NSIS 고정 사이즈:
 *   installer-header.bmp   150×57  — 내부 페이지 상단 우측 브랜딩
 *   installer-sidebar.bmp  164×314 — 시작/완료 페이지 좌측 사이드바
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { inflateSync } from 'zlib';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT  = join(__dirname, '..');
const BUILD = join(ROOT, 'build');
const DIST  = join(ROOT, 'dist');

// ── 브랜드 컬러 (#1b5f58 기반) ──────────────────────────────────
const TEAL      = [27,  95,  88];    // 메인 청록
const TEAL_DK   = [16,  60,  55];    // 어두운 청록 (그라디언트 끝)
const TEAL_LT   = [38, 118, 108];    // 밝은 청록 (그라디언트 시작)
const TEAL_PALE = [230, 245, 243];   // 연한 청록 (헤더 배경)
const WHITE     = [255, 255, 255];

// ── PNG 디코더 ───────────────────────────────────────────────────
function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
}

function decodePNG(filePath) {
  const buf = readFileSync(filePath);
  const SIG = [137, 80, 78, 71, 13, 10, 26, 10];
  for (let i = 0; i < 8; i++) {
    if (buf[i] !== SIG[i]) throw new Error(`Not a PNG: ${filePath}`);
  }
  let width, height, colorType;
  const idatChunks = [];
  let pos = 8;
  while (pos < buf.length) {
    const len  = buf.readUInt32BE(pos); pos += 4;
    const type = buf.subarray(pos, pos + 4).toString('ascii'); pos += 4;
    const data = buf.subarray(pos, pos + len); pos += len + 4;
    if (type === 'IHDR') {
      width = data.readUInt32BE(0); height = data.readUInt32BE(4);
      colorType = data[9];
    } else if (type === 'IDAT') {
      idatChunks.push(Buffer.from(data));
    } else if (type === 'IEND') break;
  }
  const chMap = { 0: 1, 2: 3, 4: 2, 6: 4 };
  const ch = chMap[colorType];
  if (!ch) throw new Error(`Unsupported PNG color type: ${colorType}`);
  const raw    = inflateSync(Buffer.concat(idatChunks));
  const stride = width * ch;
  const pixels = Buffer.alloc(height * stride);
  let rawPos = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[rawPos++];
    const src  = raw.subarray(rawPos, rawPos + stride); rawPos += stride;
    const dst  = pixels.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? pixels.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? dst[x - ch] : 0;
      const b = prev ? prev[x] : 0;
      const c = (x >= ch && prev) ? prev[x - ch] : 0;
      let val;
      switch (filter) {
        case 0: val = src[x]; break;
        case 1: val = (src[x] + a) & 0xff; break;
        case 2: val = (src[x] + b) & 0xff; break;
        case 3: val = (src[x] + Math.floor((a + b) / 2)) & 0xff; break;
        case 4: val = (src[x] + paeth(a, b, c)) & 0xff; break;
        default: throw new Error(`Unknown PNG filter: ${filter}`);
      }
      dst[x] = val;
    }
  }
  return { width, height, ch, stride, pixels };
}

// ── 픽셀 읽기 ────────────────────────────────────────────────────
function getPixel(img, px, py) {
  const x   = Math.max(0, Math.min(img.width  - 1, px));
  const y   = Math.max(0, Math.min(img.height - 1, py));
  const off = y * img.stride + x * img.ch;
  const r   = img.pixels[off];
  const g   = img.ch >= 3 ? img.pixels[off + 1] : r;
  const b   = img.ch >= 3 ? img.pixels[off + 2] : r;
  const a   = img.ch === 4 ? img.pixels[off + 3]
              : img.ch === 2 ? img.pixels[off + 1] : 255;
  return [r, g, b, a];
}

// ── 박스 필터 (area averaging) — 축소 시 선명 ──────────────────
// sx,sy: 소스 시작 좌표(실수), sw,sh: 소스 샘플링 크기
function sampleBox(img, sx, sy, sw, sh) {
  const x0 = Math.floor(sx);
  const y0 = Math.floor(sy);
  const x1 = Math.ceil(sx + sw);
  const y1 = Math.ceil(sy + sh);
  let sumR = 0, sumG = 0, sumB = 0, sumA = 0, total = 0;
  for (let py = y0; py < y1; py++) {
    const wy = Math.min(py + 1, sy + sh) - Math.max(py, sy);
    for (let px = x0; px < x1; px++) {
      const wx = Math.min(px + 1, sx + sw) - Math.max(px, sx);
      const w  = wx * wy;
      const [r, g, b, a] = getPixel(img, px, py);
      sumR += r * w; sumG += g * w; sumB += b * w; sumA += a * w;
      total += w;
    }
  }
  if (total <= 0) return [0, 0, 0, 0];
  return [sumR / total, sumG / total, sumB / total, sumA / total];
}

// ── 캔버스에 PNG 그리기 (알파 블렌딩) ─────────────────────────
// tintWhite=true → 로고를 흰색으로 변환 (사이드바용)
// srcCropY: 소스에서 시작할 Y 비율 (0~1), 위에서 일부만 사용 시
function drawImage(img, canvas, cW, cH, dstX, dstY, dstW, dstH,
                   { tintWhite = false, srcCropY0 = 0, srcCropY1 = 1 } = {}) {
  const scaleX  = img.width  / dstW;
  const srcH    = img.height * (srcCropY1 - srcCropY0);
  const scaleY  = srcH / dstH;
  for (let y = 0; y < dstH; y++) {
    for (let x = 0; x < dstW; x++) {
      const cx = dstX + x; const cy = dstY + y;
      if (cx < 0 || cx >= cW || cy < 0 || cy >= cH) continue;
      const sx = x * scaleX;
      const sy = img.height * srcCropY0 + y * scaleY;
      let [r, g, b, a] = sampleBox(img, sx, sy, scaleX, scaleY);

      if (tintWhite) {
        // 알파 채널 있으면 그대로 사용, 없으면 밝기 역변환
        if (img.ch === 4) {
          // 소스가 RGBA: 알파 유지, 색상을 흰색으로
          // 추가로 어두운 색도 흰색으로 처리 (청록 로고 → 흰색)
        } else {
          // RGB: 밝기가 낮을수록 로고 픽셀 → 불투명 흰색
          const lum  = 0.299 * r + 0.587 * g + 0.114 * b;
          const mask = Math.max(0, 220 - lum) / 220;
          a = Math.min(255, mask * a * 1.4);
        }
        r = g = b = 255;
      }

      const idx   = (cy * cW + cx) * 4;
      const alpha = a / 255;
      canvas[idx]   = canvas[idx]   * (1 - alpha) + r * alpha;
      canvas[idx+1] = canvas[idx+1] * (1 - alpha) + g * alpha;
      canvas[idx+2] = canvas[idx+2] * (1 - alpha) + b * alpha;
    }
  }
}

// ── 직사각형 채우기 ──────────────────────────────────────────────
function fillRect(canvas, cW, x0, y0, x1, y1, color) {
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const idx = (y * cW + x) * 4;
      canvas[idx] = color[0]; canvas[idx+1] = color[1]; canvas[idx+2] = color[2];
    }
  }
}

// ── 세로 그라디언트 ──────────────────────────────────────────────
function fillGradientV(canvas, cW, x0, y0, x1, y1, colorTop, colorBot) {
  const range = Math.max(1, y1 - y0 - 1);
  for (let y = y0; y < y1; y++) {
    const t = (y - y0) / range;
    const c = colorTop.map((v, i) => v + (colorBot[i] - v) * t);
    for (let x = x0; x < x1; x++) {
      const idx = (y * cW + x) * 4;
      canvas[idx] = c[0]; canvas[idx+1] = c[1]; canvas[idx+2] = c[2];
    }
  }
}

// ── 24-bit BMP 출력 ──────────────────────────────────────────────
function writeBMP(canvas, width, height, outPath) {
  const rowStride = Math.ceil((width * 3) / 4) * 4;
  const pixBytes  = rowStride * height;
  const buf = Buffer.alloc(54 + pixBytes, 0);
  buf[0] = 0x42; buf[1] = 0x4d;
  buf.writeUInt32LE(54 + pixBytes, 2);
  buf.writeUInt32LE(54, 10);
  buf.writeUInt32LE(40, 14);
  buf.writeInt32LE(width,  18);
  buf.writeInt32LE(height, 22);
  buf.writeUInt16LE(1, 26);
  buf.writeUInt16LE(24, 28);
  buf.writeUInt32LE(pixBytes, 34);
  buf.writeInt32LE(2835, 38);
  buf.writeInt32LE(2835, 42);
  for (let fy = 0; fy < height; fy++) {
    const ly = height - 1 - fy; // BMP는 하단부터
    for (let x = 0; x < width; x++) {
      const idx = (ly * width + x) * 4;
      const r = Math.max(0, Math.min(255, Math.round(canvas[idx])));
      const g = Math.max(0, Math.min(255, Math.round(canvas[idx+1])));
      const b = Math.max(0, Math.min(255, Math.round(canvas[idx+2])));
      const off = 54 + fy * rowStride + x * 3;
      buf[off] = b; buf[off+1] = g; buf[off+2] = r;
    }
  }
  writeFileSync(outPath, buf);
}

function makeCanvas(w, h, bg) {
  const c = new Float32Array(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    c[i*4]   = bg[0]; c[i*4+1] = bg[1]; c[i*4+2] = bg[2]; c[i*4+3] = 255;
  }
  return c;
}

// ─────────────────────────────────────────────────────────────────
try { mkdirSync(BUILD, { recursive: true }); } catch {}

console.log('로고 PNG 로드 중...');
// logoFull: 심볼(UFO 아이콘) + "지음과깃듬" 텍스트
// logoText: "지음과깃듬" 텍스트만 (가로형)
const logoFull = decodePNG(join(DIST, 'KakaoTalk_20260426_224715938.png'));
const logoText = decodePNG(join(DIST, 'KakaoTalk_20260426_224715938_01.png'));
console.log(`  심볼+텍스트: ${logoFull.width}×${logoFull.height}`);
console.log(`  텍스트 전용: ${logoText.width}×${logoText.height}`);

// ════════════════════════════════════════════════════════════════
// 1. 헤더 이미지: 150 × 57
//    레이아웃:
//      청록 그라디언트 배경 (사이드바와 동일한 색상 계열)
//      → Windows 컨트롤 테두리가 어두운 배경에 묻혀 보이지 않음
//      오른쪽에 전체 로고(심볼+텍스트) 흰색으로
// ════════════════════════════════════════════════════════════════
{
  const W = 150, H = 57;
  const canvas = makeCanvas(W, H, TEAL);

  // 배경: 좌→우 수평 그라디언트 (좌측 밝게, 우측 어둡게)
  for (let x = 0; x < W; x++) {
    const t = x / (W - 1);
    const c = TEAL_LT.map((v, i) => v + (TEAL_DK[i] - v) * t);
    for (let y = 0; y < H; y++) {
      const idx = (y * W + x) * 4;
      canvas[idx] = c[0]; canvas[idx+1] = c[1]; canvas[idx+2] = c[2];
    }
  }

  // 상단 1px 밝은 하이라이트 선
  for (let x = 0; x < W; x++) {
    const t = x / (W - 1);
    const base = TEAL_LT.map((v, i) => v + (TEAL_DK[i] - v) * t);
    const hl = base.map(c => Math.min(255, c + 40));
    const idx = x * 4;
    canvas[idx] = hl[0]; canvas[idx+1] = hl[1]; canvas[idx+2] = hl[2];
  }

  // 전체 로고(심볼+텍스트)를 흰색으로, 세로 중앙 배치
  const logoAspect = logoFull.width / logoFull.height;
  const logoH = H - 12;  // 상하 여백 6px씩
  const logoW = Math.round(logoH * logoAspect);
  const logoX = Math.floor((W - logoW) / 2);  // 가로 중앙
  const logoY = 6;
  drawImage(logoFull, canvas, W, H, logoX, logoY, logoW, logoH, { tintWhite: true });

  writeBMP(canvas, W, H, join(BUILD, 'installer-header.bmp'));
  console.log(`✓ installer-header.bmp  (${W}×${H})`);
  console.log(`  전체 로고(흰색): ${logoW}×${logoH}px @ (${logoX},${logoY})`);
}

// ════════════════════════════════════════════════════════════════
// 2. 사이드바 이미지: 164 × 314
//    레이아웃:
//      [상] 청록 그라디언트 배경
//      [중] 심볼만 (상단 60% 크롭) 크게 흰색으로
//      [하] "지음과깃듬" 텍스트 로고 흰색으로 (한 번만)
//      [최하] 저작권 문구 없음 — 깔끔하게
// ════════════════════════════════════════════════════════════════
{
  const W = 164, H = 314;
  const canvas = makeCanvas(W, H, TEAL);

  // 배경 그라디언트
  fillGradientV(canvas, W, 0, 0, W, H, TEAL_LT, TEAL_DK);

  // 좌측 세로 하이라이트 (1px 밝은 선)
  for (let y = 0; y < H; y++) {
    const t   = y / (H - 1);
    const bg  = TEAL_LT.map((v, i) => v + (TEAL_DK[i] - v) * t);
    const hl  = bg.map(c => Math.min(255, c + 35));
    const idx = (y * W) * 4;
    canvas[idx] = hl[0]; canvas[idx+1] = hl[1]; canvas[idx+2] = hl[2];
  }

  // ── 심볼 (logoFull 상단 45%만 크롭 = 아이콘 부분) ─────────────
  // 로고는 [심볼 아이콘 45%] + [텍스트 55%] 구조로 추정
  // 심볼만 크게 표시
  const symCropY1 = 0.50; // 상단 50%만 사용
  const symW = 118;
  const symCropH   = logoFull.height * symCropY1;
  const symAspect  = logoFull.width / symCropH;
  const symH = Math.round(symW / symAspect);
  const symX = Math.floor((W - symW) / 2);
  const symY = 28;
  drawImage(logoFull, canvas, W, H, symX, symY, symW, symH,
            { tintWhite: true, srcCropY0: 0, srcCropY1: symCropY1 });

  // ── 구분선 ─────────────────────────────────────────────────────
  const sepY = symY + symH + 22;
  for (let x = 24; x < W - 24; x++) {
    const idx = (sepY * W + x) * 4;
    const t = (sepY) / (H - 1);
    const bg = TEAL_LT.map((v, i) => v + (TEAL_DK[i] - v) * t);
    canvas[idx]   = bg[0] + (255 - bg[0]) * 0.30;
    canvas[idx+1] = bg[1] + (255 - bg[1]) * 0.30;
    canvas[idx+2] = bg[2] + (255 - bg[2]) * 0.30;
  }

  // ── 텍스트 로고 (한 번만, 심볼 아래) ─────────────────────────
  const txtMaxW = 132;
  const txtAspect = logoText.width / logoText.height;
  const txtW = txtMaxW;
  const txtH = Math.round(txtW / txtAspect);
  const txtX = Math.floor((W - txtW) / 2);
  const txtY = sepY + 16;
  drawImage(logoText, canvas, W, H, txtX, txtY, txtW, txtH, { tintWhite: true });

  writeBMP(canvas, W, H, join(BUILD, 'installer-sidebar.bmp'));
  // 언인스톨러도 동일 이미지 사용 (electron-builder.yml 에서 uninstallerSidebar로 지정)
  writeFileSync(join(BUILD, 'installer-sidebar.bmp'),
    readFileSync(join(BUILD, 'installer-sidebar.bmp')));

  console.log(`✓ installer-sidebar.bmp (${W}×${H})`);
  console.log(`  심볼: ${symW}×${symH}px @ (${symX},${symY})`);
  console.log(`  텍스트: ${txtW}×${txtH}px @ (${txtX},${txtY})`);
}

console.log('\n완료! npm run electron:build 로 설치 파일을 만들면 반영됩니다.');
