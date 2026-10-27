# 산불 대응 AI 의사결정 지원 시스템 — React + TypeScript 목업

기존 prototype v4의 화면·CSS·시연 데이터를 유지하며 React + TypeScript + MapLibre GL JS로 옮긴 로컬 개발용 프로젝트입니다. 원본 폴더는 수정하지 않았습니다.

## 개발 실행

**Node.js 24 권장** (지원 범위: Node.js 22.12 이상인 22.x 또는 24 이상)과 npm이 필요합니다. Node.js 20.15에서는 이 프로젝트의 Vite를 실행할 수 없으므로 먼저 Node.js를 업데이트하세요.

압축을 푼 프로젝트 폴더에서 실행합니다.

```bash
npm install
npm run dev
```

[http://127.0.0.1:5173](http://127.0.0.1:5173)에 접속합니다. 서버 종료는 터미널에서 `Ctrl+C`입니다. 포트가 사용 중이면 `npm run dev -- --port 5175`처럼 다른 포트를 지정할 수 있습니다.

의존성을 잠금 파일과 정확히 동일하게 설치하려면 `npm install` 대신 `npm ci`를 사용하세요.

## 빌드된 화면만 바로 보기

`dist/`에 미리 빌드한 결과도 포함했습니다. Python 3가 있다면 npm 설치 없이 프로젝트 폴더에서 다음 명령으로 볼 수 있습니다.

```bash
python3 -m http.server 4173 --bind 127.0.0.1 --directory dist
```

[http://127.0.0.1:4173](http://127.0.0.1:4173)에 접속하세요. `index.html`을 더블클릭하는 `file://` 방식 대신 HTTP 서버로 실행해야 합니다. `dist/`는 생성 결과이므로 화면을 수정할 때는 `src/`를 수정하고 다시 빌드하세요.

## 시연 계정

모든 초기 비밀번호는 `1234`입니다. 로그인 화면에서 사용자 구분을 바꾸면 해당 시연 계정이 자동 입력됩니다.

| 사용자 구분 | 아이디 | 권한 |
| --- | --- | --- |
| 통합지휘권자 | cmd01 | 조작 |
| 열람자 | view01 | 열람 |
| 상황 보고자 | rep01 | 보고 |
| 전산 관리자 | admin01 | 관리 |

## 필요한 것과 유지한 범위

- 별도 API 키, 백엔드, 데이터베이스 없이 동작합니다.
- 바탕지도·위성영상·지도 라벨은 외부 서비스를 사용하므로 인터넷 연결이 필요합니다.
- 예측·위험도·AI 답변·로그인·계정 관리는 원본과 같은 시연 기능입니다. 실제 ELMFIRE, LLM, 기상 API 또는 서버 인증을 추가하지 않았습니다.
- 로그인 상태는 기존과 같이 `sessionStorage`에 저장합니다. 보고·계정·자원 등 변경 데이터는 메모리에 있으므로 새로고침하면 초기 데이터로 돌아갑니다.
- 기존 네 가지 역할, 보고·화선 버전, 확산 예측, 시간 재생, 제안·근거·이력, 채팅·상황 정정, 관리자 기능과 개발용 실패·병합 설정을 유지했습니다.

## 파일을 수정할 위치

React에서 JSX를 사용하는 화면 파일 확장자는 **`.tsx`**, 일반 TypeScript 로직 파일은 **`.ts`**입니다. `index.html`은 React가 들어갈 빈 루트와 시작 스크립트만 갖습니다.

| 수정할 내용 | 파일·폴더 |
| --- | --- |
| 전체 화면 조합 | `src/App.tsx` |
| 로그인 화면 | `src/components/LoginScreen.tsx` |
| 상단 헤더·지도 레이어·재생 도구 | `src/components/AppHeader.tsx`, `MapToolbar.tsx` |
| 상황·대응제안 화면 틀 | `src/components/IncidentPanel.tsx` |
| 상황 보고 입력 화면 틀 | `src/components/ReporterPanel.tsx` |
| 지도·팝업 화면 틀 | `src/components/MapStage.tsx`, `ChatPanel.tsx`, `RiskPanel.tsx` 등 |
| 관리자 화면 틀 | `src/components/AdminScreen.tsx` |
| 색·크기·배치 | `src/styles/app.css`, `markers.css` |
| 초기 계정·산불·시설·기상·규칙·시연 설정 | `src/data/scenario.ts` |
| 경계·도로·담수지 | `src/data/boundaries.ts`, `osmLines.ts`, `waterSources.ts` |
| 합성 확산·기하 계산 | `src/models/geometry.ts` |
| 위험도 계산 | `src/models/risk.ts` |
| 목업 동작·동적 표·제안·관리자 폼 렌더링 | `src/runtime/createMockRuntime.ts` |
| React 이벤트와 목업 컨트롤러 연결 | `src/runtime/MockRuntimeProvider.tsx` |
| 데이터·상태 타입 | `src/types/scenario.ts`, `domain.ts` |

**전환 방식:** 화면 틀은 실제 JSX 컴포넌트이며, 주요 버튼·입력 이벤트는 React 핸들러에서 타입이 지정된 액션을 호출합니다. 계산과 데이터는 TypeScript 모듈입니다. 원본의 동작을 보존하기 위해 동적으로 생성하는 표·카드·모달 본문·일부 폼은 컨트롤러의 DOM 렌더링을 유지했습니다. 모든 상태와 동적 화면을 React state/hooks로 다시 구현한 구조는 아닙니다. 자세한 경계와 다음 수정 방법은 [전환 기록](docs/MIGRATION.md)에 있습니다.

## 확인·빌드 명령

```bash
npm run typecheck
npm test
npm run build
npm run preview
```

`build`는 타입 검사 후 `dist/`를 생성합니다. `preview`는 [http://127.0.0.1:4173](http://127.0.0.1:4173)에서 빌드 결과를 제공합니다. `test`는 원본 v4 계산 결과와 비교하는 회귀 테스트 6개입니다. 검증 결과는 [검증 기록](docs/VERIFICATION.md)에 정리했습니다.

## 실패·병합 시연

개발 서버 주소 뒤에 아래 쿼리를 붙이고 새로고침합니다.

```text
/?fail=weather
/?fail=predict
/?fail=proposal
/?fail=risk
/?fail=riskvars
/?fail=resources
/?fail=chat
/?merge=1
```

여러 실패 항목은 쉼표로 연결할 수 있습니다. 일부 실패 플래그는 원본과 같이 한 번 사용된 뒤 해제됩니다.

원본 요구사항과 시나리오는 [원본 명세](docs/ORIGINAL_REQUIREMENTS.md)에 보관했습니다.
