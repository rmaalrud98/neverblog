// posts/YYYY-MM-DD.json 에 있는 글들을 네이버 블로그에 "임시저장"으로만 올린다.
//
// ⚠️ 안전 원칙: 이 스크립트는 절대로 "발행/등록" 버튼을 누르지 않는다.
// 텍스트가 정확히 "저장"인 버튼만 클릭한다. 그 버튼을 못 찾으면 그 글은
// 실패로 기록하고 다음 글로 넘어간다 (추측으로 다른 버튼을 누르지 않음).
//
// 사용법: node scripts/post-drafts.js [posts/2026-08-25.json] [--blog-id=xxx] [--headed]

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { launchBrowser } = require('./lib/browser');
const { resolveStorageStatePath } = require('./lib/session');

const SAVE_BUTTON_NAMES = ['저장']; // "발행", "등록" 등은 절대 포함하지 않는다.
const CONTINUE_DIALOG_DISCARD_NAMES = ['취소', '확인']; // 로컬 자동저장 이어쓰기 팝업 / "삭제되었거나 존재하지 않는 게시물입니다" 알림 무시

function parseArgs(argv) {
  const args = { file: null, blogId: null, headed: false };
  for (const a of argv.slice(2)) {
    if (a === '--headed') args.headed = true;
    else if (a.startsWith('--blog-id=')) args.blogId = a.split('=')[1];
    else if (!a.startsWith('--')) args.file = a;
  }
  return args;
}

function defaultPostsFile() {
  const today = new Date().toISOString().slice(0, 10);
  return path.join(__dirname, '..', 'posts', `${today}.json`);
}

function loadPostsFile(file) {
  const raw = fs.readFileSync(file, 'utf-8');
  const data = JSON.parse(raw);
  if (!Array.isArray(data.posts)) throw new Error('posts 배열이 없습니다.');
  return data;
}

async function dismissContinueDraftDialog(scope) {
  for (const name of CONTINUE_DIALOG_DISCARD_NAMES) {
    const btn = scope.getByRole('button', { name, exact: true });
    if (await btn.first().isVisible({ timeout: 3000 }).catch(() => false)) {
      await btn.first().click().catch(() => {});
      return true;
    }
  }
  return false;
}

/** iframe#mainFrame 이 있으면 그 안을, 없으면 page 자체를 에디터 스코프로 반환 */
async function getEditorScope(page) {
  const frameEl = page.frameLocator('iframe#mainFrame');
  const probe = frameEl.locator('body');
  const hasFrame = await probe.isVisible({ timeout: 8000 }).catch(() => false);
  return hasFrame ? frameEl : page;
}

async function fillTitle(scope, title) {
  const candidates = [
    scope.locator('.se-title-text .se-text-paragraph'),
    scope.locator('.se-documentTitle .se-text-paragraph'),
    scope.locator('[data-a11y-title], .se-placeholder').first(),
  ];
  for (const loc of candidates) {
    if (await loc.first().isVisible({ timeout: 3000 }).catch(() => false)) {
      await loc.first().click();
      await loc.first().page().keyboard.type(title, { delay: 15 });
      return true;
    }
  }
  return false;
}

async function fillBody(scope, paragraphs) {
  const body = scope.locator('.se-main-container');
  if (!(await body.isVisible({ timeout: 5000 }).catch(() => false))) return false;
  await body.click();
  const kb = body.page().keyboard;
  for (let i = 0; i < paragraphs.length; i++) {
    const p = paragraphs[i];
    const text = typeof p === 'string' ? p : p.text;
    const heading = typeof p === 'object' && p.heading;
    await kb.type(heading ? `■ ${text}` : text, { delay: 8 });
    await kb.press('Enter');
    if (heading) await kb.press('Enter'); // 소제목 뒤 한 줄 띄우기
  }
  return true;
}

async function addTags(scope, tags) {
  if (!tags || tags.length === 0) return true;
  const tagInput = scope.locator('.tag_input, input[placeholder*="태그"]');
  const visible = await tagInput.first().isVisible({ timeout: 3000 }).catch(() => false);
  if (!visible) return false; // 발행 설정 레이어에서만 태그가 노출되는 버전일 수 있음 → 건너뜀
  for (const tag of tags) {
    await tagInput.first().click();
    await tagInput.first().page().keyboard.type(tag, { delay: 10 });
    await tagInput.first().page().keyboard.press('Enter');
  }
  return true;
}

/** "저장" 이라는 이름의 버튼만 명시적으로 클릭한다. 없으면 false. */
async function clickSaveOnly(page, scope) {
  for (const name of SAVE_BUTTON_NAMES) {
    const btn = scope.getByRole('button', { name, exact: true });
    if (await btn.first().isVisible({ timeout: 5000 }).catch(() => false)) {
      await btn.first().click();
      return true;
    }
  }
  return false;
}

