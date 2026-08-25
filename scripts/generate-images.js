// posts/<날짜>.json 을 읽어서 글마다 이미지를 생성/캡처하고,
// 각 post 객체에 "images" 배열(로컬 파일 경로)을 추가해 파일에 다시 저장한다.
// post-drafts.js 는 이 images 배열을 보고 본문에 이미지를 삽입한다.
//
// images[0] = 썸네일(대표 이미지, 큰 텍스트+배경 일러스트) — 항상 자동 생성.
// images[1..] = post.media 배열에 정의한 도표/그래프/출처 캡처 (소제목 개수만큼).
// media 항목이 부족하면 그 소제목은 최소한의 숫자 카드로 대체한다
// (반복되는 "카드뉴스형" 텍스트 이미지를 피하기 위함 — DAILY_WORKFLOW.md 참고).
//
// media 스펙 예시 (posts/sample.json 참고):
//   { "type": "bar",  "title": "...", "labels": [...], "values": [...], "unit": "%" }
//   { "type": "line", "title": "...", "labels": [...], "values": [...], "unit": "%" }
//   { "type": "screenshot", "url": "https://...", "selector": "선택자(선택)" }
//   { "type": "stat", "value": "2.75%", "caption": "..." }
//
// 사용법: node scripts/generate-images.js posts/2026-08-25.json

const fs = require('fs');
const path = require('path');
const images = require('./lib/images');
const { launchBrowser } = require('./lib/browser');

function pad2(n) {
  return String(n).padStart(2, '0');
}

async function generateOne(spec, outPath, browser, fallbackText) {
  try {
    switch (spec && spec.type) {
      case 'bar':
        await images.generateBarChart({ ...spec, outPath, browser });
        return true;
      case 'line':
        await images.generateLineChart({ ...spec, outPath, browser });
        return true;
      case 'screenshot':
        return await images.captureScreenshot({ ...spec, outPath, browser });
      case 'stat':
        await images.generateStatCard({ ...spec, outPath, browser });
        return true;
      default:
        // media 스펙이 없으면 소제목 텍스트를 그대로 숫자 카드 형태로 보여주는
        // 대신, 최소한의 정보 카드로만 채운다 (차트 데이터 준비를 권장).
        await images.generateStatCard({ value: '📌', caption: fallbackText, outPath, browser });
        return true;
    }
  } catch (err) {
    console.warn(`  ↳ [경고] 이미지 생성 실패 (${path.basename(outPath)}): ${err.message}`);
    return false;
  }
}

(async () => {
  const file = process.argv[2];
  if (!file || !fs.existsSync(file)) {
    console.error('사용법: node scripts/generate-images.js posts/<날짜>.json');
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
  if (!Array.isArray(data.posts)) throw new Error('posts 배열이 없습니다.');

  const dateStr = path.basename(file).replace(/\.json$/, '');
  const browser = await launchBrowser({ headless: true });
  try {
    for (let i = 0; i < data.posts.length; i++) {
      const post = data.posts[i];
      const outDir = path.join(path.dirname(file), 'images', dateStr, `post-${i + 1}`);

      const headings = (post.paragraphs || [])
        .filter((p) => typeof p === 'object' && p.heading)
        .map((p) => p.text);
      const media = Array.isArray(post.media) ? post.media : [];

      const imagePaths = [];

      // 0번: 썸네일(대표 이미지) — 유일하게 큰 텍스트가 들어가는 이미지.
      const thumbPath = path.join(outDir, 'img-00-thumb.png');
      await images.generateThumbnail({ title: post.title, category: post.category, outPath: thumbPath, browser });
      imagePaths.push(thumbPath);

      // 1번부터: 소제목 개수만큼 media 스펙(도표/그래프/캡처)을 채워 넣는다.
      const count = Math.max(headings.length, media.length, 4); // 최소 5장(썸네일 포함) 보장
      for (let j = 0; j < count; j++) {
        const outPath = path.join(outDir, `img-${pad2(j + 1)}.png`);
        const ok = await generateOne(media[j], outPath, browser, headings[j] || post.title);
        if (ok) imagePaths.push(outPath);
      }

      post.images = imagePaths;
      console.log(`[generate-images] post #${i + 1} "${post.title}" → 이미지 ${imagePaths.length}장 (썸네일 1 + 본문 ${imagePaths.length - 1})`);
    }

    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf-8');
    console.log(`[generate-images] 완료. ${file} 에 images 필드를 반영했습니다.`);
  } finally {
    await browser.close();
  }
})().catch((err) => {
  console.error('[generate-images] 처리 중 오류:', err);
  process.exit(1);
});
