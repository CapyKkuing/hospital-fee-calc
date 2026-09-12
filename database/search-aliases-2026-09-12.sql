-- 2026-09-12 무결과 검색어 보강.
-- 공식 급여 수가·가격은 2026-05-01 공개 수가표와 2026-07-01 HIRA 고시 파일을 교차 확인했다.
-- 체열/적외선체열검사/적외선 하지: HIRA 비급여 코드 EZ776(체온열검사)은 확인했으나
-- 현재 가격 근거가 없어 medical_items 및 승인 별칭에는 넣지 않고 pending 상태를 유지한다.

INSERT INTO medical_items (code, name, category, item_group, item_type, clinic_price, hospital_price, is_benefit, source_url, source_date, status, updated_at) VALUES
  ('FEE_N2072', '인공관절치환술-전치환[슬관절]', 'surgery', 'surgery', 'N2', 776630, 680770, 1, 'https://www.hira.or.kr/bbsDummy.do?brdBltNo=12130&brdScnBltNo=4&pgmid=HIRAA020002000100', '2026-07-01', 'approved', CURRENT_TIMESTAMP),
  ('FEE_EB487', '혈관-사지혈관 도플러 초음파-하지-동맥', 'imaging', 'test', 'EB', 129480, 113500, 1, 'https://www.hira.or.kr/bbsDummy.do?brdBltNo=12130&brdScnBltNo=4&pgmid=HIRAA020002000100', '2026-07-01', 'approved', CURRENT_TIMESTAMP),
  ('FEE_EB488', '혈관-사지혈관 도플러 초음파-하지-정맥', 'imaging', 'test', 'EB', 129480, 113500, 1, 'https://www.hira.or.kr/bbsDummy.do?brdBltNo=12130&brdScnBltNo=4&pgmid=HIRAA020002000100', '2026-07-01', 'approved', CURRENT_TIMESTAMP),
  ('FEE_HC341', '골밀도검사[재료대포함]-양방사선(광자) 골밀도검사(1부위)', 'imaging', 'test', 'HC', 45620, 39990, 1, 'https://www.hira.or.kr/bbsDummy.do?brdBltNo=12130&brdScnBltNo=4&pgmid=HIRAA020002000100', '2026-07-01', 'approved', CURRENT_TIMESTAMP),
  ('FEE_HC342', '골밀도검사[재료대포함]-양방사선(광자) 골밀도검사(2부위이상)', 'imaging', 'test', 'HC', 53870, 47220, 1, 'https://www.hira.or.kr/bbsDummy.do?brdBltNo=12130&brdScnBltNo=4&pgmid=HIRAA020002000100', '2026-07-01', 'approved', CURRENT_TIMESTAMP),
  ('FEE_HA458', '일반전산화단층영상진단-하지-조영제를사용하지않는경우', 'imaging', 'test', 'HA', 102960, 90260, 1, 'https://www.hira.or.kr/bbsDummy.do?brdBltNo=12130&brdScnBltNo=4&pgmid=HIRAA020002000100', '2026-07-01', 'approved', CURRENT_TIMESTAMP),
  ('FEE_HA456', '일반전산화단층영상진단-척추-조영제를사용하지않는경우', 'imaging', 'test', 'HA', 110400, 96780, 1, 'https://www.hira.or.kr/bbsDummy.do?brdBltNo=12130&brdScnBltNo=4&pgmid=HIRAA020002000100', '2026-07-01', 'approved', CURRENT_TIMESTAMP),
  ('FEE_G5601', '하지1매', 'imaging', 'test', 'G5', 6170, 5400, 1, 'https://www.hira.or.kr/bbsDummy.do?brdBltNo=12130&brdScnBltNo=4&pgmid=HIRAA020002000100', '2026-07-01', 'approved', CURRENT_TIMESTAMP),
  ('FEE_G5602', '하지2매', 'imaging', 'test', 'G5', 8730, 7650, 1, 'https://www.hira.or.kr/bbsDummy.do?brdBltNo=12130&brdScnBltNo=4&pgmid=HIRAA020002000100', '2026-07-01', 'approved', CURRENT_TIMESTAMP),
  ('FEE_G5603', '하지3매', 'imaging', 'test', 'G5', 10260, 8990, 1, 'https://www.hira.or.kr/bbsDummy.do?brdBltNo=12130&brdScnBltNo=4&pgmid=HIRAA020002000100', '2026-07-01', 'approved', CURRENT_TIMESTAMP),
  ('FEE_G5604', '하지4매', 'imaging', 'test', 'G5', 11780, 10330, 1, 'https://www.hira.or.kr/bbsDummy.do?brdBltNo=12130&brdScnBltNo=4&pgmid=HIRAA020002000100', '2026-07-01', 'approved', CURRENT_TIMESTAMP),
  ('FEE_G5605', '하지5매 또는 그 이상', 'imaging', 'test', 'G5', 13310, 11660, 1, 'https://www.hira.or.kr/bbsDummy.do?brdBltNo=12130&brdScnBltNo=4&pgmid=HIRAA020002000100', '2026-07-01', 'approved', CURRENT_TIMESTAMP)
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

