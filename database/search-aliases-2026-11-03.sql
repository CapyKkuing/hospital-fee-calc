-- 2026-11-03 주간 무결과 검색어 첫 회 정리 (search_candidates pending 21건).
-- 방식: 10-16과 동일. 급여 코드에 연결하면 search_candidates 행을
--   item_id / item_name / item_category / status='approved' 로 바꾸거나 승인 행을 추가한다.
-- 이번 회차 결과: A단계(이미 사이트에 있는 급여 코드에 연결) 0건, B단계(가격 입력 필요) 0건.
--   모든 pending 은 아래 사유로 제외(rejected)한다.
-- 근거: HIRA 2026 건강보험요양급여비용 목록, 저장소 fee_schedule_items.js(2026-05-01 고시), 운영 D1 조회(2026-11-03).
--
-- 제외 사유
--   약품명(수가 항목 아님): Denosumab, 데노수맙, 프롤리아
--   질병코드(KCD)·진단명: s62.620, 골절, 폐쇄성, 첫마디뼈의 골절, 폐쇄성, 안면마비
--   단어 조각·무의미: 23.9, aggregate, leg, lower, fibula, tibia, 섬유, 복부섬유, 혈답, 방귀, x-lay
--     (x-lay 는 x-ray 오타로 보이나 부위·매수가 없어 단일 코드를 정할 수 없다)
--   비급여: 체열, 적외선체열검사(EZ776 체온열검사 비급여), 자가골수(BMAC 비급여 신의료기술)

-- A단계 승인: 이번 회차 없음 (INSERT/UPDATE 없음)

-- ===== 제외(reject) 처리: 다시 실행해도 pending 행만 바뀐다 =====
UPDATE search_candidates
SET status = 'rejected',
    updated_at = CURRENT_TIMESTAMP
WHERE status = 'pending'
  AND item_id IS NULL
  AND normalized_query IN (
    '23.9', 'denosumab', 'fibula', 'leg', 'lower', 's62.620', 'tibia', 'x-lay',
    '골절, 폐쇄성', '데노수맙', '첫마디뼈의 골절, 폐쇄성', '프롤리아',
    'aggregate', '방귀', '적외선체열검사', '체열', '안면마비', '자가골수',
    '복부섬유', '섬유', '혈답'
  );
