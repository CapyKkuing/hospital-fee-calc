# 주간 무결과 검색어 정리 절차

매주 월요일 09:00 KST에 Worker `automation/weekly-missing-items`가 지난 7일 무결과 검색어를 `search_candidates`에 `pending`으로 넣는다. 이를 심평원 공식 급여 코드에 연결(approved)하거나 제외(rejected)한다. 프런트는 `/api/search-aliases`·`/api/medical-items`로 D1을 실시간 읽으므로 DB 반영만으로 검색에 나온다(배포 불필요).

모든 명령은 `automation/weekly-missing-items` 폴더에서 실행한다. 비밀값은 명령에 쓰지 않는다(wrangler 로그인 세션 사용).

## 1. 조회 (읽기 전용, SELECT만)

```bash
npx wrangler d1 execute search-analytics-db --remote --json --command "SELECT id, query, normalized_query, created_at FROM search_candidates WHERE status='pending'"
```

빠진 검색어 확인(최근 30일 무결과):

```bash
npx wrangler d1 execute search-analytics-db --remote --json --command "SELECT query, COUNT(*) n, MAX(created_at) last FROM search_logs WHERE result_count=0 AND created_at >= datetime('now','-30 days') GROUP BY query ORDER BY n DESC"
```

이미 있는 급여 코드 확인(운영 D1과 저장소 정적 수가표 양쪽):

```bash
npx wrangler d1 execute search-analytics-db --remote --json --command "SELECT code, name, is_benefit FROM medical_items WHERE name LIKE '%키워드%' OR code LIKE '%코드%'"
```

저장소 쪽은 `frontend/assets/js/fee_schedule_items.js`(고시 기준일 확인)에서 코드·항목명·급여 여부를 찾는다. 정적 수가표에 있는 코드는 `medical_items`에 넣지 않는다(가격 중복 방지).

## 2. 판단 기준

| 단계 | 조건 | 처리 |
|---|---|---|
| A (자동 반영) | 이미 사이트에 있는 급여 코드(`is_benefit=1` 또는 정적 수가표 급여)에 뜻이 명확히 대응. 코드·항목명을 D1과 `fee_schedule_items.js` 양쪽에서 확인 | `approved`로 연결 |
| B (보류) | 공식 급여 코드는 있으나 사이트에 없어 가격 입력 필요 | 코드·고시 출처만 보고, 반영 안 함 |
| 제외 | 비급여, 뜻이 애매한 단어 조각(`leg`, `lower`), 질병코드(KCD)·진단명, 약품명, 무의미 문자열 | `rejected` |

- 확인하지 못하면 보류한다. 코드·의료 정보를 추측하지 않는다.
- 한 검색어가 여러 코드에 해당하면(예: 주사치료) 대표 급여 코드를 각각 승인 행으로 추가하는 방식(10-16 참고). 대표성이 불분명하면 보류.
- 출처: HIRA 건강보험요양급여비용 목록(최신 고시 확인). 비공식 자료는 근거로 쓰지 않는다.
- 워커는 같은 `normalized_query` 행이 하나라도 있으면(rejected 포함) 다시 넣지 않는다. 그래서 제외도 `rejected`로 남겨야 매주 반복되지 않는다.

## 3. SQL 작성

`database/search-aliases-<날짜>.sql` 파일을 만든다. 규칙: UPDATE/INSERT만, DELETE·DROP·ALTER 금지, 재실행 안전. 양식은 `search-aliases-2026-10-16.sql`(승인)과 `search-aliases-2026-11-03.sql`(제외)을 따른다.

- 기존 pending 행 승인: `UPDATE search_candidates SET item_id=…, item_name=…, item_category=…, status='approved' WHERE id=(…가장 오래된 pending 1건…)` 후, 나머지는 `INSERT … SELECT … WHERE NOT EXISTS (…)`.
- 제외: `UPDATE search_candidates SET status='rejected' WHERE status='pending' AND item_id IS NULL AND normalized_query IN (…)`.
- `tests/unmatched_search_aliases.test.js`에 항목 테스트를 추가한다(코드·가격이 정적 수가표와 일치, 두 번 실행해도 중복 없음).

## 4. 백업 → 미리 실행 → 적용

```bash
npx wrangler d1 export search-analytics-db --remote --output=C:/Users/giro0/Desktop/Claude/backup/<날짜>-search-analytics-db.sql
```

로컬 사본에서 미리 실행(운영 영향 없음). 백업 파일을 로컬 D1에 넣은 뒤 같은 SQL을 실행한다:

```bash
npx wrangler d1 execute search-analytics-db --local --file=<백업경로>
npx wrangler d1 execute search-analytics-db --local --file=../../database/search-aliases-<날짜>.sql
npx wrangler d1 execute search-analytics-db --local --command "SELECT status, COUNT(*) FROM search_candidates GROUP BY status"
```

결과(승인/제외 건수)가 기대와 같으면 운영에 적용한다. 승인 없이 적용하지 않는다.

```bash
npx wrangler d1 execute search-analytics-db --remote --file=../../database/search-aliases-<날짜>.sql
```

## 5. 적용 후 확인

- 승인 건: `https://hospital-fee-calc.pages.dev/api/search-aliases`에 새 별칭이 보이는지, 사이트에서 해당 검색어로 코드가 나오는지 확인.
- 전체: `SELECT status, COUNT(*) FROM search_candidates GROUP BY status`로 pending이 0(또는 보류분만)인지 확인.
- 문제가 있으면 백업 파일로 복구를 오케스트레이터/사용자와 논의한다(운영 복구는 임의 실행 금지).

## 6. 보고 형식

표 하나: `검색어 | 판정(A/B/제외) | 코드 | 항목명 | 근거`. 끝에 근거 출처와 신뢰도. 새 코드·가격 입력이 필요한 B단계는 코드·고시 출처만 적고 사용자 결정을 기다린다.

## 첫 회(2026-11-03) 결과

pending 21건 전부 제외(약품 3, KCD·진단명 4, 비급여 3, 단어 조각·오타 11). A·B 0건. 상세: `database/search-aliases-2026-11-03.sql`.
