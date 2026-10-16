const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { DatabaseSync } = require('node:sqlite');

const root = path.resolve(__dirname, '..');
const schemaSql = fs.readFileSync(path.join(root, 'database', 'schema.sql'), 'utf8');
const aliasSql = fs.readFileSync(path.join(root, 'database', 'search-aliases-2026-09-12.sql'), 'utf8');
const mm300Sql = fs.readFileSync(path.join(root, 'database', 'search-aliases-2026-09-25-mm300.sql'), 'utf8');
const feeScheduleCode = fs.readFileSync(path.join(root, 'frontend', 'assets', 'js', 'fee_schedule_items.js'), 'utf8');
const sandbox = { window: {} };
vm.runInNewContext(feeScheduleCode, sandbox);

const expectedItems = {
    FEE_N2072: ['인공관절치환술-전치환[슬관절]', 776630, 680770],
    FEE_EB487: ['혈관-사지혈관 도플러 초음파-하지-동맥', 129480, 113500],
    FEE_EB488: ['혈관-사지혈관 도플러 초음파-하지-정맥', 129480, 113500],
    FEE_HC341: ['골밀도검사[재료대포함]-양방사선(광자) 골밀도검사(1부위)', 45620, 39990],
    FEE_HC342: ['골밀도검사[재료대포함]-양방사선(광자) 골밀도검사(2부위이상)', 53870, 47220],
    FEE_HA458: ['일반전산화단층영상진단-하지-조영제를사용하지않는경우', 102960, 90260],
    FEE_HA456: ['일반전산화단층영상진단-척추-조영제를사용하지않는경우', 110400, 96780],
    FEE_MM300: ['적외선치료[1일당]', 880, 770],
    FEE_R4351: ['정상분만(초산)-제1태아', 818650, 717600],
    FEE_R4356: ['정상분만(경산)-제1태아', 783420, 686730],
    FEE_G5601: ['하지1매', 6170, 5400],
    FEE_G5602: ['하지2매', 8730, 7650],
    FEE_G5603: ['하지3매', 10260, 8990],
    FEE_G5604: ['하지4매', 11780, 10330],
    FEE_G5605: ['하지5매 또는 그 이상', 13310, 11660]
};

const publicItems = new Map(sandbox.window.PUBLIC_FEE_SCHEDULE_ITEMS.items.map((item) => [item.code, item]));
for (const [code, [name, clinicPrice, hospitalPrice]] of Object.entries(expectedItems)) {
    const item = publicItems.get(code);
    assert(item, `공개 수가표에 ${code}가 있어야 합니다.`);
    assert.strictEqual(item.name, name, `${code} 공식 명칭이 일치해야 합니다.`);
    assert.strictEqual(item.clinicPrice, clinicPrice, `${code} 의원 가격이 일치해야 합니다.`);
    assert.strictEqual(item.hospitalPrice, hospitalPrice, `${code} 병원 가격이 일치해야 합니다.`);
    assert.strictEqual(item.isBenefit, true, `${code}는 급여 항목이어야 합니다.`);
}

assert(!/DELETE\s+FROM\s+medical_item_aliases/i.test(aliasSql), '기존 운영 별칭을 삭제하면 안 됩니다.');

const database = new DatabaseSync(':memory:');
database.exec(schemaSql);
database.exec(aliasSql);

// unrelated candidate must survive the exact-query overlay unchanged.
database.exec(`
  INSERT INTO search_candidates
    (query, normalized_query, item_id, item_name, item_category, status)
  VALUES ('안면마비', '안면마비', 'EXISTING_FACE_PALSY', '안면마비', 'procedure', 'pending');
  INSERT INTO search_candidates
    (query, normalized_query, item_id, item_name, item_category, status)
  VALUES ('자연분만', '자연분만', 'EXISTING_NATURAL_DELIVERY', '기존 자연분만 후보', 'surgery', 'pending');
  INSERT INTO search_candidates
    (query, normalized_query, item_id, item_name, item_category, status)
  VALUES ('적외선 하지', '적외선 하지', 'PENDING_INFRARED_1', '미확인 적외선 후보 1', 'procedure', 'pending');
  INSERT INTO search_candidates
    (query, normalized_query, item_id, item_name, item_category, status)
  VALUES ('적외선 하지', '적외선 하지', 'PENDING_INFRARED_2', '미확인 적외선 후보 2', 'procedure', 'pending');
`);
const facePalsyBefore = database.prepare(
    "SELECT query, normalized_query, item_id, item_name, item_category, status FROM search_candidates WHERE normalized_query = '안면마비'"
).all();
database.exec(mm300Sql);

// Re-running the incremental SQL must not duplicate the candidate or remove an existing alias.
database.exec("INSERT INTO medical_item_aliases (item_code, normalized_alias) VALUES ('FEE_MM300', '기존 MM300 별칭')");
database.exec(mm300Sql);
const facePalsyAfter = database.prepare(
    "SELECT query, normalized_query, item_id, item_name, item_category, status FROM search_candidates WHERE normalized_query = '안면마비'"
).all();
assert.deepStrictEqual(facePalsyAfter, facePalsyBefore, '안면마비 후보는 MM300 overlay로 바뀌지 않아야 합니다.');

