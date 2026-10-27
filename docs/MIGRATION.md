# v4 React + TypeScript 전환 기록

## 목표와 변경

로컬에서 개발·시연할 수 있도록 기존 정적 HTML 목업의 화면과 기능을 보존했습니다.

1. 기존 `index.html`의 화면을 15개 `.tsx` 컴포넌트로 나눴습니다. CSS 클래스, DOM ID, 문구, 화면 배치를 유지했습니다.
2. 주요 고정 버튼·입력·탭·폼 이벤트를 JSX의 React 이벤트 핸들러로 연결했습니다. `useMockActions()`가 타입이 지정된 컨트롤러 액션을 호출합니다.
3. `data*.js`의 전역 변수 대신 TypeScript 모듈 import를 사용합니다. 시나리오 데이터는 마운트마다 복제하여 StrictMode·개발 새로고침에서 수정 데이터가 공유되지 않게 했습니다.
4. 합성 확산과 기하 계산을 `models/geometry.ts`, 위험도 계산을 `models/risk.ts`로 분리했습니다.
5. 시나리오·사용자 역할·화선·예측·제안·위험도·앱 상태 및 MapLibre/GeoJSON의 타입을 추가했습니다. 모든 실행 소스는 `.ts` 또는 `.tsx`이며 원본 `app.js`를 script 태그로 삽입하지 않습니다.
6. React 마운트의 수명에 맞춰 타이머·전역 리스너·드래그 리스너·ResizeObserver·마커·지도 인스턴스를 정리합니다.
7. MapLibre CDN 로딩을 npm 의존성으로 교체했습니다. 기존 4.7.1에서 6.14.0으로 갱신하고 ESM import, Vite 워커 번들 설정을 반영했습니다. 지도 데이터·표현은 유지했습니다. [공식 Vite 연동 안내](https://maplibre.org/maplibre-gl-js/docs/#installation)를 참고했습니다.

## React와 컨트롤러의 경계

`App.tsx`와 `components/`는 실제 React JSX 화면입니다. `MockRuntimeProvider`가 컨트롤러를 생성·정리하고 JSX 이벤트를 연결합니다. 원본 HTML을 iframe이나 `dangerouslySetInnerHTML` 하나로 감싸는 방식은 사용하지 않았습니다.

원본에서 HTML 문자열로 만드는 동적 표, 제안 카드, 근거 본문, 모달 내용, 채팅 응답과 관리자 폼은 `createMockRuntime.ts`에 유지했습니다. 이 영역은 컨트롤러가 DOM을 관리합니다. 지도 내부는 MapLibre가 관리합니다. 이 부분까지 모두 React 컴포넌트와 state로 재작성하지는 않았습니다.

같은 DOM 영역을 React state와 컨트롤러 양쪽에서 동시에 수정하지 마세요. 동적 영역을 React로 옮길 때는 해당 컨트롤러 렌더 함수와 이벤트 연결을 함께 제거하고, 표시 데이터를 props나 외부 store 구독으로 전달해야 합니다. 예를 들어 제안 카드 전체를 React로 옮기려면 `#cards`를 수정하는 `renderProposal()` 로직과 카드 이벤트를 `ProposalCards.tsx` 및 상태 구독으로 함께 교체합니다.

## 타입 검사 범위

`npm run typecheck`가 전체 TypeScript 소스를 검사합니다. 기존 동적 컨트롤러를 보존하는 전환 단계이므로 `tsconfig.json`의 `strict`는 `false`입니다. 일부 기존 함수 매개변수는 암시적 `any`를 허용합니다. 데이터·상태·모델·React 액션·MapLibre 경계에는 구체적인 타입을 넣었으며, `@ts-nocheck` 또는 오류 무시 지시문은 사용하지 않았습니다.

후속 단계에서 동적 화면을 하나씩 React state 기반으로 전환하면서 `noImplicitAny`와 `strictNullChecks`를 순서대로 활성화할 수 있습니다. 현재 전달물은 엄격한 타입 모드를 전부 적용한 서비스 코드로 보장하지 않습니다.

## 실행·데이터 성격

원본과 같이 모든 예측·AI·권한 관리는 목업입니다. 외부 지도 타일을 제외한 서버 API를 새로 추가하지 않았습니다. 규칙·법령·판단 기준의 정확성을 새로 검증하거나 수정하는 작업은 수행하지 않았습니다.

Node.js 24 환경에서 빌드·타입 검사·회귀 테스트를 확인했습니다. `package-lock.json`을 포함했으며 `node_modules`는 배포 묶음에서 제외합니다. 사전 빌드 결과인 `dist/`는 HTTP 서버로 바로 시연할 수 있습니다.

MapLibre가 큰 라이브러리여서 빌드 시 500 kB 초과 청크 안내가 표시됩니다. 이는 빌드 실패가 아니며, 후속 서비스 개발에서 지도 지연 로딩이나 코드 분할을 적용할 수 있습니다.

## 원본과의 수치 일치

원본 JavaScript의 계산 함수에서 얻은 기준값을 `tests/fixtures/original-v4.json`에 저장했습니다. 8개 확산 면적·첫 꼭짓점, 일반 위험도 2회, 병합 위험도를 TypeScript 구현과 비교합니다. 원본 설명 주석에는 두 번째 위험도가 3.51로 적혀 있지만 실제 원본 계산값은 약 3.4787입니다. 변환본은 실제 계산 결과를 보존하므로 화면에는 3.48로 표시됩니다.
