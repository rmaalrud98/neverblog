// Pexels 무료 스톡포토 API에서 썸네일 배경으로 쓸 실제 사진을 가져온다.
// https://www.pexels.com/api/ 에서 무료 회원가입만 하면 즉시 API 키 발급됨
// (신용카드 필요 없음, 시간당 200회 요청까지 무료).
// .env 에 PEXELS_API_KEY=xxx 로 등록하면 자동으로 쓰인다. 키가 없으면
// null을 반환하고, 호출 쪽(generateThumbnail)이 자체 일러스트 배경으로
// 대체한다 — 이 기능은 있으면 좋고 없어도 동작에 지장 없는 부가 기능이다.

const fs = require('fs');
const path = require('path');

/**
 * @param {string} query 영어 검색어 (Pexels는 한글 검색 지원이 약함)
 * @param {string} outPath 저장할 로컬 파일 경로
 * @returns {Promise<string|null>} 성공하면 outPath, 실패하면 null
 */
async function fetchStockPhoto(query, outPath) {
  const apiKey = process.env.PEXELS_API_KEY;
  if (!apiKey || !apiKey.trim()) return null;

  try {
    const searchUrl = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=1&orientation=landscape`;
    const res = await fetch(searchUrl, { headers: { Authorization: apiKey } });
    if (!res.ok) {
      console.warn(`  ↳ [경고] Pexels 검색 실패 (HTTP ${res.status}): "${query}"`);
      return null;
    }
    const data = await res.json();
    const photo = data.photos && data.photos[0];
    if (!photo) {
      console.warn(`  ↳ [경고] Pexels 검색 결과 없음: "${query}"`);
      return null;
    }
    const imgUrl = photo.src.large2x || photo.src.large || photo.src.original;
    const imgRes = await fetch(imgUrl);
    if (!imgRes.ok) return null;
    const buf = Buffer.from(await imgRes.arrayBuffer());
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, buf);
    return outPath;
  } catch (err) {
    console.warn(`  ↳ [경고] 스톡포토 다운로드 실패: ${err.message}`);
    return null;
  }
}

module.exports = { fetchStockPhoto };