const mm300 = database.prepare(
    'SELECT code, name, category, item_group, item_type, clinic_price, hospital_price, is_benefit FROM medical_items WHERE code = ?'
).get('FEE_MM300');
assert.deepStrictEqual({ ...mm300 }, {
    code: 'FEE_MM300',
    name: '적외선치료[1일당]',
    category: 'procedure',
    item_group: 'procedure_hira',
    item_type: 'MM',
    clinic_price: 880,
    hospital_price: 770,
    is_benefit: 1
}, 'MM300 overlay는 급여 수가·가격과 procedure 분류를 보존해야 합니다.');

const mm300Aliases = database.prepare(
    "SELECT normalized_alias FROM medical_item_aliases WHERE item_code = 'FEE_MM300' ORDER BY normalized_alias"
).all().map((row) => row.normalized_alias);
assert.deepStrictEqual(mm300Aliases, ['기존 MM300 별칭', '적외선 하지'], '기존 MM300 alias를 보존하고 exact query만 추가해야 합니다.');

const mm300Candidates = database.prepare(
    "SELECT item_id, item_name, item_category FROM search_candidates WHERE normalized_query = '적외선 하지' AND status = 'approved'"
).all();
assert.strictEqual(mm300Candidates.length, 1, 'MM300 승인 후보는 SQL 재실행 후에도 한 건이어야 합니다.');
assert.deepStrictEqual({ ...mm300Candidates[0] }, {
    item_id: 'FEE_MM300',
    item_name: '적외선치료[1일당]',
    item_category: 'procedure'
}, '적외선 하지 승인 후보는 MM300 행위와 procedure 분류를 가리켜야 합니다.');
const stillPendingInfrared = database.prepare(
    "SELECT item_id FROM search_candidates WHERE normalized_query = '적외선 하지' AND status = 'pending'"
).all();
assert.deepStrictEqual(stillPendingInfrared.map((row) => row.item_id), ['PENDING_INFRARED_2'],
    '동일 검색어의 미처리 후보가 여러 건이어도 가장 오래된 한 건만 승인해야 합니다.');

const naturalDeliveryCandidates = database.prepare(
    "SELECT item_id, item_name, item_category FROM search_candidates WHERE normalized_query = '자연분만' AND status = 'approved' ORDER BY item_id"
).all();
assert.deepStrictEqual(naturalDeliveryCandidates.map((row) => ({ ...row })), [
    { item_id: 'FEE_R4351', item_name: '정상분만(초산)-제1태아', item_category: 'surgery' },
    { item_id: 'FEE_R4356', item_name: '정상분만(경산)-제1태아', item_category: 'surgery' }
], '자연분만은 초산·경산 공식 주코드 두 건으로 승인되어야 합니다.');
const naturalDeliveryItems = database.prepare(
    "SELECT code FROM medical_items WHERE code IN ('FEE_R4351', 'FEE_R4356') ORDER BY code"
).all();
assert.deepStrictEqual(naturalDeliveryItems, [], '자연분만은 정적 frontend 수가를 사용하므로 D1 medical_items 가격 overlay를 만들지 않아야 합니다.');

// The public search-aliases API returns approved candidate IDs; both official codes must be accepted.
const apiAcceptedIds = database.prepare(
    "SELECT item_id FROM search_candidates WHERE normalized_query = '자연분만' AND status = 'approved' ORDER BY item_id"
).all().map((row) => row.item_id);
assert.deepStrictEqual(apiAcceptedIds, ['FEE_R4351', 'FEE_R4356'], '검색 별칭 API가 자연분만 두 주코드를 모두 반환해야 합니다.');

const expectedQueries = new Map([
    ['슬관절 전치', ['FEE_N2072']],
    ['하지 혈관', ['FEE_EB487', 'FEE_EB488']],
    ['bmd', ['FEE_HC341', 'FEE_HC342']],
    ['cty', ['FEE_HA458']],
    ['무릎 ct', ['FEE_HA458']],
    ['적외선 하지', ['FEE_MM300']],
    ['하지xr', ['FEE_G5601', 'FEE_G5602', 'FEE_G5603', 'FEE_G5604', 'FEE_G5605']],
    ['하지 전체', ['FEE_G5605']],
    ['디스크', ['FEE_HA456']]
]);

for (const [query, expectedCodes] of expectedQueries) {
    const actualCodes = database.prepare(
        'SELECT item_code FROM medical_item_aliases WHERE normalized_alias = ? ORDER BY item_code'
    ).all(query).map((row) => row.item_code);
    assert.deepStrictEqual(actualCodes, [...expectedCodes].sort(), `${query} 별칭은 승인된 공식 코드에만 연결되어야 합니다.`);

    const approvedCandidate = database.prepare(
        "SELECT item_id FROM search_candidates WHERE normalized_query = ? AND status = 'approved'"
    ).get(query);
    assert(approvedCandidate, `${query} 승인 이력이 있어야 합니다.`);
}