INSERT OR IGNORE INTO medical_item_aliases (item_code, normalized_alias) VALUES
  ('FEE_N2072', 'fee_n2072'),
  ('FEE_N2072', 'n2072'),
  ('FEE_N2072', '인공관절치환술-전치환[슬관절]'),
  ('FEE_N2072', '슬관절 전치'),
  ('FEE_N2072', '슬관절 전치환'),
  ('FEE_N2072', '무릎 인공관절 전치환'),
  ('FEE_EB487', 'fee_eb487'),
  ('FEE_EB487', 'eb487'),
  ('FEE_EB487', '혈관-사지혈관 도플러 초음파-하지-동맥'),
  ('FEE_EB487', '하지 혈관'),
  ('FEE_EB487', '하지혈관'),
  ('FEE_EB487', '하지 혈관 초음파'),
  ('FEE_EB488', 'fee_eb488'),
  ('FEE_EB488', 'eb488'),
  ('FEE_EB488', '혈관-사지혈관 도플러 초음파-하지-정맥'),
  ('FEE_EB488', '하지 혈관'),
  ('FEE_EB488', '하지혈관'),
  ('FEE_EB488', '하지 혈관 초음파'),
  ('FEE_HC341', 'fee_hc341'),
  ('FEE_HC341', 'hc341'),
  ('FEE_HC341', '골밀도검사[재료대포함]-양방사선(광자) 골밀도검사(1부위)'),
  ('FEE_HC341', 'bmd'),
  ('FEE_HC341', '골밀도 bmd'),
  ('FEE_HC341', 'dexa'),
  ('FEE_HC342', 'fee_hc342'),
  ('FEE_HC342', 'hc342'),
  ('FEE_HC342', '골밀도검사[재료대포함]-양방사선(광자) 골밀도검사(2부위이상)'),
  ('FEE_HC342', 'bmd'),
  ('FEE_HC342', '골밀도 bmd'),
  ('FEE_HC342', 'dexa'),
  ('FEE_HA458', 'fee_ha458'),
  ('FEE_HA458', 'ha458'),
  ('FEE_HA458', '일반전산화단층영상진단-하지-조영제를사용하지않는경우'),
  ('FEE_HA458', 'cty'),
  ('FEE_HA458', '무릎 ct'),
  ('FEE_HA458', '슬관절 ct'),
  ('FEE_HA458', 'knee ct'),
  ('FEE_HA456', 'fee_ha456'),
  ('FEE_HA456', 'ha456'),
  ('FEE_HA456', '일반전산화단층영상진단-척추-조영제를사용하지않는경우'),
  ('FEE_HA456', '디스크'),
  ('FEE_HA456', '허리디스크 ct'),
  ('FEE_HA456', '목디스크 ct'),
  ('FEE_HA456', '척추 디스크 ct'),
  ('FEE_G5601', 'fee_g5601'),
  ('FEE_G5601', 'g5601'),
  ('FEE_G5601', '하지1매'),
  ('FEE_G5601', '하지xr'),
  ('FEE_G5601', '하지 xray'),
  ('FEE_G5601', '하지 엑스레이'),
  ('FEE_G5602', 'fee_g5602'),
  ('FEE_G5602', 'g5602'),
  ('FEE_G5602', '하지2매'),
  ('FEE_G5602', '하지xr'),
  ('FEE_G5602', '하지 xray'),
  ('FEE_G5602', '하지 엑스레이'),
  ('FEE_G5603', 'fee_g5603'),
  ('FEE_G5603', 'g5603'),
  ('FEE_G5603', '하지3매'),
  ('FEE_G5603', '하지xr'),
  ('FEE_G5603', '하지 xray'),
  ('FEE_G5603', '하지 엑스레이'),
  ('FEE_G5604', 'fee_g5604'),
  ('FEE_G5604', 'g5604'),
  ('FEE_G5604', '하지4매'),
  ('FEE_G5604', '하지xr'),
  ('FEE_G5604', '하지 xray'),
  ('FEE_G5604', '하지 엑스레이'),
  ('FEE_G5605', 'fee_g5605'),
  ('FEE_G5605', 'g5605'),
  ('FEE_G5605', '하지5매 또는 그 이상'),
  ('FEE_G5605', '하지xr'),
  ('FEE_G5605', '하지 xray'),
  ('FEE_G5605', '하지 엑스레이'),
  ('FEE_G5605', '하지 전체'),
  ('FEE_G5605', '하지 전장'),
  ('FEE_G5605', 'whole leg'),
  ('FEE_G5605', 'scanogram');

