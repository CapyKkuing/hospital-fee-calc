-- 2026-09-25 무결과 검색어 보강: 사용자가 확인한 급여 행위만 연결한다.
-- HIRA 2026 행위 급여 목록의 MM300 적외선치료[1일당] 상대가치점수는 9.21이다.
-- Source: https://www.hira.or.kr/ebooksc/2026/03/BZ202603053039374.pdf (p. 401)
-- 2026-09-01 시행 전체판에서도 MM300 단가 변경이 없으며 source_date는 수가 기준일이다.

-- 기존 정적 FEE_MM300의 급여·가격은 유지하고, DB 검색 분류만 올바른 행위 분류로 overlay한다.
INSERT INTO medical_items (
  code, name, category, item_group, item_type,
  clinic_price, hospital_price, is_benefit,
  source_url, source_date, status, updated_at
) VALUES (
  'FEE_MM300', '적외선치료[1일당]', 'procedure', 'procedure_hira', 'MM',
  880, 770, 1,
  'https://www.hira.or.kr/ebooksc/2026/03/BZ202603053039374.pdf',
  '2026-09-01', 'approved', CURRENT_TIMESTAMP
)
ON CONFLICT(code) DO UPDATE SET
  name = excluded.name,
  category = excluded.category,
  item_group = excluded.item_group,
  item_type = excluded.item_type,
  clinic_price = excluded.clinic_price,
  hospital_price = excluded.hospital_price,
  is_benefit = excluded.is_benefit,
  source_url = excluded.source_url,
  source_date = excluded.source_date,
  status = 'approved',
  updated_at = CURRENT_TIMESTAMP;

-- 사용자 확정 exact query만 alias로 추가한다. 기존 alias는 삭제·교체하지 않는다.
INSERT OR IGNORE INTO medical_item_aliases (item_code, normalized_alias)
VALUES ('FEE_MM300', '적외선 하지');

-- 기존 pending 후보가 여러 건이어도 가장 오래된 한 건만 승인한다.
UPDATE search_candidates
SET item_id = 'FEE_MM300',
    item_name = '적외선치료[1일당]',
    item_category = 'procedure',
    status = 'approved',
    updated_at = CURRENT_TIMESTAMP
WHERE id = (
  SELECT candidate.id
  FROM search_candidates AS candidate
  WHERE candidate.normalized_query = '적외선 하지'
    AND candidate.status = 'pending'
    AND NOT EXISTS (
      SELECT 1
      FROM search_candidates AS approved
      WHERE approved.normalized_query = '적외선 하지'
        AND approved.item_id = 'FEE_MM300'
        AND approved.status = 'approved'
    )
  ORDER BY candidate.id
  LIMIT 1
);

INSERT INTO search_candidates (
  query, normalized_query, item_id, item_name, item_category,
  status, created_at, updated_at
)
SELECT
  '적외선 하지', '적외선 하지', 'FEE_MM300', '적외선치료[1일당]', 'procedure',
  'approved', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (
  SELECT 1
  FROM search_candidates
  WHERE normalized_query = '적외선 하지'
    AND item_id = 'FEE_MM300'
    AND status = 'approved'
);

-- 자연분만은 초산·경산을 검색어만으로 구분할 수 없으므로 공식 제1태아 주코드 두 건을 모두 승인한다.
-- frontend의 정적 alias가 이미 두 코드를 가리키므로 medical_items 가격 overlay는 추가하지 않는다.
UPDATE search_candidates
SET item_id = 'FEE_R4351',
    item_name = '정상분만(초산)-제1태아',
    item_category = 'surgery',
    status = 'approved',
    updated_at = CURRENT_TIMESTAMP
WHERE id = (
  SELECT candidate.id
  FROM search_candidates AS candidate
  WHERE candidate.normalized_query = '자연분만'
    AND candidate.status = 'pending'
    AND NOT EXISTS (
      SELECT 1
      FROM search_candidates AS approved
      WHERE approved.normalized_query = '자연분만'
        AND approved.item_id = 'FEE_R4351'
        AND approved.status = 'approved'
    )
  ORDER BY candidate.id
  LIMIT 1
);

UPDATE search_candidates
SET item_id = 'FEE_R4356',
    item_name = '정상분만(경산)-제1태아',
    item_category = 'surgery',
    status = 'approved',
    updated_at = CURRENT_TIMESTAMP
WHERE id = (
  SELECT candidate.id
  FROM search_candidates AS candidate
  WHERE candidate.normalized_query = '자연분만'
    AND candidate.status = 'pending'
    AND NOT EXISTS (
      SELECT 1
      FROM search_candidates AS approved
      WHERE approved.normalized_query = '자연분만'
        AND approved.item_id = 'FEE_R4356'
        AND approved.status = 'approved'
    )
  ORDER BY candidate.id
  LIMIT 1
);

INSERT INTO search_candidates (
  query, normalized_query, item_id, item_name, item_category,
  status, created_at, updated_at
)
SELECT
  '자연분만', '자연분만', 'FEE_R4351', '정상분만(초산)-제1태아', 'surgery',
  'approved', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (
  SELECT 1
  FROM search_candidates
  WHERE normalized_query = '자연분만'
    AND item_id = 'FEE_R4351'
    AND status = 'approved'
);

INSERT INTO search_candidates (
  query, normalized_query, item_id, item_name, item_category,
  status, created_at, updated_at
)
SELECT
  '자연분만', '자연분만', 'FEE_R4356', '정상분만(경산)-제1태아', 'surgery',
  'approved', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (
  SELECT 1
  FROM search_candidates
  WHERE normalized_query = '자연분만'
    AND item_id = 'FEE_R4356'
    AND status = 'approved'
);
