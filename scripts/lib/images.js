// 블로그 글에 넣을 이미지들을 생성/캡처한다.
//
// - generateThumbnail: 썸네일(대표 이미지) 1장. 배경 일러스트 + 큰 텍스트.
//   유일하게 "텍스트가 크게 들어가는" 이미지 — 나머지는 텍스트 카드가 아니다.
// - generateBarChart / generateLineChart: 실제 수치로 그리는 도표/그래프.
// - generateStatCard: 차트로 그릴 수치가 없을 때의 최소한의 대체용
//   (반복되는 카드뉴스 느낌을 피하려고 큰 숫자 하나 + 짧은 설명만 담는다).
// - captureScreenshot: 신뢰할 수 있는 공식 출처 페이지를 실제로 캡처.
//   (미드저니/ImageFX 같은 이미지 생성 서비스는 스크립트로 호출 가능한
//   공개 API가 없어서 자동화에 못 쓴다 — 대신 실제 출처 페이지 캡처로 대체)

const fs = require('fs');
const path = require('path');

const PALETTES = [
  { bg1: '#667eea', bg2: '#764ba2', text: '#ffffff', accent: '#a3b1ff' },
  { bg1: '#0f2027', bg2: '#2c5364', text: '#ffffff', accent: '#4dd0e1' },
  { bg1: '#1e3c72', bg2: '#2a5298', text: '#ffffff', accent: '#7fd8ff' },
  { bg1: '#232526', bg2: '#414345', text: '#ffffff', accent: '#ffd54f' },
  { bg1: '#3a1c71', bg2: '#d76d77', text: '#ffffff', accent: '#ffe08a' },
  { bg1: '#134e5e', bg2: '#71b280', text: '#ffffff', accent: '#d9f2b4' },
];

