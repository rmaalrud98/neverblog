# neverblog

네이버 블로그(경제 채널, 네이버 홈판 노출 목표)에 매일 글 5개를 **임시저장**까지만
자동으로 해두는 도구입니다. 발행은 항상 사람이 직접 확인 후 누릅니다 — 이 저장소의
코드는 "발행/등록" 버튼을 누르는 기능 자체가 없습니다(안전장치).

## 시작하기 전에 꼭 확인할 것 (중요)

1. **네트워크 정책**: 이 자동화가 도는 Claude Code 환경(클라우드)의 네트워크 정책이
   기본적으로 `blog.naver.com`, `nid.naver.com` 접속을 막고 있을 수 있습니다.
   Claude Code 웹 환경 설정에서 해당 도메인을 허용해야 자동화가 동작합니다.
2. **네이버의 자동화 탐지**: 네이버는 데이터센터 IP·자동화 브라우저의 로그인을
   캡차/2단계 인증 등으로 막는 경우가 흔합니다. 그래서 이 프로젝트는 아이디/비밀번호를
   스크립트로 직접 입력하지 않고, **사람이 본인 PC에서 한 번 수동 로그인**한 세션(쿠키)을
   재사용하는 방식을 씁니다. 그 세션이 만료되면(네이버가 재로그인을 요구하면) 자동화는
   실패하고, 다시 수동 로그인이 필요합니다. 100% 무인 운영을 보장하지는 못합니다.
3. **콘텐츠 사실 확인**: 글 내용(특히 수치·통계)은 검색 기반으로 작성되지만 최종
   책임은 발행 전 검수입니다. 임시저장만 하는 것도 이 때문입니다.

## 구성

```
scripts/
  lib/browser.js     - Playwright 브라우저 실행 (이 환경에 미리 설치된 Chromium 사용)
  lib/session.js      - 로그인 세션(storage state) 로드/저장
  login-setup.js      - [로컬 PC 전용] 최초 1회 수동 로그인 → 세션 저장
  check-session.js    - 세션이 아직 유효한지 확인
  post-drafts.js       - posts/*.json 의 글들을 네이버 블로그에 "임시저장"
posts/
  sample.json          - 글 스키마 예시 (매일 이 형식으로 생성됨)
DAILY_WORKFLOW.md      - 매일 자동 실행 시 Claude가 따르는 절차
```

## 최초 설정

### 1) 네이버 블로그 ID 확인
`https://blog.naver.com/본인아이디` 형태라면 그 아이디가 `NAVER_BLOG_ID`.

### 2) 로그인 세션 만들기 (본인 PC에서, 이 클라우드 환경이 아님)
```bash
git clone <이 저장소>
cd neverblog
npm install
npx playwright install chromium   # 로컬 PC엔 미리 설치된 브라우저가 없으므로 필요
npm run login-setup
```
브라우저가 뜨면 평소처럼 네이버에 로그인(2단계 인증 포함, "로그인 상태 유지" 체크
권장) 후 터미널에서 Enter. `NAVER_STORAGE_STATE_B64` 값이 출력됩니다.

### 3) 클라우드 환경 변수 등록
Claude Code 환경 설정(Environment variables)에 등록:
- `NAVER_BLOG_ID` = 본인 블로그 아이디
- `NAVER_STORAGE_STATE_B64` = 위에서 나온 값

### 4) 매일 자동 실행
이 저장소를 실행 중인 Claude 세션에 **매일 정해진 시각에 `DAILY_WORKFLOW.md`를
수행하라는 Routine(스케줄 트리거)**을 등록해두면, 매일 Claude가
1. 세션 유효성 확인 → 2. 오늘의 경제 이슈 리서치(WebSearch) → 3. 글 5개 작성 →
4. `posts/<날짜>.json` 저장 → 5. `node scripts/post-drafts.js` 로 임시저장 →
6. 결과 요약 보고
를 수행합니다.

## 수동으로 한 번 실행해보기

```bash
cp posts/sample.json posts/2026-08-25.json   # 직접 수정해서 사용
node scripts/check-session.js
node scripts/post-drafts.js posts/2026-08-25.json
```

문제가 생기면 `posts/debug/*.png` 스크린샷을 확인하세요. 네이버가 에디터 UI를
바꾸면 `scripts/post-drafts.js`의 선택자(selector)를 그에 맞게 손봐야 할 수 있습니다
(이 코드는 알려진 SmartEditor ONE 구조를 기준으로 작성되었고, 실제 계정으로 아직
검증되지 않았습니다 — 첫 실행은 `--headed` 옵션 없이도 `posts/debug/`의 실패
스크린샷으로 원인을 확인할 수 있습니다).

## 안전 설계

- `post-drafts.js`는 텍스트가 정확히 "저장"인 버튼만 클릭합니다. "발행", "등록" 같은
  버튼은 코드 어디에도 클릭 대상으로 등장하지 않습니다.
- 아이디/비밀번호를 스크립트에 저장하거나 자동 입력하지 않습니다.
- `.auth/`(세션 쿠키), `.env`는 git에 커밋되지 않습니다(`.gitignore`).
