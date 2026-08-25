// 네이버 로그인 세션(storage state) 로드/저장 헬퍼.
//
// 이 프로젝트는 아이디/비밀번호를 스크립트에서 직접 자동 입력하지 않는다.
// (네이버가 데이터센터 IP + 자동화 브라우저의 로그인 시도를 캡차/2단계 인증으로
//  막을 가능성이 매우 높기 때문. 대신 사용자가 자신의 PC에서 한 번 수동 로그인한
//  세션 쿠키(storage state)를 재사용한다.)

const fs = require('fs');
const path = require('path');

const AUTH_DIR = path.join(__dirname, '..', '..', '.auth');
const STORAGE_STATE_PATH = path.join(AUTH_DIR, 'naver-storage-state.json');

function ensureAuthDir() {
  if (!fs.existsSync(AUTH_DIR)) fs.mkdirSync(AUTH_DIR, { recursive: true });
}

/**
 * storage state 파일 경로를 반환한다. 파일이 없으면 환경변수
 * NAVER_STORAGE_STATE_B64 (base64로 인코딩된 storage state JSON)로부터
 * 복원을 시도한다. 어느 쪽도 없으면 null을 반환한다.
 */
function resolveStorageStatePath() {
  ensureAuthDir();

  if (fs.existsSync(STORAGE_STATE_PATH)) {
    return STORAGE_STATE_PATH;
  }

  const b64 = process.env.NAVER_STORAGE_STATE_B64;
  if (b64 && b64.trim()) {
    try {
      const json = Buffer.from(b64.trim(), 'base64').toString('utf-8');
      JSON.parse(json); // 유효성 검증
      fs.writeFileSync(STORAGE_STATE_PATH, json, 'utf-8');
      return STORAGE_STATE_PATH;
    } catch (err) {
      console.error('[session] NAVER_STORAGE_STATE_B64 디코딩 실패:', err.message);
      return null;
    }
  }

  return null;
}

/**
 * 현재 브라우저 컨텍스트의 storage state를 파일로 저장하고,
 * 클라우드 환경 변수로 옮겨 담을 수 있도록 base64 문자열도 함께 출력한다.
 */
async function saveStorageState(context) {
  ensureAuthDir();
  await context.storageState({ path: STORAGE_STATE_PATH });
  const json = fs.readFileSync(STORAGE_STATE_PATH, 'utf-8');
  const b64 = Buffer.from(json, 'utf-8').toString('base64');
  return { path: STORAGE_STATE_PATH, base64: b64 };
}

module.exports = { STORAGE_STATE_PATH, resolveStorageStatePath, saveStorageState };
