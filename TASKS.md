# 작업 목록

## 운영 규칙

- 작업 목록 파일은 `TASKS.md` 하나만 사용한다.
- `TASKS.md`에는 현재 작업 하나만 기록한다.
- 이전 작업 기록은 `docs/TASK_HISTORY.md`에 보관한다.
- 상태 표기: `[ ]` 미완료, `[/]` 진행 중, `[x]` 완료

## 현재 작업: 2026-10-17 검색 유입용 비용 안내 페이지 5개

목표: 검색에 걸릴 비용 안내 페이지를 공개 수가·비급여 데이터로 직접 작성해 유입을 늘린다. 대량 자동 생성은 하지 않는다.

## 작업 범위

- [x] 복부·간 초음파 비용 (`/abdominal-ultrasound-cost`)
- [x] 도수치료 가격 (`/manual-therapy-cost`)
- [x] 무릎 MRI 비용 (`/knee-mri-cost`)
- [x] 수면내시경 비용 (`/sedation-endoscopy-cost`)
- [x] 병원 종류별 본인부담률 (`/copay-rate-guide`)
- [x] 자동 테스트·로컬 모바일 화면 확인 (`frontend_v3_browser.test.js`의 종별가산 문구 실패는 기존 main에서도 동일, 이번 변경과 무관)
- [/] commit(커밋)·PR·배포 (2026-10-17 사용자 승인)
- [ ] 2~4주 뒤 서치콘솔·네이버 노출 확인 후 나머지 주제 진행

## 진행 메모

- 근거: 운영 D1 검색 로그(30일 37건, 최다 복부초음파), `fee_schedule_items.js`(2026-05-01), `nonbenefit_region_prices.json`(2026-01 적용분).
- 새 페이지마다 `index.html` 계산기 목록, `sitemap.xml`, `llms.txt`, `tests/frontend_v3_pages.test.js`의 `seoPages`에 추가한다.
- 표 스타일은 `assets/css/seo-page.css`의 `.table-wrap`·`table`·`.table-note`를 쓴다.
