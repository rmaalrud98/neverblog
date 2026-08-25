// 공통 브라우저 실행 헬퍼.
// 이 컨테이너에는 Playwright의 npm 패키지 버전과 다른 리비전의 Chromium이
// 미리 설치되어 있어(PLAYWRIGHT_BROWSERS_PATH), 자동 다운로드를 막아둔 상태다.
// 그래서 executablePath를 직접 찾아서 넘겨준다.

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

function findPreinstalledChromium() {
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  if (!fs.existsSync(base)) return null;
  const dirs = fs
    .readdirSync(base)
    .filter((d) => d.startsWith('chromium-')) // chromium_headless_shell-* 는 제외
    .sort();
  for (const d of dirs.reverse()) {
    const candidate = path.join(base, d, 'chrome-linux', 'chrome');
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

/**
 * @param {{ headless?: boolean }} opts
 */
async function launchBrowser(opts = {}) {
  const executablePath = findPreinstalledChromium();
  const launchOpts = {
    headless: opts.headless ?? true,
    args: ['--lang=ko-KR'],
  };
  if (executablePath) launchOpts.executablePath = executablePath;
  // 일부 실행 환경(예: Claude Code 원격 세션)은 아웃바운드 HTTPS가 로컬 정책
  // 프록시를 통해서만 나가도록 강제한다. Chromium은 HTTPS_PROXY 환경변수를
  // 자동으로 읽지 않으므로 있으면 명시적으로 넘겨준다.
  if (process.env.HTTPS_PROXY || process.env.https_proxy) {
    launchOpts.proxy = { server: process.env.HTTPS_PROXY || process.env.https_proxy };
  }
  return chromium.launch(launchOpts);
}

module.exports = { launchBrowser, findPreinstalledChromium };
