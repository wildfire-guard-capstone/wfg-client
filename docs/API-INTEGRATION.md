# 프론트엔드 API 모듈과 화면 연결

## 이번 변경 범위

확정된 명세의 요청·응답 타입, 호출 함수, 정상·빈 데이터·오류 목업을 추가하고 **로그인부터 보고·예측·제안·정정·관리자까지 API 함수에 연결했습니다.** 현재 진입점은 `src/features/api/ApiApp.tsx`이며, 기존 `MockRuntimeProvider`는 실행하지 않습니다. 기본 `mock` 모드는 서버 없이 동작하고, `http` 모드는 같은 화면에서 실제 API를 호출합니다.

| 구분 | 이 PR에서 준비한 내용                                                         |
| ---- | ----------------------------------------------------------------------------- |
| 계약 | 확정된 활성 API 34개. P1 12개 / P2 18개 / P3 4개                              |
| 호출 | 동일한 타입과 함수로 `mock` 또는 `http` 사용                                  |
| 목업 | 클라이언트별 메모리 상태, 역할별 로그인, 등록·조회·예측·정정 흐름             |
| 예외 | 401·403·404·409·422·500·503, 네트워크 오류, 시간 초과, 취소                   |
| 검증 | 타입 검사, HTTP 직렬화, 목업 흐름, 기존 모델 회귀 테스트와 브라우저 화면 점검 |
| 후속 | 준비된 실제 API로 전환 → 실제 접속·권한·데이터·예외 상황 점검                 |

런타임 의존성은 추가하지 않았습니다. 브라우저 동작 점검을 위해 `@playwright/test`를 개발 의존성으로 추가했습니다. Node.js 24를 권장합니다.

## 기준과 확정 범위

확인일: **2026-11-10 (KST)**. 명세 확정과 서버 구현·배포·화면 연결은 서로 다른 상태입니다.