for (const query of ['체열', '적외선체열검사']) {
    const aliases = database.prepare(
        'SELECT item_code FROM medical_item_aliases WHERE normalized_alias = ?'
    ).all(query);
    const candidates = database.prepare(
        "SELECT item_id FROM search_candidates WHERE normalized_query = ? AND status = 'approved'"
    ).all(query);
    assert.deepStrictEqual(aliases, [], `${query}는 가격 근거 없이 별칭 승인하면 안 됩니다.`);
    assert.deepStrictEqual(candidates, [], `${query}는 가격 근거 없이 후보 승인하면 안 됩니다.`);
}

assert(aliasSql.includes('EZ776'), '미승인 체온열검사 공식 코드와 보류 이유를 기록해야 합니다.');
assert(!aliasSql.includes("('FEE_D5841', '디스크')"), '디스크 검색어를 디스크확산검사에 연결하면 안 됩니다.');
assert(!aliasSql.includes("('FEE_MM300', '체열')"), '체열 검색어를 적외선치료에 연결하면 안 됩니다.');
assert(!aliasSql.includes("('FEE_HA770', '적외선 하지')"), '적외선 하지 검색어를 ICG 혈관조영에 연결하면 안 됩니다.');
assert(mm300Sql.includes("('FEE_MM300', '적외선 하지')"), '적외선 하지 검색어는 MM300에만 연결해야 합니다.');

// 2026-10-16: 간섬유화·주사치료는 정적 공식 코드에 승인 후보로만 연결하고 애매한 검색어는 보류한다.
const octoberSql = fs.readFileSync(path.join(root, 'database', 'search-aliases-2026-10-16.sql'), 'utf8');
const octoberItems = {
    FEE_D1980: ['M2BPGi[정밀면역검사]', 64580, 56610],
    FEE_KK010: ['피하또는근육내주사', 1720, 1510],
    FEE_KK020: ['정맥내일시주사[1일당]', 2450, 2150],
    FEE_KK090: ['관절강내주사', 18340, 16080]
};
for (const [code, [name, clinicPrice, hospitalPrice]] of Object.entries(octoberItems)) {
    const item = publicItems.get(code);
    assert(item && item.isBenefit, `${code}는 공개 수가표의 급여 항목이어야 합니다.`);
    assert.deepStrictEqual([item.name, item.clinicPrice, item.hospitalPrice], [name, clinicPrice, hospitalPrice], `${code} 명칭·가격이 일치해야 합니다.`);
}
const octoberDb = new DatabaseSync(':memory:');
octoberDb.exec(schemaSql);
octoberDb.exec(`
  INSERT INTO search_candidates (query, normalized_query, item_id, item_name, item_category, status)
  VALUES ('주사치료', '주사치료', NULL, '주사치료', NULL, 'pending'),
         ('자가골수', '자가골수', NULL, '자가골수', NULL, 'pending'),
         ('안면마비', '안면마비', NULL, '안면마비', NULL, 'pending');
`);
octoberDb.exec(octoberSql);
octoberDb.exec(octoberSql);
const approvedFor = (query) => octoberDb.prepare(
    "SELECT item_id FROM search_candidates WHERE normalized_query = ? AND status = 'approved' ORDER BY item_id"
).all(query).map((row) => row.item_id);
assert.deepStrictEqual(approvedFor('간섬유화'), ['FEE_D1980'], '간섬유화는 M2BPGi 급여 검사에만 연결해야 합니다.');
assert.deepStrictEqual(approvedFor('섬유화'), ['FEE_D1980'], '섬유화는 M2BPGi 급여 검사에만 연결해야 합니다.');
assert.deepStrictEqual(approvedFor('주사치료'), ['FEE_KK010', 'FEE_KK020', 'FEE_KK090'], '주사치료는 대표 급여 주사 3건이며 재실행해도 중복되면 안 됩니다.');
assert.strictEqual(octoberDb.prepare("SELECT COUNT(*) AS n FROM search_candidates WHERE normalized_query = '주사치료' AND status = 'pending'").get().n, 0,
    '주사치료 기존 pending 후보는 승인 처리되어야 합니다.');
for (const query of ['복부섬유', '섬유', '자가골수', '혈답', '안면마비']) {
    assert.deepStrictEqual(approvedFor(query), [], `${query}는 공식 급여 근거 없이 승인하면 안 됩니다.`);
}
assert.strictEqual(octoberDb.prepare("SELECT COUNT(*) AS n FROM medical_items").get().n, 0, '정적 수가 코드라 medical_items overlay를 만들지 않아야 합니다.');
assert(!/DELETE\s+FROM/i.test(octoberSql), '10-16 SQL은 기존 행을 삭제하면 안 됩니다.');
assert(octoberSql.includes('EZ829') && octoberSql.includes('BMAC'), '비급여 보류 근거를 기록해야 합니다.');

console.log('PASS: 무결과 검색어 공식 수가·가산형 별칭·보류 경계');
