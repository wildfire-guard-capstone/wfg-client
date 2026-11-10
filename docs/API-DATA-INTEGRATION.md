# 기존 화면을 보존한 API 연동 준비

## 이 브랜치의 범위

`codex/api-data-only`는 `main`의 `c3dfe0dfd57670ab3df5d03ab6eac4d9c445b261`에서 새로 시작했습니다. 기존 화면을 교체했던 PR #1과 별개입니다.

**기존 화면의 API 데이터 바인딩은 아직 적용하지 않았습니다.** 현재 화면은 main과 같은 계정·시나리오·합성 예측으로 동작합니다. 이번 변경은 요청/응답 타입, 호출 함수, 전송 방식 전환, 명세 형태 목업, 데이터 조회 조합과 검증입니다. 환경변수를 바꾸는 것만으로 기존 화면이 실제 API 화면으로 전환되지는 않습니다.

다음 파일은 main에서 수정하지 않았습니다.

- `src/App.tsx`, `src/main.tsx`, `src/components/**`, `src/styles/**`
- `src/runtime/**` 전체: 기존 DOM 렌더링, 이벤트, 로그인, 지도 초기화와 화선 그리기 포함
- `src/models/**`, `src/types/**`, `src/data/**`, `src/assets/**`

지도 스타일·레이어·마커·실측 화선·확산 도형, 우측 큰 위험도 배지, 팝업, 진화/대피 각 7개 분류, 패널 배치와 원래 시연 정보를 유지합니다. API 목업의 단순 도형과 12개 제안을 기존 시나리오 대신 넣지 않았습니다.

## 명세 기준

확인 기준일은 2026-11-10입니다. 이후 서버/명세 변경은 별도로 대조해야 합니다.

