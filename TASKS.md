# 작업 목록

## 운영 규칙

- 작업 목록 파일은 `TASKS.md` 하나만 사용한다.
- `TASKS.md`에는 현재 작업 하나만 기록한다.
- 이전 작업 기록은 `docs/TASK_HISTORY.md`에 보관한다.
- 상태 표기: `[ ]` 미완료, `[/]` 진행 중, `[x]` 완료

## 현재 작업: 2026-11-03 주간 무결과 검색어 정리 (첫 회)

목표: `search_candidates` pending 검색어를 심평원 공식 급여 코드와 매칭해 검색에 노출하고, 매주 같은 절차로 반복한다. 절차서: `docs/weekly-unmatched-routine.md`.

## 작업 범위

- [x] 운영 D1 읽기 전용 조회 (pending 21건, 최근 30일 무결과 로그 7종 — 모두 pending/처리됨 범위)
- [x] 분류: A단계 0건, B단계 0건, 제외 21건 (약품·KCD·비급여·단어 조각)
- [x] `database/search-aliases-2026-11-03.sql` 작성 (제외 처리 UPDATE만, 재실행 안전)
- [x] `tests/unmatched_search_aliases.test.js` 항목 추가, 전체 테스트 통과
- [x] `docs/weekly-unmatched-routine.md` 절차서 작성
- [ ] 운영 D1 백업 → 로컬 사본 미리 실행 → 적용 (오케스트레이터/사용자 승인 후, 아직 미실행)
- [ ] 적용 후 `/api/search-aliases` 확인, commit

## 진행 메모

- 운영 DB 쓰기·commit·배포는 하지 않았다.
- 10-16 방식 유지: 승인은 `search_candidates`의 item_id·item_name·item_category·status='approved'.
- 워커는 `search_candidates`에 같은 검색어가 한 번이라도 있으면(rejected 포함) 다시 넣지 않는다.