- 계약: [wfg-docs API 명세서 v0.5, 고정 커밋 fe6fd45](https://github.com/wildfire-guard-capstone/wfg-docs/blob/fe6fd4592c0076070ae70800cffa86707b656312/docs/%EC%84%A4%EA%B3%84/API-%EB%AA%85%EC%84%B8%EC%84%9C.md). 명세 PR #67·#68 보완을 포함합니다.
- 범위: [팀 노션 API 명세](https://app.notion.com/p/41073701722e80c78cf8dd292999a5fb)의 `협의 완료`인 활성 API 34개를 확인한 시점의 스냅샷입니다. 아래 목록을 고정했으며 노션과 자동 동기화하지 않습니다.
- 서버 대조: [wfg-server dd9830e](https://github.com/wildfire-guard-capstone/wfg-server/tree/dd9830edf8c75b874a2c38c18208020467bca46c). 정적 코드 대조이며 EC2의 실행·배포 상태를 검증한 것은 아닙니다.
- 클라이언트 기준: `main`의 `c3dfe0d`. 기존 CSS와 화면 배치를 바탕으로 API 응답을 React 상태로 렌더링하는 화면을 추가했습니다. 원래 시연 컨트롤러·모델·데이터는 비교용으로 보존했습니다.

| 화면 분류              | 포함한 API                   |
| ---------------------- | ---------------------------- |
| 로그인                 | AUTH-01·02·03                |
| 산불 목록·현황         | INC-01·02·03·04              |
| 현장 보고(발화점·화선) | PER-01·02·03                 |
| 지도                   | MAP-01·02                    |
| 예측 실행·결과         | PRED-01·02·03·04·05, WTH-01  |
| 위험도                 | RISK-01                      |
| 대응 제안서            | PROP-01·02·03·04             |
| AI 질의·상황 정정      | AI-01·02, COR-01·02, PROP-05 |
| 진화자원               | RES-01·02, BASE-01           |
| 관리자                 | USR-01·02                    |
| 이벤트 로그            | LOG-01                       |

미확정 12개(USR-03~06, MAP-03·04, RES-03~05, BASE-02~04)는 호출 함수에 포함하지 않았습니다. 폐기된 EVD-01도 제외했습니다. 근거 원문은 제안서 `evidence`에 포함됩니다.

### 명세와 서버의 차이를 처리한 부분

- `RiskFactor.grade`: 문서는 `integer | null`, 서버 위험도 구현은 평균값인 소수도 반환합니다. TypeScript의 `number | null`로 받고 반올림하지 않습니다. 전체 위험도 점수는 소수 둘째 자리로 표시하며 변수별 grade의 소수값은 그대로 표시합니다.
- `CorrectionChange.target`: 문서 표에 남은 `incident`는 허용할 정정 항목이 정의되어 있지 않습니다. 최신 허용 목록·서버 구현에 맞춰 `village / deployed / situation`만 타입에 넣었습니다. `current_stage`, 위기경보, 기상 등을 정정 요청으로 만들지 않습니다.
- `QaMessage.sentences[].data_refs[].value`: 명세는 별도 값 타입을 고정하지 않아 JSON 값을 보존합니다.
- `Village`의 지도 속성 `label_point`는 명세의 “필요 시 포함”에 맞춰 선택값입니다.

백엔드가 자료를 제공하지 못하면 명세가 허용하는 `null`, 생략된 선택 필드, 빈 배열을 그대로 받습니다. **미제공 값을 0으로 바꾸거나 API 응답에 `'정보 없음'` 문자열을 대신 넣지 않습니다.** 화면에서만 `value == null ? '정보 없음' : value`처럼 표시해야 합니다. `0`과 `false`는 실제 값입니다.

## 파일 구성

| 위치                                                  | 역할                                                            |
| ----------------------------------------------------- | --------------------------------------------------------------- |
| `src/api/contracts.ts`                                | 공통 응답·DTO·열거값·nullable 타입                              |
| `src/api/endpoints.ts`                                | API ID별 요청/응답 연결, 경로·메서드·권한·우선순위              |
| `src/api/client.ts`                                   | fetch 호출, 인증, 오류, 취소, 타임아웃, 응답 껍질 처리          |
| `src/api/services.ts`                                 | `api.auth.login`, `api.incidents.list` 등 34개 별칭             |
| `src/api/environment.ts`                              | 환경 설정으로 mock/http 생성                                    |
| `src/api/session.ts`                                  | 메모리 토큰 저장, 선택적인 sessionStorage 저장                  |
| `src/api/operations.ts`                               | 202 작업을 완료/실패까지 조회하는 함수                          |
| `src/api/mock/fixtures.ts`                            | 모두 합성한 데이터, 제안 12칸·예측 8시간·기상 9개·위험도 23변수 |
| `src/api/mock/transport.ts`                           | 상태를 유지하는 목업 응답과 시나리오                            |
| `src/features/api/`                                   | API 응답을 사용하는 React 화면·지도·입력·상태 관리              |
| `src/App.tsx`                                         | 새 API 화면을 기본 진입점으로 연결                              |
| `tests/e2e/screens.spec.mjs`                          | 실제 Chromium의 화면 조작과 HTTP 요청 검증                      |
| `src/api/index.ts`                                    | 화면에서 가져올 공개 모듈                                       |
| `.env.example`, `vite.config.ts`                      | 모드·주소 예시, 선택적인 로컬 개발 프록시                       |
| `tests/api-*.test.mjs`, `tests/api-contract-types.ts` | 호출·목업 동작 및 컴파일 시 계약 검사                           |

## 목업으로 호출하기

현재 앱은 `ApiApp.tsx`에서 공유하는 클라이언트 인스턴스 하나를 만들고 화면들에 전달합니다. 아래는 호출 방식의 예시입니다. 렌더링할 때마다 새 인스턴스를 만들면 목업 상태와 로그인 토큰이 초기화되므로 기존 인스턴스를 재사용하세요.

```ts
import { createApiClientFromEnv, createApiServices } from './api';

export const client = createApiClientFromEnv(import.meta.env);
export const api = createApiServices(client);

await api.auth.login({
  body: {
    login_id: 'mock-commander',
    password: 'mock-password',
    role: 'COMMANDER',
  },
});
const list = await api.incidents.list({ query: { limit: 20 } });
const incident = await api.incidents.get({
  path: { incident_id: list.items[0].id },
});
```

API 명세의 `{ data, meta }`에서 `data`를 꺼내 반환합니다. `request_id`가 필요한 오류는 `ApiError.requestId`로 확인합니다. 로그아웃의 204 응답은 `undefined`입니다.

목업 전용 계정은 `mock-commander`, `mock-viewer`, `mock-reporter`, `mock-admin`이며 비밀번호는 모두 `mock-password`입니다. **이전 시연 계정(cmd01 등)이나 실제 서버 계정과 다릅니다.** 목업 토큰도 실제 JWT가 아닙니다. 클라이언트를 새로 만들거나 새로고침하면 상태가 초기화됩니다.

직접 API ID로 호출해도 동일하게 타입이 적용됩니다.

```ts
const result = await client.request('PRED-02', {
  path: { incident_id: '100', prediction_id: '41' },
});
```

### 예측 작업

```ts
import { createIdempotencyKey, waitForOperation } from './api';

const controller = new AbortController();
const job = await api.predictions.start({
  path: { incident_id: incident.id },
  body: { expected_perimeter_id: incident.current_perimeter_id },
  idempotencyKey: createIdempotencyKey(),
  signal: controller.signal,
});
const finished = await waitForOperation(
  client,
  {
    incident_id: incident.id,
    operation_id: job.id,
  },
  {
    signal: controller.signal,
    onUpdate: (op) => console.log(op.status, op.stage),
  },
);
if (finished.status === 'SUCCEEDED' && finished.result?.prediction_id) {
  const prediction = await api.predictions.get({
    path: {
      incident_id: incident.id,
      prediction_id: finished.result.prediction_id,
    },
  });
  // 이 결과를 React 상태와 MapLibre 레이어에 반영하는 것이 화면 연결입니다.
}
```

작업 조회 기본 간격은 2초, 최대 대기는 120초입니다. `FAILED` 작업도 반환하므로 `error`를 확인하세요. `AbortController` 취소는 프론트의 요청·조회 대기를 멈춥니다. 서버의 계산 작업을 취소하는 API는 아닙니다. 네트워크 오류 후 쓰기 요청을 자동 재전송하지 않습니다.

`Idempotency-Key`는 한 사용자 동작에 하나를 생성하고, 같은 본문을 재전송할 때만 재사용합니다. 프론트는 INC-02·PER-02·PER-03·PRED-01·COR-01·PROP-05에 키를 요구합니다. 서버가 같은 결과를 재전달하는 것이 확인된 API는 INC-02뿐이며, 나머지는 키만 받거나 충돌 응답을 줄 수 있습니다. 모든 요청의 재시도가 안전하다고 가정하지 마세요.

### 정상·빈 데이터·오류 선택

```ts
import { createApiClient } from './api';

const client = createApiClient({
  mode: 'mock',
  mock: {
    latencyMs: 150,
    scenarios: {
      'INC-01': 'empty',
      'WTH-01': 'unavailable',
      'AI-01': 'assistant-preview',
      'PRED-05': 'operation-failed',
    },
  },
});
```

로그인 후 위 API를 호출하면 해당 상태가 재현됩니다. `mock.scenario`는 전체 기본값, `mock.scenarios`는 API별 우선 설정입니다. 오류를 전역으로 지정하면 로그인도 실패하므로 보통 API별 설정을 사용하세요.

| 시나리오                                 | 동작                                                                                             |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `success`                                | 정상 응답                                                                                        |
| `empty`                                  | 목록은 빈 페이지, 지도/확산은 빈 FeatureCollection, 최신 제안·위험도는 null, 지금 날씨 값은 null |
| `unauthorized`, `forbidden`, `not-found` | 401, 403, 404                                                                                    |
| `conflict`, `validation-error`           | 409, 422(필드 오류 포함)                                                                         |
| `unavailable`, `server-error`            | 503, 500                                                                                         |
| `network-error`, `timeout`               | 연결 실패, 응답 대기 시간 초과                                                                   |
| `operation-failed`                       | PRED-05의 작업을 FAILED로 종료. 이전 성공 결과 유지                                              |
| `assistant-answer`                       | 질의응답 저장·반환                                                                               |
| `assistant-preview`                      | 저장하지 않은 정정 확인안 반환                                                                   |
| `assistant-unsupported`                  | 허용되지 않은 입력 예시. 상황·정정 이력은 유지                                                   |

`empty`는 쓰기 API의 정상 결과를 임의로 null로 만들지 않습니다. 필수 단건(INC-03, PRED-02, PROP-03·04)은 빈 상태 점검 시 404입니다. AUTH-02 같은 필수 객체는 정상 객체를 유지합니다. 특정 nullable 필드나 부분 실패를 시험하려면 타입이 적용되는 `mock.overrides`에 완전한 해당 응답을 넣으세요.

```ts
import { createFixtures } from './api';
const fixtures = createFixtures();
const client = createApiClient({
  mode: 'mock',
  mock: {
    overrides: {
      'WTH-01': { ...fixtures['WTH-01'], wind_speed: 0, humidity: null },
      'PROP-02': null,
    },
  },
});
```

오류 시나리오 → 인증·권한·요청 점검 → override → 빈 응답 → 상태별 정상 처리 순서입니다. override는 상태를 저장하지 않는 고정 응답이므로, 작업 생성·조회처럼 이어지는 흐름에서는 기본 상태형 목업을 사용하세요.

정정 목업은 문장을 이해하지 않고, **헬기 미상·합계에 각각 +2대** 하는 확인안을 반환합니다. 확인안만 받거나 취소하면 상황과 정정 이력은 바뀌지 않습니다. `COR-01` 확인 후 저장되고, 제안 재생성 실패 시에도 정정은 유지됩니다. 이후 `PROP-05`로 제안만 재시도할 수 있습니다.

목업은 백엔드 전체를 재현하는 검증 서버가 아닙니다. 관할·공간 교차·면적·거리·가용 자원 상한·LLM 해석·규칙 판정·실제 기상은 계산하지 않습니다. 지도는 고정 합성 지점의 bbox 포함 여부를 사용합니다. 오류 코드는 화면 점검용 대표 사례이고, 원문 계약의 모든 업무 검증을 구현한 것은 아닙니다.

## 실제 서버로 바꾸기

1. `.env.example`을 `.env.local`로 복사합니다.
2. 백엔드에서 **브라우저용 API 접속 방법**, 테스트 계정과 역할, 호출 가능한 API를 받습니다. SSH 터널이 필요한 경우 백엔드가 제공한 방식으로 별도 연결합니다.
3. 개발 프록시를 쓰면 아래처럼 설정하고 Vite를 재시작합니다.

```dotenv
VITE_API_MODE=http
VITE_API_BASE_URL=/api/v1
# 아래는 예시입니다. 실제로 연결한 로컬 터널 포트로 바꾸세요.
API_PROXY_TARGET=http://127.0.0.1:8000
```

`API_PROXY_TARGET`은 브라우저 번들에 넣지 않는 개발 서버 설정이며 인증 정보·경로 없는 origin만 받습니다. `/api/v1` 경로를 유지해 프록시합니다. 프록시는 `npm run dev` 전용입니다. 빌드·preview·운영 배포에는 별도의 리버스 프록시 또는 CORS가 허용된 서버 주소가 필요합니다. 직접 호출한다면 `VITE_API_BASE_URL=https://<서버주소>/api/v1`을 사용하세요.

`VITE_*` 값은 브라우저에 공개됩니다. 비밀번호·JWT·SSH 키를 환경 파일에 넣지 않습니다. 임시 시연용 `/api/auth/login` 대신 계약 경로 `/api/v1/auth/login`을 사용합니다. 로그인 성공 시 반환된 토큰은 기본적으로 메모리에 저장하며, 필요할 때만 `createSessionTokenStore(window.sessionStorage)`를 주입합니다. mock/http의 저장소는 공유하지 마세요. 목업 계정·토큰을 실제 서버에서 사용할 수 없습니다.

모드를 바꿔도 호출 함수와 DTO는 같습니다. 일부 기능만 실서버로 연결할 경우 화면별로 사용할 클라이언트를 명시적으로 선택하고 각각 로그인해야 합니다. HTTP 실패를 목업 성공으로 자동 대체하는 기능은 없습니다.

공통 성공/오류 envelope는 런타임에도 검사합니다. 세부 DTO의 모든 필드를 런타임 검증하는 스키마 라이브러리는 추가하지 않았습니다. 실서버 응답의 필드·null·권한 차이는 실제 연동 시 추가 확인해야 합니다.

## 확인 방법과 다음 작업

```bash
npm ci
npm run typecheck
npm test
npm run build
npm run api:demo
```

`api:demo`는 서버나 브라우저 없이 목업 호출 결과를 보여줍니다. `npm run dev`에서는 연결된 화면을 직접 사용할 수 있습니다. `mock` 모드는 메모리에서 응답하므로 DevTools Network에 HTTP 요청이 보이지 않습니다. `http` 모드는 브라우저에서 요청을 전송합니다. 브라우저 테스트는 http 모드의 요청을 가로채 목업 응답으로 검증합니다.

```bash
npx playwright install chromium
npm run test:e2e
```

연결한 화면별 범위·예외 동작·검증 결과는 [화면 동작 점검](API-SCREEN-VERIFICATION.md)에 기록합니다.

**화면 연결**은 로그인 폼·산불 목록·예측 버튼 등이 이 함수들을 호출하고 응답을 React 상태·지도·패널에 표시하도록 바꾸는 작업입니다. **동작 점검**은 연결 후 정상·로딩·빈 값·권한 오류·충돌·실패·재시도·화면 이동 시 취소가 의도대로 작동하는지 확인하는 작업입니다.

화면 연결과 목업 기반 동작 점검을 수행했습니다. 실제 서버가 준비되면 브라우저용 접속 방법·계정·CORS/터널을 확인하고 동일한 화면에서 실제 응답·권한·데이터 규모·동시 작업을 별도로 점검해야 합니다.
