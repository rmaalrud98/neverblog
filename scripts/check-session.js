// 저장된 네이버 로그인 세션이 아직 살아있는지 확인한다.
// 매일 자동 실행 루틴이 글을 쓰기 전에 먼저 이 스크립트로 점검하는 것을 권장.
//
// 종료 코드: 0 = 세션 유효, 1 = 세션 없음/만료, 2 = 확인 중 오류

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { launchBrowser } = require('./lib/browser');
const { resolveStorageStatePath } = require('./lib/session');

const headed = process.argv.includes('--headed');
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

  const browser = await launchBrowser({ headless: !headed });
  try {
    const context = await browser.newContext({ storageState: storageStatePath, locale: 'ko-KR' });
    const page = await context.newPage();
    await page.goto('https://www.naver.com', { waitUntil: 'domcontentloaded', timeout: 30000 });
    if (headed) await page.waitForTimeout(3000); // 눈으로 확인할 시간

    const loggedIn = await page
      .locator('#account, [class*="MyView-module__nickname"], a[href*="logout"]')
      .first()
      .isVisible({ timeout: 5000 })
      .catch(() => false);

    if (loggedIn) {
      console.log('[check-session] OK: 로그인 세션이 유효합니다.');
      process.exit(0);
    } else {
      fs.mkdirSync(debugDir, { recursive: true });
      await page.screenshot({ path: debugShot, fullPage: true }).catch(() => {});
      console.error(
        '[check-session] 세션이 만료된 것 같습니다. 로컬 PC에서 `npm run login-setup` 을 다시 실행해 세션을 갱신하세요.\n' +
          `   (지금 어떤 화면이었는지 스크린샷을 저장했습니다: ${debugShot})`
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
