// posts/<날짜>.json 을 읽어서 글마다 이미지 카드 여러 장을 생성하고,
// 각 post 객체에 "images" 배열(로컬 파일 경로)을 추가해 파일에 다시 저장한다.
// post-drafts.js 는 이 images 배열을 보고 본문에 이미지를 삽입한다.
//
// 사용법: node scripts/generate-images.js posts/2026-08-25.json

const fs = require('fs');
const path = require('path');
const { generateCard } = require('./lib/images');
const { launchBrowser } = require('./lib/browser');

function pad2(n) {
  return String(n).padStart(2, '0');
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

      // 카드 0번 = 제목(썸네일용), 이후 = 소제목마다 하나씩.
      // 최소 5장을 보장하기 위해 부족하면 제목 카드를 반복해서 채운다.
      const cardTexts = [post.title, ...headings];
      while (cardTexts.length < 5) cardTexts.push(post.title);

      const images = [];
      for (let j = 0; j < cardTexts.length; j++) {
        const outPath = path.join(outDir, `img-${pad2(j + 1)}.png`);
        await generateCard({
          text: cardTexts[j],
          label: post.category || null,
          outPath,
          browser,
        });
        images.push(outPath);
      }

      post.images = images;
      console.log(`[generate-images] post #${i + 1} "${post.title}" → 이미지 ${images.length}장 생성`);
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
