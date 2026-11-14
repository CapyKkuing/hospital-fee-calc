-- 2026-11-11 주간 무결과 검색어 정리 (11-09 예약분, pending 2건).
-- 방식: 10-16·11-03과 동일. 사용자 답변(2026-11-11)으로 확정한 판정만 반영한다.
-- 근거: 저장소 fee_schedule_items.js(2026-05-01 고시, HIRA 건강보험요양급여비용 목록), 운영 D1 조회(2026-11-11).
--
-- 승인
--   요소검사 → FEE_D2300 요소질소[NPN포함][화학반응-장비측정] (혈액검사)
--            + FEE_D5896 Helicobacter pylori검사-요소호흡검사[정밀분광-질량분석] (호흡검사)
--   두 코드 모두 정적 수가표 급여 항목이므로 medical_items 가격 overlay는 추가하지 않는다.
-- 제외
--   방사선촬영: 부위가 특정되지 않아 단순촬영 코드가 너무 많음(사용자 판단으로 제외).

-- ===== 요소검사: 가장 오래된 pending 1건을 D2300으로 승인, D5896은 새 승인 행 =====
UPDATE search_candidates
SET item_id = 'FEE_D2300',
    item_name = '요소질소[NPN포함][화학반응-장비측정]',
    item_category = 'specimen',
    status = 'approved',
    updated_at = CURRENT_TIMESTAMP
WHERE id = (
  SELECT candidate.id
  FROM search_candidates AS candidate
  WHERE candidate.normalized_query = '요소검사'
    AND candidate.status = 'pending'
    AND NOT EXISTS (
      SELECT 1
      FROM search_candidates AS approved
      WHERE approved.normalized_query = '요소검사'
        AND approved.item_id = 'FEE_D2300'
        AND approved.status = 'approved'
    )
  ORDER BY candidate.id
  LIMIT 1
);
INSERT INTO search_candidates (query, normalized_query, item_id, item_name, item_category, status, created_at, updated_at)
SELECT '요소검사', '요소검사', 'FEE_D2300', '요소질소[NPN포함][화학반응-장비측정]', 'specimen', 'approved', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM search_candidates WHERE normalized_query = '요소검사' AND item_id = 'FEE_D2300' AND status = 'approved');
INSERT INTO search_candidates (query, normalized_query, item_id, item_name, item_category, status, created_at, updated_at)
SELECT '요소검사', '요소검사', 'FEE_D5896', 'Helicobacter pylori검사-요소호흡검사[정밀분광-질량분석]', 'specimen', 'approved', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM search_candidates WHERE normalized_query = '요소검사' AND item_id = 'FEE_D5896' AND status = 'approved');

-- ===== 제외(reject): 다시 실행해도 pending 행만 바뀐다 =====
UPDATE search_candidates
SET status = 'rejected',
    updated_at = CURRENT_TIMESTAMP
WHERE status = 'pending'
  AND item_id IS NULL
  AND normalized_query IN ('방사선촬영');