function pickPalette(seed) {
  let h = 0;
  for (const ch of String(seed)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTES[h % PALETTES.length];
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function renderHtml(html, { width, height, outPath, browser }) {
  const page = await browser.newPage({ viewport: { width, height } });
  try {
    await page.setContent(html, { waitUntil: 'load' });
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    await page.screenshot({ path: outPath });
  } finally {
    await page.close();
  }
}

/** 스카이라인 실루엣 + 상승 그래프 라인 + 동전을 SVG로 그려서 "배경 이미지" 느낌을 낸다. */
function sceneSvg(width, height, palette) {
  const buildings = [];
  const n = 9;
  const bw = width / n;
  let seed = 7;
  const rand = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
  for (let i = 0; i < n; i++) {
    const h = height * (0.18 + rand() * 0.32);
    buildings.push(`<rect x="${i * bw}" y="${height - h}" width="${bw - 6}" height="${h}" fill="#000" opacity="0.28" />`);
  }
  const points = [];
  for (let i = 0; i <= 6; i++) {
    const x = (width / 6) * i;
    const y = height * 0.72 - Math.pow(i, 1.4) * (height * 0.02);
    points.push(`${x},${y}`);
  }
  const coins = [0.15, 0.35, 0.62, 0.8].map((f, i) => {
    const cx = width * f;
    const cy = height * (0.2 + (i % 2) * 0.08);
    return `<circle cx="${cx}" cy="${cy}" r="18" fill="${palette.accent}" opacity="0.55" />`;
  });
  return `
  <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
    ${coins.join('\n')}
    ${buildings.join('\n')}
    <polyline points="${points.join(' ')}" fill="none" stroke="${palette.accent}" stroke-width="5" opacity="0.7" />
    <circle cx="${points[points.length - 1].split(',')[0]}" cy="${points[points.length - 1].split(',')[1]}" r="7" fill="${palette.accent}" />
  </svg>`;
}

/**
 * 로컬 이미지 파일을 base64 data URI로 변환한다.
 * page.setContent()로 그린 HTML은 about:blank 출처라서 file:// 로컬 파일
 * 참조가 크롬 보안 정책에 막힌다 (실사용 중 확인됨 — 배경이 그냥 회색으로
 * 나오는 문제였음). data URI로 직접 심으면 이 문제가 없다.
 */
function imageToDataUri(filePath) {
  const buf = fs.readFileSync(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const mime = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' }[ext] || 'image/jpeg';
  return `data:${mime};base64,${buf.toString('base64')}`;
}

/** 제목을 자연스러운 지점(쉼표 등)에서 최대 두 줄로 나눈다. */
function splitTitleLines(title) {
  const commaIdx = title.indexOf(',');
  if (commaIdx > 0 && commaIdx < title.length - 1) {
    return [title.slice(0, commaIdx + 1).trim(), title.slice(commaIdx + 1).trim()];
  }
  const words = title.split(' ');
  if (words.length <= 3) return [title];
  const mid = Math.ceil(words.length / 2);
  return [words.slice(0, mid).join(' '), words.slice(mid).join(' ')];
}

function fontSizeForLines(lines) {
  const longest = Math.max(...lines.map((l) => l.length));
  return longest > 18 ? 40 : longest > 12 ? 50 : 58;
}

/** "@블로그아이디" 를 우측 하단에 작게 한 번만 표시하는 워터마크. */
function watermarkHtml(text) {
  return `<div class="wm">${escapeHtml(text)}</div>`;
}

/**
 * 썸네일(대표 이미지) 생성. 유일하게 큰 텍스트가 들어가는 이미지.
 * - backgroundImagePath 가 있으면 실제 사진(스톡포토)을 배경으로 쓰고,
 *   없으면 자체 그린 일러스트(스카이라인/그래프/동전)로 대체한다.
 * - 텍스트는 검정/주황 배경 박스에 굵은 글씨로 두 줄까지 표시한다
 *   (참고 예시 블로그의 실제 썸네일 스타일).
 * - watermark(예: "@블로그아이디")를 지정하면 우측 하단에 작게 한 번 표시한다.
 * - 기본 비율은 1:1 정사각형 (참고 예시 블로그의 실제 썸네일 비율).
 */
async function generateThumbnail({ title, category, outPath, width = 1080, height = 1080, browser, backgroundImagePath, watermark }) {
  const palette = pickPalette(title);
  const hasPhoto = backgroundImagePath && fs.existsSync(backgroundImagePath);
  const bgStyle = hasPhoto
    ? `background-image: linear-gradient(180deg, rgba(0,0,0,0.08), rgba(0,0,0,0.6) 78%), url("${imageToDataUri(backgroundImagePath)}"); background-size: cover; background-position: center;`
    : `background: linear-gradient(160deg, ${palette.bg1}, ${palette.bg2});`;

  const lines = splitTitleLines(title);
  const fontSize = fontSizeForLines(lines);
  const lineHtml = lines
    .map((line, i) => {
      const isFirst = i % 2 === 0;
      const bg = isFirst ? '#0a0a0a' : '#ff5a36';
      const color = isFirst ? '#ffffff' : '#0a0a0a';
      return `<span class="line" style="background:${bg}; color:${color};">${escapeHtml(line)}</span>`;
    })
    .join('<br/>');

  const html = `<!doctype html>
<html><head><meta charset="utf-8"><style>
  * { margin:0; padding:0; box-sizing:border-box; }
  html, body { width:${width}px; height:${height}px; }
  body {
    font-family:"Malgun Gothic","맑은 고딕","Apple SD Gothic Neo","Nanum Gothic","NanumGothic",sans-serif;
    position:relative; overflow:hidden;
    ${bgStyle}
  }
  .scene { position:absolute; inset:0; }
  .wm { position:absolute; right:4%; bottom:3%; color:#fff; opacity:0.55; font-size:20px;
    font-weight:600; white-space:nowrap; text-shadow:0 1px 5px rgba(0,0,0,0.6); }
  .content { position:absolute; left:0; right:0; bottom:8%; padding:0 6%; }
  .cat {
    display:inline-block; font-size:22px; font-weight:700; color:#fff;
    background:rgba(0,0,0,0.45); padding:7px 20px; border-radius:999px;
    margin-bottom:18px; letter-spacing:0.5px;
  }
  .line {
    display:inline-block; font-size:${fontSize}px; font-weight:800;
    padding:10px 16px; line-height:1.35;
    box-decoration-break: clone; -webkit-box-decoration-break: clone;
  }
</style></head>
<body>
  ${hasPhoto ? '' : `<div class="scene">${sceneSvg(width, height, palette)}</div>`}
  ${watermark ? watermarkHtml(watermark) : ''}
  <div class="content">
    ${category ? `<div class="cat">${escapeHtml(category)}</div><br/>` : ''}
    ${lineHtml}
  </div>
</body></html>`;
  await renderHtml(html, { width, height, outPath, browser });
}

/** 텍스트 없이 숫자/제목 정도만 담는 최소한의 대체 카드 (차트로 그릴 데이터가 없을 때만 사용). */
async function generateStatCard({ value, caption, outPath, width = 900, height = 600, browser }) {
  const palette = pickPalette(value + caption);
  const html = `<!doctype html>
<html><head><meta charset="utf-8"><style>
  * { margin:0; padding:0; box-sizing:border-box; }
  html, body { width:${width}px; height:${height}px; }
  body {
    font-family:"Malgun Gothic","맑은 고딕","Apple SD Gothic Neo","Nanum Gothic","NanumGothic",sans-serif;
    background:#f7f8fb; display:flex; align-items:center; justify-content:center; flex-direction:column;
  }
  .value { font-size:96px; font-weight:800; color:${palette.bg2}; }
  .caption { margin-top:18px; font-size:30px; font-weight:600; color:#333; text-align:center; padding:0 8%; word-break:keep-all; }
  .bar { width:120px; height:8px; border-radius:99px; margin-top:26px; background: linear-gradient(90deg, ${palette.bg1}, ${palette.bg2}); }
</style></head>
<body>
  <div class="value">${escapeHtml(value)}</div>
  <div class="bar"></div>
  <div class="caption">${escapeHtml(caption)}</div>
</body></html>`;
  await renderHtml(html, { width, height, outPath, browser });
}

/**
 * 실제 수치로 막대그래프를 그린다.
 * @param {{ title: string, labels: string[], values: number[], unit?: string, outPath: string, browser: any }} opts
 */
async function generateBarChart({ title, labels, values, unit = '', outPath, width = 900, height = 650, browser }) {
  const palette = pickPalette(title);
  const max = Math.max(...values, 0.0001);
  const chartW = width * 0.8;
  const chartH = height * 0.55;
  const chartX = (width - chartW) / 2;
  const chartY = height * 0.28;
  const n = values.length;
  const gap = chartW / n;
  const barW = Math.min(90, gap * 0.5);
  const bars = values
    .map((v, i) => {
      const h = (v / max) * chartH;
      const x = chartX + gap * i + (gap - barW) / 2;
      const y = chartY + chartH - h;
      return `
      <rect x="${x}" y="${y}" width="${barW}" height="${h}" rx="8" fill="${i === n - 1 ? palette.bg2 : palette.bg1}" />
      <text x="${x + barW / 2}" y="${y - 14}" font-size="26" font-weight="700" text-anchor="middle" fill="#222">${escapeHtml(v)}${escapeHtml(unit)}</text>
      <text x="${x + barW / 2}" y="${chartY + chartH + 34}" font-size="22" text-anchor="middle" fill="#555">${escapeHtml(labels[i] ?? '')}</text>`;
    })
    .join('\n');
  const html = `<!doctype html>
<html><head><meta charset="utf-8"><style>
  * { margin:0; padding:0; box-sizing:border-box; }
  html, body { width:${width}px; height:${height}px; background:#fff; }
  body { font-family:"Malgun Gothic","맑은 고딕","Apple SD Gothic Neo","Nanum Gothic","NanumGothic",sans-serif; }
  .title { text-align:center; font-size:32px; font-weight:800; color:#222; padding-top:36px; word-break:keep-all; }
</style></head>
<body>
  <div class="title">${escapeHtml(title)}</div>
  <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <line x1="${chartX}" y1="${chartY + chartH}" x2="${chartX + chartW}" y2="${chartY + chartH}" stroke="#ddd" stroke-width="2" />
    ${bars}
  </svg>
</body></html>`;
  await renderHtml(html, { width, height, outPath, browser });
}

/**
 * 실제 수치로 꺾은선 그래프를 그린다 (추이를 보여줄 때).
 * @param {{ title: string, labels: string[], values: number[], unit?: string, outPath: string, browser: any }} opts
 */
async function generateLineChart({ title, labels, values, unit = '', outPath, width = 900, height = 650, browser }) {
  const palette = pickPalette(title);
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  const chartW = width * 0.78;
  const chartH = height * 0.5;
  const chartX = (width - chartW) / 2;
  const chartY = height * 0.28;
  const n = values.length;
  const step = n > 1 ? chartW / (n - 1) : 0;
  const pts = values.map((v, i) => {
    const x = chartX + step * i;
    const y = chartY + chartH - ((v - min) / range) * chartH;
    return { x, y, v };
  });
  const polyline = pts.map((p) => `${p.x},${p.y}`).join(' ');
  const dots = pts
    .map(
      (p, i) => `
      <circle cx="${p.x}" cy="${p.y}" r="7" fill="${palette.bg2}" />
      <text x="${p.x}" y="${p.y - 18}" font-size="24" font-weight="700" text-anchor="middle" fill="#222">${escapeHtml(p.v)}${escapeHtml(unit)}</text>
      <text x="${p.x}" y="${chartY + chartH + 34}" font-size="22" text-anchor="middle" fill="#555">${escapeHtml(labels[i] ?? '')}</text>`
    )
    .join('\n');
  const html = `<!doctype html>
<html><head><meta charset="utf-8"><style>
  * { margin:0; padding:0; box-sizing:border-box; }
  html, body { width:${width}px; height:${height}px; background:#fff; }
  body { font-family:"Malgun Gothic","맑은 고딕","Apple SD Gothic Neo","Nanum Gothic","NanumGothic",sans-serif; }
  .title { text-align:center; font-size:32px; font-weight:800; color:#222; padding-top:36px; word-break:keep-all; }
</style></head>
<body>
  <div class="title">${escapeHtml(title)}</div>
  <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <line x1="${chartX}" y1="${chartY + chartH}" x2="${chartX + chartW}" y2="${chartY + chartH}" stroke="#ddd" stroke-width="2" />
    <polyline points="${polyline}" fill="none" stroke="${palette.bg1}" stroke-width="4" />
    ${dots}
  </svg>
</body></html>`;
  await renderHtml(html, { width, height, outPath, browser });
}

/**
 * 실제 웹페이지(공식 출처)를 캡처한다. 정부/기관 발표 페이지처럼 출처가
 * 분명하고 공개적으로 안내된 콘텐츠에만 쓴다 (뉴스 기사 이미지, 인물
 * 사진 등은 저작권 문제가 있으니 쓰지 않는다 — DAILY_WORKFLOW.md 참고).
 * 네트워크 문제나 페이지 구조 문제로 실패할 수 있어 항상 best-effort로
 * 다루고, 실패하면 false를 반환한다 (호출 쪽에서 대체 이미지로 폴백).
 *
 * @param {{ url: string, outPath: string, selector?: string, browser: any }} opts
 */
async function captureScreenshot({ url, outPath, selector, browser, width = 1200, height = 900 }) {
  const page = await browser.newPage({ viewport: { width, height } });
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(1500);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    if (selector) {
      const el = page.locator(selector).first();
      if (await el.isVisible({ timeout: 5000 }).catch(() => false)) {
        await el.screenshot({ path: outPath });
        return true;
      }
    }
    await page.screenshot({ path: outPath });
    return true;
  } catch (err) {
    console.warn(`  ↳ [경고] 출처 페이지 캡처 실패 (${url}): ${err.message}`);
    return false;
  } finally {
    await page.close();
  }
}

module.exports = {
  generateThumbnail,
  generateStatCard,
  generateBarChart,
  generateLineChart,
  captureScreenshot,
};