- [wfg-docs API v0.5, 커밋 fe6fd45](https://github.com/wildfire-guard-capstone/wfg-docs/blob/fe6fd4592c0076070ae70800cffa86707b656312/docs/%EC%84%A4%EA%B3%84/API-%EB%AA%85%EC%84%B8%EC%84%9C.md)
- [노션 API 명세서](https://app.notion.com/p/41073701722e80c78cf8dd292999a5fb): 당시 개별 행의 협의 완료 34개를 범위로 사용
- [wfg-server 확인 커밋 dd9830e](https://github.com/wildfire-guard-capstone/wfg-server/tree/dd9830edf8c75b874a2c38c18208020467bca46c)

| 기능 | 추가한 API ID | 개수 |
| --- | --- | ---: |
| 인증 | AUTH-01~03 | 3 |
| 계정 | USR-01~02 | 2 |
| 산불 | INC-01~04 | 4 |
| 화선 | PER-01~03 | 3 |
| 예측 | PRED-01~05 | 5 |
| 위험도·현재 기상 | RISK-01, WTH-01 | 2 |
| 지도 | MAP-01~02 | 2 |
| 자원·기지 | RES-01~02, BASE-01 | 3 |
| 제안 | PROP-01~05 | 5 |
| AI·정정 | AI-01~02, COR-01~02 | 4 |
| 이벤트 | LOG-01 | 1 |
| 합계 | | 34 |

미확정 12개(USR-03~06, MAP-03~04, RES-03~05, BASE-02~04)와 폐기된 EVD-01은 호출 목록에 넣지 않았습니다. 이 문서는 노션 상태를 변경하지 않습니다.

서버 대조 사항:

- BIGINT ID는 문자열, 역할 등 enum은 서버의 대문자 값, GeoJSON은 경도·위도 순서를 유지합니다.
- `null`을 `0`이나 빈 문자열로 바꾸지 않습니다. API의 Polygon/MultiPolygon과 내부 링도 전송 데이터에서 그대로 보존합니다.
- 위험도 변수의 `grade`는 문서 일부에 정수로 적혀 있지만 서버는 소수를 반환할 수 있어 `number | null`로 받습니다.
- 정정 대상은 최신 서버가 지원하는 `village`, `deployed`, `situation`으로 제한합니다. 지원하지 않는 산불 메타데이터 정정 요청을 만들지 않습니다.
- TypeScript 타입과 공통 응답 외피 검사는 구현했지만 모든 응답 필드의 런타임 스키마 검증을 제공하는 것은 아닙니다.

## 파일별 역할

| 위치 | 역할 |
| --- | --- |
| `src/api/contracts.ts`, `endpoints.ts` | 요청/응답 DTO, 경로·메서드·권한·우선순위·상태코드 |
| `src/api/client.ts`, `services.ts` | 타입이 지정된 호출, 토큰, timeout/abort, 오류 처리, Idempotency-Key |
| `src/api/environment.ts`, `session.ts` | mock/http 선택과 토큰 저장소 주입 |
| `src/api/data-source.ts` | 전체 페이지 조회, 산불별 병렬 조회, 성공·실패·미조회 구분 |
| `src/api/operations.ts` | 예측/재생성 작업의 완료·실패·시간 초과 확인 |
| `src/api/mock/**` | 별도 합성 응답과 상태가 있는 fetch 대체 함수 |
| `.env.example`, `vite.config.ts` | API 주소 예시와 선택적 개발 프록시 |
| `tests/api-*`, `tsconfig.api.json` | HTTP 직렬화·타입·상태 변경·오류 테스트 |
| `tests/ui-preservation.test.mjs`, `scripts/verify-ui-against-main.mjs` | main의 화면/지도 보존 검사 |

## 호출 사용법

아래는 데이터 계층의 사용 예시입니다. 기존 화면에 자동으로 연결되는 코드는 아닙니다.

```ts
import { createApiClientFromEnv, createApiDataSource } from './api';

const client = createApiClientFromEnv(import.meta.env);
const source = createApiDataSource(client);

// API 목업 전용 계정입니다. 기존 UI의 cmd01 / 1234 계정과 별개입니다.
const login = await source.api.auth.login({
  body: {
    login_id: 'mock-commander',
    password: 'mock-password',
    role: 'COMMANDER',
  },
});
const incidents = await source.listIncidents();
if (incidents.length > 0) {
  const data = await source.loadIncident(incidents[0].id, login.user.role);
  // data.now/risk/proposal 등은 ready / error / not-requested를 구분합니다.
  // 기존 화면에 넣는 매핑은 아래의 미결 사항 확인 후 추가합니다.
}
```

실제 서버 호출은 동일한 함수에서 `VITE_API_MODE=http`와 `VITE_API_BASE_URL=/api/v1`을 사용합니다. 로컬 백엔드/SSH 터널이 준비되면 `.env.local`에 `API_PROXY_TARGET=http://127.0.0.1:8000`을 추가하고 Vite를 재시작할 수 있습니다. 프록시는 개발 서버 전용이며 운영 배포에서는 별도 경로 연결 또는 CORS 설정이 필요합니다. 실제 계정은 전달받은 값을 사용합니다. 토큰 저장은 기본 메모리이며, 새로고침 유지가 필요하면 `createSessionTokenStore(sessionStorage)`를 명시적으로 주입합니다.

HTTP 모드 실패를 목업 성공으로 바꾸는 자동 fallback과 쓰기 요청의 자동 재시도는 없습니다. 같은 사용자 동작을 재시도할 때만 동일 본문/Idempotency-Key를 재사용합니다. 폴링 취소는 대기를 멈추며 서버 작업을 취소하지 않습니다. `SUCCEEDED`와 `FAILED`는 호출 측에서 구분해야 합니다.

목업에서는 `mock-commander`, `mock-viewer`, `mock-reporter`, `mock-admin`과 공통 비밀번호 `mock-password`를 사용합니다. 실제 로그인 정보가 아닙니다. `mock.scenarios`에서 API ID별 정상·빈 응답·401/403/404/409/422/500/503·네트워크 오류·시간 초과를 지정할 수 있습니다. `mock.overrides`로 응답을 주입할 수 있으며 전역 `fetch`를 바꾸지 않습니다.

## 화면 데이터 연결 전에 필요한 결정

아래는 사용자에게 질문한 상태이며 임의로 확정하지 않았습니다. UI를 바꾸어 해결하지 않습니다.

| 차이 | 확인할 내용 |
| --- | --- |
| 화면은 진화 7개·대피 7개, API는 각각 6개 | 기존 14개 분류를 유지하고 어떤 응답을 어느 칸에 넣을지 확인. 기존 S7 안전관리가 API S5로 바뀌는 등 코드와 의미가 다르므로 ID만으로 연결 금지 |
| 대피 경로, 접수 기록, 공식 발령 단계, 일부 대상 좌표가 명세에 없음 | 실제 API 모드에서 정보 없음/미연결로 표시할지, 기존 목업을 명확히 구분해 유지할지 확인 |
| 기존 계정 발급 폼과 서버의 필수 입력이 다름 | 서버에서 요구하는 login_id, admin_area_id 제공 방식 확인. 기관 이름으로 관할 ID를 추정하지 않음 |
| 산불 메타데이터 수정·자원 CRUD 중 일부는 확정 API가 없음 | 해당 기존 버튼을 실제 모드에서 어떻게 안내할지 확인. 서버에 저장됐다고 표시하지 않음 |
| 현재 지도 계산은 단일 외곽 Ring 중심 | API의 여러 Polygon/내부 구멍을 손실 없이 기존 지도 소스에 전달할 데이터 어댑터 필요. 지도 스타일·그리기 도구는 유지 |

질문에 답이 오기 전까지 기존 UI에 단순 API 목업을 덮어씌우거나, 서버 미제공 정보를 로컬 계산 결과로 대체하지 않습니다. 따라서 **이 브랜치를 실행해도 화면에서 실제 백엔드 API를 호출하지 않습니다.** 전체 화면 연동 완료로 간주하면 안 됩니다.

## 검증

Node.js 24에서 실행합니다.

```bash
npm ci
npm run typecheck
npm test
npm run build
```

- API 모듈은 별도 strict TypeScript 검사 대상입니다. 잘못된 요청 본문·필수 경로 누락·미확정 ID 사용도 타입 테스트에서 검사합니다.
- 자동 테스트 78개: 원본 계산 6개, HTTP/클라이언트 47개, 상태 목업 20개, 데이터 조회 3개, UI 소스 보존 2개.
- UI 보존 검사는 main의 기존 소스 34개 전체 SHA-256과 지도/그리기 함수·렌더러 마크업을 고정한 기준값에 대조합니다.
- 브라우저 검사는 별도 실행 중인 main과 새 브랜치를 비교합니다. Chromium이 없으면 `npx playwright install chromium`으로 설치합니다.

```bash
# 다른 터미널에서 변경하지 않은 main을 5182, 새 브랜치를 5178로 실행한 뒤:
MAIN_UI_URL=http://127.0.0.1:5182 CANDIDATE_UI_URL=http://127.0.0.1:5178 npm run test:ui-preserved
```

네 역할과 좁은 화면에서 배치·위험도 배지/팝업·지도 레이어 스타일·확산 좌표를 대조하며 결과와 캡처를 `test-results/ui-preserved/`에 저장합니다. 지도 로딩에는 인터넷 연결이 필요합니다. 위 비교는 기존 main 시연의 보존 검사이며 API 응답을 화면에 바인딩한 E2E 검사는 아닙니다. 실제 백엔드 서버와의 인증·CORS·응답 검증은 접속 정보가 준비된 뒤 진행해야 합니다.
