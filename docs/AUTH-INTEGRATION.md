# AUTH-01~03 공통 인증 연동 검증

검증일: 2026-11-11, Asia/Seoul. 상태: 프론트 수정·검증 완료, 미커밋. 다음 단계 승인 대기.

## 브랜치와 보존 상태

| 항목 | 결과 |
| --- | --- |
| 작업 브랜치 | feat/frontend-api-integration |
| 기준 브랜치 | codex/api-data-only |
| 기준 커밋 / 현재 HEAD | 46c1ca4c34e10d0afff6ec5351ae575ef3a3afd2 |
| 기준 파일 트리 | 0495eae2ecc0f139aa019f2818b143d1c37063b9 |
| 저장소 기본 브랜치 / 최종 PR 대상 | main |
| 원격 브랜치 생성 | 위 기준 커밋에 새 참조 생성. 신규 커밋 없음 |
| 기존 브랜치 | main과 codex/api-data-only 이동·병합·덮어쓰기 없음 |
| 기존 작업 | 새 로컬 복제본의 초기 상태가 깨끗함을 확인한 뒤 수정 |

GitHub 연결 도구의 생성 요청은 403 권한 오류로 실패했다. 이어 사용 가능한 로컬 Git 인증으로 새 브랜치를 원격에 등록했다. 기존 PR #2는 변경하지 않았다. 현재 소스 변경은 로컬 작업 트리에만 있으며 원격 브랜치에는 기준 코드만 있다. 커밋·변경 코드 push·PR 생성은 하지 않았다.

## 재사용과 보완

기존 vite.config.ts의 /api/v1 개발 프록시, src/api/contracts.ts의 LoginRequest·AuthToken·User, endpoints.ts의 AUTH-01~03 경로, services.ts의 인증 메서드, 메모리 토큰 저장소를 재사용한다. API 계약에 새 필드를 추가하지 않았다.

- .env.example은 http 모드와 EC2 프록시 대상을 제공한다. 로컬 .env.local에도 같은 설정을 적용했으며 이 파일은 Git에서 무시된다. 계정·비밀번호·JWT는 환경 변수에 넣지 않는다.
- 보호된 요청에는 Authorization: Bearer 헤더를 붙이고, AUTH-01에는 붙이지 않는다. 토큰은 현재 API 클라이언트 메모리에만 둔다. 새로고침 후에는 다시 로그인한다.
- AUTH-01~02의 필수 응답 필드·문자열 ID·역할·expires_in·token_type을 실행 중 확인한다. 누락되거나 잘못된 필드는 [필요한 정보: AUTH-01 응답의 유효한 user.organization]과 같이 구체적으로 기록하고 인증을 완료하지 않는다.
- 로그인 제출 시 아이디·역할·비밀번호를 한 번 읽는다. 비밀번호 앞뒤 공백은 유지한다. 로그인 중에는 기존 버튼을 잠시 비활성화하고 aria-busy를 사용한다. 버튼 문구·JSX·스타일은 유지하며 완료 후 원래 상태로 돌린다. 클릭·Enter 중복 요청을 막는다.
- AUTH-02의 사용자 ID와 역할이 로그인 응답 및 제출한 역할과 맞는지 확인한다. 인증 실패와 인증 후 초기 업무 데이터 조회 실패는 메시지에서 구분한다.
- 서버가 반환한 expires_in으로 만료를 예약한다. 만료 또는 보호된 요청의 401이면 토큰·사용자·진행 중 요청·타이머를 정리하고 기존 로그인 화면으로 돌아간다. 만료 때문에 별도 AUTH-03 요청을 보내지 않는다.
- 로그아웃은 AUTH-03으로 기록을 보내고 로컬 인증 상태를 즉시 삭제한다. 원격 기록 전송이 실패해도 기존 로그인 화면으로 돌아간다. 중복 로그아웃을 막는다.
- 동시 401과 늦은 로그아웃 응답이 새 로그인 세션을 지우지 않도록 세션 변경 순서를 확인한다. 로그인 도중 세션이 정리된 경우 늦은 토큰을 복원하지 않는다.
- 기존 공통 오류의 HTTP 상태·서버 code·fields·request_id를 보존한다. 권한 부족, 정상 빈 데이터, 서버 오류, 네트워크 실패, 시간 초과를 섞지 않으며 HTTP 실패를 시연 성공으로 대체하지 않는다.

