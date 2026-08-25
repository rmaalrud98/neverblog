// 블로그 글에 넣을 텍스트 카드 이미지를 생성한다.
// 외부 이미지(뉴스 캡처 등)는 저작권/유사문서 이슈가 있어서, 대신 Playwright로
// 직접 그린 카드형 이미지를 쓴다 (완전히 새로 생성되므로 저작권/중복 이미지
// 걱정이 없다).

const fs = require('fs');
const path = require('path');

const PALETTES = [
  { bg1: '#667eea', bg2: '#764ba2', text: '#ffffff' },
  { bg1: '#f6d365', bg2: '#fda085', text: '#3a2a1a' },
  { bg1: '#5ee7df', bg2: '#b490ca', text: '#22223a' },
  { bg1: '#ff9a9e', bg2: '#fecfef', text: '#3a1a2a' },
  { bg1: '#a1c4fd', bg2: '#c2e9fb', text: '#1a2a3a' },
  { bg1: '#30cfd0', bg2: '#330867', text: '#ffffff' },
  { bg1: '#f7971e', bg2: '#ffd200', text: '#3a2a00' },
  { bg1: '#43cea2', bg2: '#185a9d', text: '#ffffff' },
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

function cardHtml(text, { palette, label, width, height }) {
  const fontSize = text.length > 40 ? 40 : text.length > 22 ? 48 : 58;
  return `<!doctype html>
<html><head><meta charset="utf-8"><style>
  * { margin:0; padding:0; box-sizing:border-box; }
  html, body { width:${width}px; height:${height}px; }
  body {
    font-family: "Malgun Gothic","맑은 고딕","Apple SD Gothic Neo","Nanum Gothic","NanumGothic",sans-serif;
    background: linear-gradient(135deg, ${palette.bg1}, ${palette.bg2});
    display:flex; align-items:center; justify-content:center;
    position:relative; overflow:hidden;
  }
  .decor { position:absolute; border-radius:50%; background:#fff; opacity:0.15; }
  .d1 { width:280px; height:280px; top:-90px; left:-90px; }
  .d2 { width:200px; height:200px; bottom:-70px; right:-50px; }
  .card { position:relative; z-index:1; width:84%; text-align:center; color:${palette.text}; }
  .label {
    display:inline-block; font-size:22px; font-weight:700;
    background:rgba(255,255,255,0.28); padding:7px 22px; border-radius:999px;
    margin-bottom:30px; letter-spacing:0.5px;
  }
  .text { font-size:${fontSize}px; font-weight:800; line-height:1.45; word-break:keep-all; white-space:pre-line; }
</style></head>
<body>
  <div class="decor d1"></div>
  <div class="decor d2"></div>
  <div class="card">
    ${label ? `<div class="label">${escapeHtml(label)}</div>` : ''}
    <div class="text">${escapeHtml(text)}</div>
  </div>
</body></html>`;
}

/**
 * @param {{ text: string, label?: string, outPath: string, width?: number,
 *   height?: number, browser: import('playwright').Browser }} opts
 */
async function generateCard({ text, label, outPath, width = 900, height = 700, browser }) {
  const palette = pickPalette(text);
  const html = cardHtml(text, { palette, label, width, height });
  const page = await browser.newPage({ viewport: { width, height } });
  try {
    await page.setContent(html, { waitUntil: 'load' });
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    await page.screenshot({ path: outPath });
  } finally {
    await page.close();
  }
}

module.exports = { generateCard };
