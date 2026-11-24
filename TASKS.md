# 작업 목록

## 운영 규칙

- 작업 목록 파일은 `TASKS.md` 하나만 사용한다.
- `TASKS.md`에는 현재 작업 하나만 기록한다.
- 이전 작업 기록은 `docs/TASK_HISTORY.md`에 보관한다.
- 상태 표기: `[ ]` 미완료, `[/]` 진행 중, `[x]` 완료

## 현재 작업: 2026-11-16 주간 무결과 검색어 정리

절차서: `docs/weekly-unmatched-routine.md`. 상세 기록: `docs/TASK_HISTORY.md` 2026-11-16 항목.

## 작업 범위

- [x] pending 2건 분류: `해열제` 제외(약품 분류명), `두통 수액` 질문(C)
- [x] SQL·테스트 작성, 전체 테스트 통과, 백업 → 미리 실행 → 운영 D1 반영(해열제 rejected)
- [x] 사용자 답변(2026-11-16 '제외')대로 `두통 수액` 제외 반영: 백업 → 미리 실행 → 운영 D1 적용. pending 0
- [x] commit (2026-11-24 사용자 승인): `TASKS.md`, `docs/TASK_HISTORY.md`, `database/search-aliases-2026-11-16.sql`, `tests/unmatched_search_aliases.test.js`

## 현재 작업: 2026-11-22 AdSense 심사 준비 (branch `claude/adsense-readiness`)

상세 기록·광고 복구 방법: `docs/TASK_HISTORY.md` 2026-11-22 항목.

## 작업 범위

- [x] 홈의 운영자용 광고 안내 블록과 Kakao AdFit·쿠팡 파트너스 광고 칸·스크립트를 모든 공개 페이지에서 제거
- [x] 없는 주소가 홈(200)으로 열리던 soft 404 수정: `frontend/404.html` 추가
- [x] `/terms`(이용약관), `/disclaimer`(면책·의료 고지) 추가, 모든 공개 페이지 하단·sitemap·llms.txt 연결
- [x] 테스트 갱신 및 로컬 확인
- [ ] 사용자 확인 후 `main` 병합·배포 (배포 후 운영 주소에서 없는 주소의 404 응답 재확인)
- [ ] 이용약관·면책 고지 문구 검토 (법률 검토 받지 않은 초안)
