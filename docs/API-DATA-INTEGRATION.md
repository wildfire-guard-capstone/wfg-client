# 기존 UI를 유지한 API 데이터 연결

`codex/api-data-only`는 main `c3dfe0dfd57670ab3df5d03ab6eac4d9c445b261`에서 시작했습니다. React 컴포넌트, CSS, 지도 초기화·레이어 스타일·마커·화선 그리기 함수, 모델, 원본 시나리오는 유지합니다. 기존 runtime에 데이터 호출·값 변환·버튼 처리 분기를 추가했습니다. 새 화면으로 교체하지 않습니다.

## 실행 모드

Node.js 24를 사용합니다.

```bash
npm ci
npm run dev
```

`VITE_API_MODE`를 설정하지 않으면 main과 동일한 원래 시연 모드입니다. API 경로를 점검하려면 다음과 같이 설정합니다.

```bash
cp .env.example .env.local
npm run dev
```

`.env.local`의 `VITE_API_MODE=mock`은 명세 형태의 응답을 기존 화면에 연결합니다. 목업 로그인은 main의 `cmd01`, `view01`, `rep01`, `admin01` / `1234`를 사용합니다. API 모듈을 단독 테스트하는 `mock-commander` 계정과 구분합니다. API 화면 목업의 화선·확산 좌표는 원본 시나리오/합성 모델에서 가져옵니다. 단순 사각형 테스트 도형으로 기존 시연 지도를 대체하지 않습니다. 이 모드의 판단·제안·AI 응답은 실제 서버 결과가 아닙니다.

실제 서버가 준비되면 같은 호출 함수에서 아래 설정을 사용합니다. Vite를 재시작해야 합니다.

```dotenv
VITE_API_MODE=http
VITE_API_BASE_URL=/api/v1
API_PROXY_TARGET=http://127.0.0.1:8000
```

`API_PROXY_TARGET`은 백엔드/SSH 터널이 이미 열려 있는 경우의 예시입니다. 이 설정이 서버나 터널을 생성하지 않습니다. 실제 테스트 계정은 백엔드에서 받은 값을 입력합니다. 개발 프록시는 운영 배포에 적용되지 않으며 배포 환경에서는 경로 연결 또는 CORS 설정이 필요합니다. 비밀번호·토큰·SSH 키를 VITE_*에 넣지 않습니다.

HTTP 실패를 원래 시연의 성공 결과로 바꾸는 자동 fallback은 없습니다. API 모드에서는 기존 목업 세션 토큰으로 로그인 복원도 하지 않습니다. 현재 API 토큰은 메모리에 두며 새로고침 후 재로그인합니다.

## 연결한 흐름과 남은 범위

| 화면 흐름 | 연결 |
| --- | --- |
| 로그인·로그아웃 | AUTH-01 → AUTH-02, AUTH-03. 만료/401이면 기존 로그인 화면으로 이동 |
| 산불 목록·현황 | INC-01 → 선택한 INC-03, INC-04. 없는 값은 `[NULL]` |
| 새 보고·화선 | INC-02, PER-01~03. 이름은 서버 생성. 지원하지 않는 메타데이터 수정·접수 배열은 전송하지 않음 |
| 예측·재생·기상·위험도 | PRED-01 → PRED-05 → PRED-02~04, WTH-01, RISK-01. 기존 지도 소스·배지·팝업·재생 도구 사용 |
| 대응 제안·버전·비교 | PROP-01~04. 기존 14개 분류를 유지하고 의미가 명확한 11개만 매핑. S5·E5·E7은 `[NULL]` |
| AI 질의·정정 | AI-01~02, COR-01~02. 정정 확인 전 미저장, 반환된 재생성 작업 폴링, 실패 시 PROP-05로 재시도 |
| 자원·기지 | RES-01~02, BASE-01. 자원 조회·집계 값 연결. 개별 인력은 만들지 않음 |
| 계정·이벤트 | USR-01, LOG-01. USR-02는 호출/폼 연결이 있으나 관할 ID를 명시적으로 제공해야 발급 가능 |
| 지도 참고 레이어 | MAP-01~02의 호출/목업/타입은 준비. main의 고정 마을·시설·도로·경로 레이어 전체를 서버 공간 데이터로 교체하는 작업은 적용하지 않음 |
| 미확정 쓰기·추가 조회 | USR-03~06, MAP-03~04, RES-03~05, BASE-02~04는 새 요청을 만들지 않음. 기존 관리 조작 시 `[NULL]`과 대기 사유 안내 |

계정 발급용 관할 ID가 확인된 경우에만 `VITE_ACCOUNT_ADMIN_AREA_ID`로 설정합니다. 기존 폼에 관할 입력이 없으므로 기관명에서 ID를 추정하지 않습니다. 발급용 login_id는 기존 UI의 자동 발급 방식에 맞춰 조회한 계정 목록에서 중복되지 않는 후보를 만들며, 서버 충돌/검증 실패를 그대로 처리합니다.

**모든 34개 API의 화면 연동이 완료됐다는 뜻은 아닙니다.** MAP-01~02의 서버 공간 레이어 교체, 계정 발급 필수 값, 제안 항목 매핑과 미정의 필드의 보완은 위와 같이 구분합니다. 화면별 상세 공백·사유·대기 API는 [API-DATA-GAPS.md](API-DATA-GAPS.md)에 정리했습니다.

## 명세·소스 기준

