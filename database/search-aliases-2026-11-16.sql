-- 2026-11-16 주간 무결과 검색어 정리 (search_candidates pending 2건: 두통 수액, 해열제).
-- 방식: 11-03과 동일. 제외는 status='rejected' 로만 바꾼다.
-- 근거: 저장소 fee_schedule_items.js(2026-05-01 고시), 운영 D1 조회(2026-11-16).
--
-- 제외 사유
--   약품 분류명(수가 항목 아님): 해열제
--
--   사용자 답변(2026-11-16 '제외'): 두통 수액
--     수액 행위 급여 코드가 용량별로 3개(KK051 100ml미만, KK052 100~500ml, KK053 501~1000ml)이고
--     의원 두통 수액은 비급여 영양수액인 경우도 많아 하나로 정할 수 없어 질문했고, 사용자가 제외로 결정.

-- A단계 승인: 이번 회차 없음 (INSERT 없음)

-- ===== 제외(reject) 처리: 다시 실행해도 pending 행만 바뀐다 =====
UPDATE search_candidates
SET status = 'rejected',
    updated_at = CURRENT_TIMESTAMP
WHERE status = 'pending'
  AND item_id IS NULL
  AND normalized_query IN ('해열제', '두통 수액');
