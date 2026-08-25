// 저장된 네이버 로그인 세션이 아직 살아있는지 확인한다.
// 매일 자동 실행 루틴이 글을 쓰기 전에 먼저 이 스크립트로 점검하는 것을 권장.
//
// 판단 방법: 네이버 홈 화면의 DOM 요소(닉네임 등)를 추측해서 보는 대신,
// 실제 post-drafts.js가 쓰는 글쓰기 페이지(blog.naver.com/{id}/postwrite)로
// 직접 들어가본다. 로그인이 안 되어 있으면 네이버가 자동으로 로그인 페이지
// (nid.naver.com)로 튕겨내므로, 최종 URL만 보면 확실하게 판단할 수 있다.
//
// 종료 코드: 0 = 세션 유효, 1 = 세션 없음/만료/설정 누락, 2 = 확인 중 오류

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { launchBrowser } = require('./lib/browser');
const { resolveStorageStatePath } = require('./lib/session');

const headed = process.argv.includes('--headed');
const blogIdArg = process.argv.find((a) => a.startsWith('--blog-id='));
const blogId = (blogIdArg && blogIdArg.split('=')[1]) || process.env.NAVER_BLOG_ID;
const debugDir = path.join(__dirname, '..', 'posts', 'debug');
const debugShot = path.join(debugDir, 'check-session.png');

(async () => {
  const storageStatePath = resolveStorageStatePath();
  if (!storageStatePath) {
    console.error(
      '[check-session] 저장된 로그인 세션이 없습니다.\n' +
        '로컬 PC에서 `npm run login-setup` 을 실행한 뒤,\n' +
        '나온 base64 값을 NAVER_STORAGE_STATE_B64 환경변수로 등록하세요.'
    );
    process.exit(1);
  }
  if (!blogId) {
    console.error(
      '[check-session] 블로그 ID가 없습니다. NAVER_BLOG_ID 환경변수(.env) 또는 --blog-id=xxx 옵션을 넘겨주세요.'
    );
    process.exit(1);
  }

  const browser = await launchBrowser({ headless: !headed });
  try {
    const context = await browser.newContext({ storageState: storageStatePath, locale: 'ko-KR' });
    const page = await context.newPage();
    await page.goto(`https://blog.naver.com/${blogId}/postwrite`, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    await page.waitForTimeout(2000); // 로그인 안 됐을 때의 리다이렉트가 끝날 시간
    if (headed) await page.waitForTimeout(3000); // 눈으로 확인할 시간

    const finalUrl = page.url();
    const redirectedToLogin = /nid\.naver\.com/i.test(finalUrl);

    if (!redirectedToLogin) {
      console.log(`[check-session] OK: 로그인 세션이 유효합니다. (${finalUrl})`);
      process.exit(0);
    } else {
      fs.mkdirSync(debugDir, { recursive: true });
      await page.screenshot({ path: debugShot, fullPage: true }).catch(() => {});
      console.error(
        '[check-session] 세션이 만료된 것 같습니다 (로그인 페이지로 리다이렉트됨: ' +
          finalUrl +
          '). 로컬 PC에서 `npm run login-setup` 을 다시 실행해 세션을 갱신하세요.\n' +
          `   (그 시점 화면을 저장했습니다: ${debugShot})`
      );
      process.exit(1);
    }
  } catch (err) {
    console.error('[check-session] 확인 중 오류:', err.message);
    process.exit(2);
  } finally {
    await browser.close();
  }
})();