async function postOneDraft(context, blogId, post, index, debugDir) {
  const page = await context.newPage();
  page.on('dialog', (d) => d.accept().catch(() => {}));
  try {
    // '/postwrite' 단독 경로는 (이전에 쓰다 만 임시글을 이어 불러오려다 실패하며)
    // "삭제되었거나 존재하지 않는 게시물입니다" 팝업과 함께 블로그 홈으로
    // 튕겨나가는 경우가 있었다. '?Redirect=Write&' 가 실제 "새 글쓰기" 진입점.
    await page.goto(`https://blog.naver.com/${blogId}?Redirect=Write&`, {
      waitUntil: 'domcontentloaded',
      timeout: 45000,
    });
    await page.waitForTimeout(1500);

    const scope = await getEditorScope(page);
    await dismissContinueDraftDialog(scope);
    await page.waitForTimeout(500);

    const titleOk = await fillTitle(scope, post.title);
    if (!titleOk) throw new Error('제목 입력란을 찾지 못했습니다 (에디터 UI 변경 가능성)');

    const bodyOk = await fillBody(scope, post.paragraphs || []);
    if (!bodyOk) throw new Error('본문 입력란을 찾지 못했습니다 (에디터 UI 변경 가능성)');

    const tagsOk = await addTags(scope, post.tags);
    if (!tagsOk) console.warn(`  ↳ [경고] 태그 입력란을 못 찾아 태그는 건너뜀 (post #${index + 1})`);

    await page.waitForTimeout(500);
    const saved = await clickSaveOnly(page, scope);
    if (!saved) throw new Error('"저장" 버튼을 찾지 못해 저장하지 않았습니다 (발행 버튼은 절대 누르지 않음)');

    await page.waitForTimeout(2000);
    const url = page.url();
    await page.close();
    return { index, title: post.title, ok: true, url };
  } catch (err) {
    const shot = path.join(debugDir, `post-${index + 1}-error.png`);
    try {
      fs.mkdirSync(debugDir, { recursive: true });
      await page.screenshot({ path: shot, fullPage: true });
    } catch (_) {}
    await page.close().catch(() => {});
    return { index, title: post.title, ok: false, error: err.message, screenshot: shot };
  }
}

(async () => {
  const args = parseArgs(process.argv);
  const file = args.file || defaultPostsFile();
  const blogId = args.blogId || process.env.NAVER_BLOG_ID;

  if (!blogId) {
    console.error('블로그 ID가 없습니다. NAVER_BLOG_ID 환경변수 또는 --blog-id=xxx 옵션을 넘겨주세요.');
    process.exit(1);
  }
  if (!fs.existsSync(file)) {
    console.error(`글 파일을 찾을 수 없습니다: ${file}`);
    process.exit(1);
  }

  const storageStatePath = resolveStorageStatePath();
  if (!storageStatePath) {
    console.error(
      '저장된 로그인 세션이 없습니다. 로컬 PC에서 `npm run login-setup` 실행 후 ' +
        'NAVER_STORAGE_STATE_B64 환경변수를 등록하세요.'
    );
    process.exit(1);
  }

  const data = loadPostsFile(file);
  const posts = data.posts.slice(0, 5); // 하루 5개 제한
  console.log(`[post-drafts] ${posts.length}개 글을 blogId=${blogId} 에 임시저장으로 올립니다.`);

  const browser = await launchBrowser({ headless: !args.headed });
  const context = await browser.newContext({ storageState: storageStatePath, locale: 'ko-KR' });
  const debugDir = path.join(__dirname, '..', 'posts', 'debug');
  const results = [];

  for (let i = 0; i < posts.length; i++) {
    console.log(`  [${i + 1}/${posts.length}] "${posts[i].title}" 작성 중...`);
    const result = await postOneDraft(context, blogId, posts[i], i, debugDir);
    results.push(result);
    console.log(result.ok ? `    ✅ 저장됨: ${result.url}` : `    ❌ 실패: ${result.error}`);
  }

  await browser.close();

  const outFile = file.replace(/\.json$/, '.result.json');
  fs.writeFileSync(outFile, JSON.stringify(results, null, 2), 'utf-8');

  const okCount = results.filter((r) => r.ok).length;
  console.log(`\n[post-drafts] 완료: ${okCount}/${results.length} 성공. 결과: ${outFile}`);
  console.log('임시저장함 확인: https://blog.naver.com/' + blogId + '?Redirect=Dlog#Redirect=Dlog');

  process.exit(okCount === results.length ? 0 : 1);
})().catch((err) => {
  console.error('[post-drafts] 처리 중 오류:', err);
  process.exit(2);
});
