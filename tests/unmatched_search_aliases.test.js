const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { DatabaseSync } = require('node:sqlite');

const root = path.resolve(__dirname, '..');
const schemaSql = fs.readFileSync(path.join(root, 'database', 'schema.sql'), 'utf8');
const aliasSql = fs.readFileSync(path.join(root, 'database', 'search-aliases-2026-09-12.sql'), 'utf8');
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

const expectedQueries = new Map([
    ['슬관절 전치', ['FEE_N2072']],
    ['하지 혈관', ['FEE_EB487', 'FEE_EB488']],
    ['bmd', ['FEE_HC341', 'FEE_HC342']],
    ['cty', ['FEE_HA458']],
    ['무릎 ct', ['FEE_HA458']],
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

for (const query of ['체열', '적외선체열검사', '적외선 하지']) {
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

console.log('PASS: 무결과 검색어 공식 수가·가산형 별칭·보류 경계');
