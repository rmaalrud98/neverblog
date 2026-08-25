// ⚠️ 이 스크립트는 "본인 PC(로컬 컴퓨터)"에서 실행하세요.
// 이 저장소를 실행 중인 클라우드/원격 환경에는 화면(디스플레이)이 없고,
// 네이버가 자동화 도구의 로그인 자체를 차단할 가능성이 높기 때문에
// 로그인만큼은 사람이 직접, 실제로 쓰는 PC/네트워크에서 처리해야 합니다.
//
// 사용법:
//   1) 로컬 PC에 이 저장소를 clone 하고 `npm install` (playwright는
//      브라우저까지 자동 설치됨: `npx playwright install chromium`)
//   2) `npm run login-setup` 실행
//   3) 열리는 브라우저 창에서 평소처럼 네이버에 로그인 (2단계 인증 포함,
//      "로그인 상태 유지" 체크 권장)
//   4) 로그인이 끝나면 터미널로 돌아와 Enter
//   5) .auth/naver-storage-state.json 이 생성됨 + base64 문자열이 출력됨
//   6) 그 base64 문자열을 클라우드 환경의 환경변수 NAVER_STORAGE_STATE_B64 로 등록
//      (Claude Code 웹 환경 설정 > Environment variables)
//
// 세션은 시간이 지나면 만료될 수 있습니다. 매일 자동 실행이 로그인 만료로
// 실패하면 이 스크립트를 다시 실행해 새 값으로 환경변수를 갱신하세요.

const readline = require('readline');
const { chromium } = require('playwright');
const { saveStorageState } = require('./lib/session');

function waitForEnter(prompt) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(prompt, () => { rl.close(); resolve(); }));
}

(async () => {
  console.log('브라우저를 여는 중... (headless=false, 로컬 PC 전용)');
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ locale: 'ko-KR' });
  const page = await context.newPage();

  await page.goto('https://nid.naver.com/nidlogin.login', { waitUntil: 'domcontentloaded' });

  console.log('\n브라우저 창에서 네이버 아이디로 로그인해주세요.');
  console.log('(캡차/2단계 인증이 뜨면 평소처럼 직접 처리하시면 됩니다)');
  await waitForEnter('로그인을 완료했으면 이 터미널에서 Enter를 누르세요...\n');

  // 로그인 확인: 네이버 메인으로 이동해 로그아웃 링크/닉네임 요소가 보이는지 체크
  await page.goto('https://www.naver.com', { waitUntil: 'domcontentloaded' });
  const loggedIn = await page
    .locator('#account, [class*="MyView-module__nickname"], a[href*="logout"]')
    .first()
    .isVisible()
    .catch(() => false);

  if (!loggedIn) {
    console.warn('\n⚠️ 로그인 상태를 자동으로 확인하지 못했습니다. 그래도 세션은 저장합니다.');
    console.warn('   (오탐일 수 있습니다 — check-session.js 로 다시 확인해보세요)');
  } else {
    console.log('\n로그인 확인됨 ✅');
  }

  const { path: savedPath, base64 } = await saveStorageState(context);
  await browser.close();

  console.log(`\n세션 저장 완료: ${savedPath}`);
  console.log('\n아래 base64 문자열을 클라우드 환경 변수 NAVER_STORAGE_STATE_B64 에 등록하세요:');
  console.log('----- BEGIN NAVER_STORAGE_STATE_B64 -----');
  console.log(base64);
  console.log('----- END NAVER_STORAGE_STATE_B64 -----');
})().catch((err) => {
  console.error('로그인 셋업 중 오류:', err);
  process.exit(1);
});