## 변경 파일

아래는 이번 기준 커밋 대비 변경이다. 선행 브랜치의 다른 API 구현은 수정하지 않았다.

| 파일 | 내용 |
| --- | --- |
| .env.example | 실제 EC2 연결용 모드·프록시 예시 |
| src/api/client.ts | 인증 응답 검사, Bearer 및 세션 응답 순서 보호 |
| src/api/screen/bridge.ts | 인증 제출·중복 방지·만료·로그아웃·오류 흐름 |
| src/runtime/createMockRuntime.ts | 기존 로그인 버튼 상태와 세션 종료 연결, 사용자 상태 삭제 |
| playwright.config.ts | 시험 포트 지정, 기존 타 작업 서버를 재사용하지 않도록 설정 |
| tests/auth-session.test.mjs | 인증 계약·토큰·동시 401·늦은 응답 회귀 검사 6개 |
| tests/browser/auth.spec.ts | 중복 제출·만료·서버 오류·로그아웃 실패 검사 4개 |
| README.md | 실제/목업 실행 방법과 인증 검증 범위 |
| docs/API-DATA-INTEGRATION.md | 변경된 환경 변수 예시와 실행 안내 일치 |
| docs/AUTH-INTEGRATION.md | 이 검증 기록 |

별도 로컬 설정 .env.local은 추적하지 않는다. package.json·package-lock.json·기존 LoginScreen.tsx·컴포넌트·CSS·지도 코드·원본 시나리오는 변경하지 않았다.

## 실제 EC2 호출

2026-11-11 17:28:13 KST 검증 시작. 프론트의 수정된 createApiClient를 사용해 로컬 Vite /api/v1 프록시에서 EC2로 전달했다. 요청을 다른 서버나 모의 응답으로 바꾸지 않았다. 네 역할의 시험 계정은 제공된 비공개 접속 안내에서 메모리로 읽었고 비밀번호·JWT는 출력하거나 파일에 쓰지 않았다.

| 역할 | AUTH-01 로그인 | AUTH-02 사용자 조회 | 무효 JWT의 AUTH-02 | AUTH-03 로그아웃 | 로컬 로그아웃 후 AUTH-02 |
| --- | --- | --- | --- | --- | --- |
| COMMANDER | 200 | 200 | 401 INVALID_TOKEN | 204 | 401 UNAUTHORIZED |
| VIEWER | 200 | 200 | 401 INVALID_TOKEN | 204 | 401 UNAUTHORIZED |
| REPORTER | 200 | 200 | 401 INVALID_TOKEN | 204 | 401 UNAUTHORIZED |
| ADMIN | 200 | 200 | 401 INVALID_TOKEN | 204 | 401 UNAUTHORIZED |

각 로그인 응답에 access_token·token_type·expires_in·user가 있었고, user의 id·login_id·name·organization·role·admin_area_id도 모두 있었다. expires_in은 네 역할 모두 1800초였다. 필수 정보 누락은 없었다. AUTH-03은 본문 없는 204였다. 실제 서버의 자연 만료를 30분 기다려 재현한 것은 아니며, 프론트 만료 동작은 아래 가상 시계 검사로 확인했다.

정상 검증은 총 20회다. 이에 앞서 PDF 일반 텍스트 추출에서 관리자 비밀번호와 역할 열이 붙어 AUTH-01이 1회 401 INVALID_CREDENTIALS를 반환했다(request_id: req-e9502fbb4d1f40e9). PDF의 표 배치를 보존하는 추출로 수정한 뒤 정확한 값으로 정상 로그인했다. 무작위 비밀번호 추측·반복 실패 시험은 하지 않았다. 이번 단계의 실제 서버 호출은 이 실패를 포함해 AUTH-01~03 총 21회이며 다른 업무 API는 호출하지 않았다.