UPDATE search_candidates SET item_id = 'FEE_N2072', item_name = '인공관절치환술-전치환[슬관절]', item_category = 'surgery', status = 'approved', updated_at = CURRENT_TIMESTAMP WHERE normalized_query = '슬관절 전치' AND status = 'pending';
UPDATE search_candidates SET item_id = 'FEE_EB487', item_name = '혈관-사지혈관 도플러 초음파-하지-동맥', item_category = 'imaging', status = 'approved', updated_at = CURRENT_TIMESTAMP WHERE normalized_query = '하지 혈관' AND status = 'pending';
UPDATE search_candidates SET item_id = 'FEE_HC341', item_name = '골밀도검사[재료대포함]-양방사선(광자) 골밀도검사(1부위)', item_category = 'imaging', status = 'approved', updated_at = CURRENT_TIMESTAMP WHERE normalized_query = 'bmd' AND status = 'pending';
UPDATE search_candidates SET item_id = 'FEE_HA458', item_name = '일반전산화단층영상진단-하지-조영제를사용하지않는경우', item_category = 'imaging', status = 'approved', updated_at = CURRENT_TIMESTAMP WHERE normalized_query = 'cty' AND status = 'pending';
UPDATE search_candidates SET item_id = 'FEE_HA458', item_name = '일반전산화단층영상진단-하지-조영제를사용하지않는경우', item_category = 'imaging', status = 'approved', updated_at = CURRENT_TIMESTAMP WHERE normalized_query = '무릎 ct' AND status = 'pending';
UPDATE search_candidates SET item_id = 'FEE_G5601', item_name = '하지1매', item_category = 'imaging', status = 'approved', updated_at = CURRENT_TIMESTAMP WHERE normalized_query = '하지xr' AND status = 'pending';
UPDATE search_candidates SET item_id = 'FEE_G5605', item_name = '하지5매 또는 그 이상', item_category = 'imaging', status = 'approved', updated_at = CURRENT_TIMESTAMP WHERE normalized_query = '하지 전체' AND status = 'pending';
UPDATE search_candidates SET item_id = 'FEE_HA456', item_name = '일반전산화단층영상진단-척추-조영제를사용하지않는경우', item_category = 'imaging', status = 'approved', updated_at = CURRENT_TIMESTAMP WHERE normalized_query = '디스크' AND status = 'pending';