- [API v0.5 기존 확정 기준 fe6fd45](https://github.com/wildfire-guard-capstone/wfg-docs/blob/fe6fd4592c0076070ae70800cffa86707b656312/docs/%EC%84%A4%EA%B3%84/API-%EB%AA%85%EC%84%B8%EC%84%9C.md), PR #67·#68, 노션 협의 완료 34개.
- [2026-11-11 main 대조 c2ba98e](https://github.com/wildfire-guard-capstone/wfg-docs/blob/c2ba98eb67ce3a53bbe8d36006116e4e4113b76f/docs/%EC%84%A4%EA%B3%84/API-%EB%AA%85%EC%84%B8%EC%84%9C.md): INC-02·PER-01~03 존재/상세/우선순위 재확인, Weather의 KMA_STATIONS·lat/lon location 타입 보완.
- [서버 대조 커밋 dd9830e](https://github.com/wildfire-guard-capstone/wfg-server/tree/dd9830edf8c75b874a2c38c18208020467bca46c): 위험도 소수 grade 보존. 실제 배포 서버 호출 검증은 미실시.

범위는 AUTH-01~03, USR-01~02, INC-01~04, PER-01~03, PRED-01~05, RISK-01, WTH-01, MAP-01~02, RES-01~02, BASE-01, PROP-01~05, AI-01~02, COR-01~02, LOG-01입니다. 폐기된 EVD-01과 미확정 12개는 호출 목록에서 제외합니다.

## 데이터 처리 규칙

- ID는 문자열, enum은 서버 대문자 값, 좌표는 경도·위도 순서를 유지합니다.
- GeoJSON MultiPolygon과 내부 링을 그대로 보존해 기존 지도 소스로 전달합니다. 첫 외곽 Ring만 제출하는 변환을 하지 않습니다. 면적 표시는 API area_ha를 사용합니다.
- 위험도 점수·등급·축 점수는 서버 값을 사용하며 프론트에서 규칙/위험도를 재판정하지 않습니다. UI의 `infra`와 API의 `infrastructure`를 표시 계층에서 대응시키고, 가중치 표시는 제공된 가중치를 기준으로 정규화합니다.
- 누락/오류를 0·false로 대체하지 않습니다. 성공한 빈 목록과 실패는 데이터 조회 결과에서 구분합니다. 타입 검사와 공통 응답 외피 검사는 있지만 모든 필드의 런타임 스키마 검증을 제공하는 것은 아닙니다.
- 쓰기 요청을 자동 재시도하지 않습니다. 사용자 동작별 Idempotency-Key를 전달하며 동일 행위/동일 본문 재시도만 키를 재사용해야 합니다. 서버가 모든 쓰기에 응답 재전달을 보장하는 것은 아닙니다.
- 예측·채팅·보고·계정 발급의 중복 동작을 막습니다. 마운트 해제/로그아웃 시 대기 요청을 중단합니다. 폴링 중단은 서버 작업 취소가 아닙니다.
- 실측 보고 폼에는 관측 시각 입력이 따로 없으므로 제출 시각을 observed_at으로 사용합니다. 별도 관측 시각 입력이 필요하면 기존 UI 변경에 앞서 합의해야 합니다.
- 예측 기상(PRED-04)은 받아두지만 현재 날씨 행은 WTH-01을 사용합니다. 원래 화면에 없던 시간별 기상 표를 새로 만들지 않습니다.

## 파일별 변경 위치

| 파일 | 변경 내용 |
| --- | --- |
| `src/api/contracts.ts`, `endpoints.ts` | 확정 API DTO·경로·메서드·권한·우선순위 |
| `src/api/client.ts`, `services.ts`, `environment.ts`, `session.ts` | mock/http 전환, 토큰, 오류·취소·시간 초과 |
| `src/api/data-source.ts`, `operations.ts` | 전체 페이지 조회, 부분 실패 보존, 작업 폴링 |
| `src/api/mock/**` | 독립적인 상태 목업과 정상/빈 값/오류 응답 |
| `src/api/screen/adapters.ts` | 기존 화면 데이터로 변환, `[NULL]`, 14↔12 매핑, 원본 GeoJSON 보존 |
| `src/api/screen/bridge.ts` | 기존 버튼에서 API 호출, 응답 상태 적용, 보고·예측·질의·정정·관리자 흐름 |
| `src/api/screen/mock-seed.ts` | 원본 main의 계정·화선·확산을 API 목업 데이터로 재사용 |
| `src/runtime/createMockRuntime.ts` | 기존 렌더러를 재사용하는 데이터 호출 분기/표시값 처리. 지도 초기화·레이어·그리기 함수는 그대로 |
| `src/types/domain.ts` | 서버 null·문자열 ID·매핑 정보를 담을 타입 보완 |
| `.env.example`, `vite.config.ts` | API 실행 설정과 선택적 개발 프록시 |

React JSX·CSS·원본 시나리오·모델은 수정하지 않았습니다. 기존 runtime과 타입 변경은 API 데이터 연결을 위해 필요한 부분이며 UI 교체가 아닙니다.

## 검증

```bash
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:browser
```

브라우저 테스트는 HTTP 모드의 fetch 요청을 명세 모의 서버 응답으로 받아 실제 버튼/화면을 점검합니다. 실제 FastAPI 배포 서버·인증 설정·CORS 검증을 대신하지 않습니다.

main UI 보존 비교는 별도의 변경하지 않은 main과 이 브랜치를 실행한 뒤 수행합니다. 이때 후보 서버의 VITE_API_MODE를 설정하지 않아 같은 시연 데이터를 비교해야 합니다.

```bash
MAIN_UI_URL=http://127.0.0.1:5182 CANDIDATE_UI_URL=http://127.0.0.1:5178 npm run test:ui-preserved
```

기존 컴포넌트·CSS·모델·시나리오의 SHA-256, 지도/그리기 함수와 렌더러 마크업을 main 기준값에 대조합니다. 네 역할과 좁은 화면의 배치·위험도 배지·팝업·지도 레이어 스타일·확산 좌표를 비교하며 결과와 캡처는 `test-results/`에 저장합니다.
