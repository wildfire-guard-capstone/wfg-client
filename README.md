# 산불 대응 AI 의사결정 지원 시스템 — React·TypeScript

확정된 API 34개를 화면에 연결한 프론트엔드입니다. 기본 실행은 명세와 같은 요청·응답을 사용하는 **목업 모드**이며, 환경 설정으로 실제 서버 호출로 전환합니다. 원본의 헤더·좌측 정보창·지도 배치와 CSS를 바탕으로, API 응답을 React 상태로 렌더링하도록 전환했습니다.

## 실행

Node.js 24 권장(지원 범위: Node.js 22.12 이상인 22.x 또는 24 이상).

```bash
npm ci
npm run dev
```

[http://127.0.0.1:5173](http://127.0.0.1:5173)에 접속합니다. 종료는 `Ctrl+C`입니다. 별도 API 키·백엔드·DB 없이 기본 목업을 실행할 수 있습니다. 바탕지도·위성영상에는 인터넷 연결이 필요합니다.

## 목업 계정

비밀번호는 모두 `mock-password`입니다. 사용자 구분을 바꾸면 목업 계정이 자동 입력됩니다.

| 사용자 구분  | 아이디         |
| ------------ | -------------- |
| 통합지휘권자 | mock-commander |
| 열람자       | mock-viewer    |
| 상황 보고자  | mock-reporter  |
| 전산 관리자  | mock-admin     |

목업 계정과 토큰은 실제 서버에서 사용할 수 없습니다. 로그인·변경 데이터는 메모리에 저장되므로 새로고침하면 초기화됩니다. 모든 목업 산불·인물·시설·기상·제안은 합성 데이터입니다.

## 연결한 화면

- 로그인·내 정보·로그아웃, 역할별 접근 제한과 401 재로그인 안내
- 진행/종료 산불 목록·상세·화선 버전·종료 확인
- 지도 레이어와 bbox 도형 조회, 발화점 지정·화선 그리기/GeoJSON 입력, 새 산불 보고·화선 보고/정정
- 확산 예측 요청·작업 상태 조회·대기 중지/재조회·P1~P8 재생, 기상·위험도
- 제안서 12항목(S1~S6·E1~E6), 버전·비교·근거 원문
- AI 질의응답·정정 확인안 취소/저장·정정 이력·제안 재생성 실패/재시도
- 진화자원·집계·기지·이벤트 로그 조회, 관리자 계정 조회·발급

자원/기지 수정·삭제, 계정 수정·회수 등 미확정 12개 API와 계약에 없는 기능은 연결하지 않았습니다. 세부 범위·기준 커밋·타입 차이는 [API 연동 가이드](docs/API-INTEGRATION.md), 점검 범위는 [화면 동작 점검](docs/API-SCREEN-VERIFICATION.md)에 있습니다.

## 실제 서버 연결

`.env.example`을 `.env.local`로 복사하고 백엔드에서 받은 접속 방법과 계정으로 설정합니다.

```dotenv
VITE_API_MODE=http
VITE_API_BASE_URL=/api/v1
# 실제로 연결한 로컬 터널 포트의 예시. 필요한 경우에만 사용합니다.
API_PROXY_TARGET=http://127.0.0.1:8000
```

Vite를 재시작해야 합니다. 개발 프록시는 `npm run dev`에서만 동작합니다. 운영 배포는 별도 프록시 또는 CORS가 허용된 주소가 필요합니다. `VITE_*`에 비밀번호·토큰·키를 넣지 마세요. 자세한 내용은 [연동 가이드](docs/API-INTEGRATION.md#실제-서버로-바꾸기)를 확인하세요.

이번 점검은 목업과 브라우저에서 수행했습니다. 실제 EC2·DB·GPU·LLM의 배포 상태나 실제 서버 응답은 검증하지 않았습니다.

## 파일을 수정할 위치

| 내용                            | 파일·폴더                                     |
| ------------------------------- | --------------------------------------------- |
| 진입점                          | src/App.tsx                                   |
| 로그인·세션·공통 헤더           | src/features/api/ApiApp.tsx                   |
| 산불 목록·현황·예측·기상·위험도 | src/features/api/Workspace.tsx                |
| 지도·API 레이어                 | src/features/api/IncidentMap.tsx              |
| 발화점/화선 그리기·보고·정정    | src/features/api/Drawing.tsx, ReportPanel.tsx |
| 제안·버전·비교·근거             | src/features/api/ProposalPanel.tsx            |
| AI·상황 정정                    | src/features/api/AssistantPanel.tsx           |
| 자원·기지·로그·계정 발급        | src/features/api/Management.tsx               |
| 로딩·오류·취소·화면 스타일      | src/features/api/hooks.ts, ui.tsx, api.css    |
| API 타입·경로·호출 함수         | src/api/                                      |
| 명세 형태의 목업                | src/api/mock/                                 |
| 브라우저 테스트                 | tests/e2e/screens.spec.mjs                    |

`src/components/`, `src/runtime/`, `src/models/`, `src/data/`의 이전 시연 구현은 비교·기존 계산 회귀 테스트용으로 남아 있습니다. 현재 진입점에서는 기존 `MockRuntimeProvider`를 실행하지 않습니다. [이전 전환 기록](docs/MIGRATION.md)과 [이전 검증 기록](docs/VERIFICATION.md)은 당시 시연 구현에 관한 자료입니다. 과거 `?fail=...`, `?merge=1` 플래그도 현재 API 화면에는 적용하지 않습니다.

## 검증·빌드

```bash
npm run typecheck
npm test
npm run api:demo
npm run build
npm run preview
```

브라우저 점검을 재현하려면:

```bash
npx playwright install chromium
npm run test:e2e
```

테스트는 실제 서버 대신 HTTP 요청을 명세 형태의 상태형 목업으로 응답합니다. API 접속 정보나 실제 DB 변경은 필요하지 않습니다. `test-results/`의 결과·트레이스는 Git에서 제외합니다.

`build`는 타입 검사 후 `dist/`를 생성하고, `preview`는 [http://127.0.0.1:4173](http://127.0.0.1:4173)에서 결과를 제공합니다. 정적 결과만 보려면 빌드 후 `python3 -m http.server 4173 --bind 127.0.0.1 --directory dist`도 사용할 수 있습니다. `index.html`을 직접 여는 대신 HTTP 서버를 사용하세요.
