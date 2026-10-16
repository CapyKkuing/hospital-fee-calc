-- 2026-10-16 무결과 검색어 보강: 공식 급여 코드가 확인된 검색어만 승인한다.
-- 근거: HIRA 2026 건강보험요양급여비용 목록 (https://www.hira.or.kr/ebooksc/2026/03/BZ202603053039374.pdf)
--   D1980 M2BPGi[정밀면역검사]: 간 섬유화 선별 진단 혈액검사. 「선별급여 지정 및 실시 등에 관한 기준」 별표2 적용(선별급여).
--   KK010 피하 또는 근육내주사, KK020 정맥내 일시 주사[1일당], KK090 관절강내 주사.
-- 세 코드 모두 frontend 정적 수가표에 같은 가격으로 있으므로 medical_items 가격 overlay는 추가하지 않는다.
--
-- 보류(승인하지 않음):
--   복부섬유·섬유: 의도는 간섬유화 스캔(Fibroscan)으로 보이나 EZ829 간섬유화검사·EZ981 횡파 탄성 초음파는 비급여이고 가격 근거가 없다.
--   자가골수: 자가 골수 흡인 농축물 관절강 주사(BMAC)는 비급여 신의료기술로, 조혈모세포 수집(X5062)에 연결하면 오매핑이다.
--   혈답: 혈압·혈당 중 어느 오타인지 판단할 수 없다.
--   안면마비: 질환명이라 단일 수가 코드로 연결할 수 없다.

-- 간섬유화·섬유화 → D1980 (같은 이용자가 간섬유화 → 섬유화 순서로 검색했다)
INSERT INTO search_candidates (query, normalized_query, item_id, item_name, item_category, status, created_at, updated_at)
SELECT '간섬유화', '간섬유화', 'FEE_D1980', 'M2BPGi[정밀면역검사]', 'specimen', 'approved', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM search_candidates WHERE normalized_query = '간섬유화' AND item_id = 'FEE_D1980' AND status = 'approved');
INSERT INTO search_candidates (query, normalized_query, item_id, item_name, item_category, status, created_at, updated_at)
SELECT '섬유화', '섬유화', 'FEE_D1980', 'M2BPGi[정밀면역검사]', 'specimen', 'approved', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM search_candidates WHERE normalized_query = '섬유화' AND item_id = 'FEE_D1980' AND status = 'approved');

-- 주사치료 → 주사 종류를 검색어만으로 구분할 수 없으므로 대표 급여 주사 3건을 승인한다.
-- 기존 pending 후보는 가장 오래된 한 건만 KK010으로 승인하고, 나머지 코드는 새 승인 행으로 추가한다.
UPDATE search_candidates
SET item_id = 'FEE_KK010',
    item_name = '피하또는근육내주사',
    item_category = 'procedure',
    status = 'approved',
    updated_at = CURRENT_TIMESTAMP
WHERE id = (
  SELECT candidate.id
  FROM search_candidates AS candidate
  WHERE candidate.normalized_query = '주사치료'
    AND candidate.status = 'pending'
    AND NOT EXISTS (
      SELECT 1
      FROM search_candidates AS approved
      WHERE approved.normalized_query = '주사치료'
        AND approved.item_id = 'FEE_KK010'
        AND approved.status = 'approved'
    )
  ORDER BY candidate.id
  LIMIT 1
);
INSERT INTO search_candidates (query, normalized_query, item_id, item_name, item_category, status, created_at, updated_at)
SELECT '주사치료', '주사치료', 'FEE_KK010', '피하또는근육내주사', 'procedure', 'approved', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM search_candidates WHERE normalized_query = '주사치료' AND item_id = 'FEE_KK010' AND status = 'approved');
INSERT INTO search_candidates (query, normalized_query, item_id, item_name, item_category, status, created_at, updated_at)
SELECT '주사치료', '주사치료', 'FEE_KK020', '정맥내일시주사[1일당]', 'procedure', 'approved', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM search_candidates WHERE normalized_query = '주사치료' AND item_id = 'FEE_KK020' AND status = 'approved');
INSERT INTO search_candidates (query, normalized_query, item_id, item_name, item_category, status, created_at, updated_at)
SELECT '주사치료', '주사치료', 'FEE_KK090', '관절강내주사', 'procedure', 'approved', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM search_candidates WHERE normalized_query = '주사치료' AND item_id = 'FEE_KK090' AND status = 'approved');