## UI/UX와 로컬 검증

| 검사 | 결과 |
| --- | --- |
| TypeScript 및 API strict 타입 검사 | 통과 |
| npm test | 90개 통과: 기존 84개 + 인증 회귀 6개 |
| 전체 브라우저 회귀 | 13개 통과: 기존 9개 + 인증 4개 |
| 최종 세션 정리 보완 후 인증 브라우저 재검사 | 4개 통과 |
| npm run build | 통과, 기존 대형 번들 경고는 남음 |
| main 대비 UI 비교 | 5개 통과: 네 역할 + 390px 화면의 배치·배지·팝업·지도 스타일·확산 도형 |
| main 대비 로그인 화면 | 1440×960, 390×960의 HTML 결과·스타일·좌표·스크린샷 바이트 동일 |
| 원본 소스 보존 검사 | 기존 컴포넌트·CSS·모델·데이터 및 지도/그리기 함수 보존 검사 통과 |
| git diff --check | 통과 |

로그인 화면 캡처도 직접 확인했다. 390px에서 원본부터 존재하는 가로 넘침은 동일하게 유지했으며 이번 범위에서 레이아웃을 수정하지 않았다. 로딩 중 기존 버튼 비활성화와 오류/만료 문구는 인증 상태 처리이며 화면 구조·색상·타이포그래피·아이콘·애니메이션을 바꾸지 않는다. 기존 클릭·Enter·역할 선택·로그아웃 동작은 유지한다.

브라우저 회귀와 UI 비교는 명시적인 모의 응답 또는 원본 시연 데이터로 수행했다. 이 결과를 실제 산불 보고·예측·AI·자원 변경의 서버 검증으로 간주하지 않는다. 처음 브라우저 실행은 이미 다른 작업이 쓰는 포트를 재사용해 잘못된 앱에 연결됐다. 시험 서버 재사용을 끄고 새 포트에서 다시 실행한 결과가 위 통과 수치다. 의존성은 기존 잠금 파일의 Vite 8.3.4·Rolldown 1.2.14로 맞췄으며 의존성 파일은 변경하지 않았다.

## 남은 범위와 승인 지점

- AUTH-01~03의 필수 필드와 실제 호출에는 차단 요인이 없다.
- [필요한 정보: AUTH-03의 서버 측 JWT 즉시 무효화 계약]. 현재 명세는 로그아웃 이벤트 기록과 프론트 토큰 삭제를 규정하며, 서버 즉시 폐기는 Q-09 미확정이다. 서버 토큰이 즉시 폐기된다고 보고하지 않는다.
- 새로고침 세션 복원·리프레시 토큰 API는 현 계약에 없으므로 추가하지 않았다.
- Vite 프록시는 개발 서버 기능이다. 운영 배포의 /api/v1 라우팅·CORS·HTTPS 구성은 이번 프론트 인증 단계의 범위 밖이다.
- STEP 1의 예측 mode, 지도 전체 데이터 교체, 다른 업무 API 및 기존 [NULL] 표시는 이번 AUTH 범위에서 수정하지 않았다.
- 다음 단계 승인 전까지 커밋·변경 코드 push·Draft PR 생성·업무 데이터 변경을 진행하지 않는다.

근거: [API 명세 AUTH-01~03 및 Q-09](https://github.com/wildfire-guard-capstone/wfg-docs/blob/a7991c35039fb101ffbbf092c586e94d5fa3aa63/docs/설계/API-명세서.md), [서버 인증 라우터](https://github.com/wildfire-guard-capstone/wfg-server/blob/add356ba57233f30e16422af3da8ba6cf0c21de7/app/routers/auth.py), [서버 인증 DTO](https://github.com/wildfire-guard-capstone/wfg-server/blob/add356ba57233f30e16422af3da8ba6cf0c21de7/app/schemas/user.py), 사용자 제공 EC2 접속 안내, 실제 인증 응답 및 로컬 검사 결과.