INSERT INTO search_candidates (query, normalized_query, item_id, item_name, item_category, status, created_at, updated_at)
SELECT '슬관절 전치', '슬관절 전치', 'FEE_N2072', '인공관절치환술-전치환[슬관절]', 'surgery', 'approved', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM search_candidates WHERE normalized_query = '슬관절 전치' AND item_id = 'FEE_N2072' AND status = 'approved');
INSERT INTO search_candidates (query, normalized_query, item_id, item_name, item_category, status, created_at, updated_at)
SELECT '하지 혈관', '하지 혈관', 'FEE_EB487', '혈관-사지혈관 도플러 초음파-하지-동맥', 'imaging', 'approved', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM search_candidates WHERE normalized_query = '하지 혈관' AND item_id = 'FEE_EB487' AND status = 'approved');
INSERT INTO search_candidates (query, normalized_query, item_id, item_name, item_category, status, created_at, updated_at)
SELECT '하지 혈관', '하지 혈관', 'FEE_EB488', '혈관-사지혈관 도플러 초음파-하지-정맥', 'imaging', 'approved', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM search_candidates WHERE normalized_query = '하지 혈관' AND item_id = 'FEE_EB488' AND status = 'approved');
INSERT INTO search_candidates (query, normalized_query, item_id, item_name, item_category, status, created_at, updated_at)
SELECT 'bmd', 'bmd', 'FEE_HC341', '골밀도검사[재료대포함]-양방사선(광자) 골밀도검사(1부위)', 'imaging', 'approved', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM search_candidates WHERE normalized_query = 'bmd' AND item_id = 'FEE_HC341' AND status = 'approved');
INSERT INTO search_candidates (query, normalized_query, item_id, item_name, item_category, status, created_at, updated_at)
SELECT 'bmd', 'bmd', 'FEE_HC342', '골밀도검사[재료대포함]-양방사선(광자) 골밀도검사(2부위이상)', 'imaging', 'approved', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM search_candidates WHERE normalized_query = 'bmd' AND item_id = 'FEE_HC342' AND status = 'approved');
INSERT INTO search_candidates (query, normalized_query, item_id, item_name, item_category, status, created_at, updated_at)
SELECT 'cty', 'cty', 'FEE_HA458', '일반전산화단층영상진단-하지-조영제를사용하지않는경우', 'imaging', 'approved', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM search_candidates WHERE normalized_query = 'cty' AND item_id = 'FEE_HA458' AND status = 'approved');
INSERT INTO search_candidates (query, normalized_query, item_id, item_name, item_category, status, created_at, updated_at)
SELECT '무릎 ct', '무릎 ct', 'FEE_HA458', '일반전산화단층영상진단-하지-조영제를사용하지않는경우', 'imaging', 'approved', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM search_candidates WHERE normalized_query = '무릎 ct' AND item_id = 'FEE_HA458' AND status = 'approved');
INSERT INTO search_candidates (query, normalized_query, item_id, item_name, item_category, status, created_at, updated_at)
SELECT '하지xr', '하지xr', 'FEE_G5601', '하지1매', 'imaging', 'approved', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM search_candidates WHERE normalized_query = '하지xr' AND item_id = 'FEE_G5601' AND status = 'approved');
INSERT INTO search_candidates (query, normalized_query, item_id, item_name, item_category, status, created_at, updated_at)
SELECT '하지xr', '하지xr', 'FEE_G5602', '하지2매', 'imaging', 'approved', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM search_candidates WHERE normalized_query = '하지xr' AND item_id = 'FEE_G5602' AND status = 'approved');
INSERT INTO search_candidates (query, normalized_query, item_id, item_name, item_category, status, created_at, updated_at)
SELECT '하지xr', '하지xr', 'FEE_G5603', '하지3매', 'imaging', 'approved', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM search_candidates WHERE normalized_query = '하지xr' AND item_id = 'FEE_G5603' AND status = 'approved');
INSERT INTO search_candidates (query, normalized_query, item_id, item_name, item_category, status, created_at, updated_at)
SELECT '하지xr', '하지xr', 'FEE_G5604', '하지4매', 'imaging', 'approved', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM search_candidates WHERE normalized_query = '하지xr' AND item_id = 'FEE_G5604' AND status = 'approved');
INSERT INTO search_candidates (query, normalized_query, item_id, item_name, item_category, status, created_at, updated_at)
SELECT '하지xr', '하지xr', 'FEE_G5605', '하지5매 또는 그 이상', 'imaging', 'approved', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM search_candidates WHERE normalized_query = '하지xr' AND item_id = 'FEE_G5605' AND status = 'approved');
INSERT INTO search_candidates (query, normalized_query, item_id, item_name, item_category, status, created_at, updated_at)
SELECT '하지 전체', '하지 전체', 'FEE_G5605', '하지5매 또는 그 이상', 'imaging', 'approved', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM search_candidates WHERE normalized_query = '하지 전체' AND item_id = 'FEE_G5605' AND status = 'approved');
INSERT INTO search_candidates (query, normalized_query, item_id, item_name, item_category, status, created_at, updated_at)
SELECT '디스크', '디스크', 'FEE_HA456', '일반전산화단층영상진단-척추-조영제를사용하지않는경우', 'imaging', 'approved', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM search_candidates WHERE normalized_query = '디스크' AND item_id = 'FEE_HA456' AND status = 'approved');
