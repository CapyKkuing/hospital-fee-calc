const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const admin = fs.readFileSync(path.join(root, 'frontend', 'admin-search.html'), 'utf8');
const adminScript = fs.readFileSync(path.join(root, 'frontend', 'assets', 'js', 'admin-search.js'), 'utf8');
const script = fs.readFileSync(path.join(root, 'frontend', 'assets', 'js', 'script.js'), 'utf8');

const requiredAdminFields = [
    'process-code',
    'process-name',
    'process-category',
    'process-group',
    'process-type',
    'process-clinic-price',
    'process-hospital-price',
    'process-benefit',
    'process-source-url',
    'process-source-date',
    'process-keywords'
];

for (const id of requiredAdminFields) {
    assert(admin.includes(`id="${id}"`), `관리자 입력 필드 누락: ${id}`);
}

assert(admin.includes('검색 항목 추가'), '미결과 검색어를 항목으로 추가하는 창이 필요합니다.');
assert(admin.includes('HIRA 공식 출처'), '공식 출처 입력 안내가 필요합니다.');
assert(adminScript.includes("fetchJson('/api/admin/search-candidates'"), '승인 요청은 관리자 후보 API로 전송해야 합니다.');
assert(adminScript.includes("itemId: element('process-code').value.trim()"), '항목 코드가 승인 요청에 포함되어야 합니다.');
assert(adminScript.includes('clinicPrice,'), '의원 가격이 승인 요청에 포함되어야 합니다.');
assert(adminScript.includes('hospitalPrice,'), '병원 가격이 승인 요청에 포함되어야 합니다.');
assert(adminScript.includes("sourceUrl: element('process-source-url').value.trim()"), '공식 출처 URL이 승인 요청에 포함되어야 합니다.');
assert(adminScript.includes("keywords: element('process-keywords').value.split(',')"), '검색 키워드가 승인 요청에 포함되어야 합니다.');
assert(adminScript.includes("status: 'approved'"), '추가 완료 요청은 승인 상태로 저장해야 합니다.');

assert(script.includes("fetch('/api/medical-items'"), '공개 의료 항목 API를 불러와야 합니다.');
assert(script.includes("fetch('/api/search-aliases'"), '완료된 검색 별칭 API를 불러와야 합니다.');
assert(script.includes('Promise.all([loadMedicalItemsOverlay(), loadApprovedSearchAliases()])'), '초기화 전에 공개 항목과 완료 별칭을 함께 로드해야 합니다.');
assert(script.includes('medicalItemsOverlay'), '공개 항목 오버레이 상태가 필요합니다.');
assert(script.includes('itemsByCode.set(item.code, item)'), '같은 코드의 공개 항목이 정적 항목을 덮어써야 합니다.');

const overlayBlock = script.slice(
    script.indexOf('let medicalItemsOverlay = []'),
    script.indexOf('function resolveProviderPrice')
);
const createDatabaseHarness = new Function(
    'HIRA_DATABASE',
    'window',
    `${overlayBlock}\nreturn { getMedicalItemDatabase, setOverlay(items) { medicalItemsOverlay = items; }, setAliases(aliases) { approvedSearchAliases = aliases; } };`
);
const harness = createDatabaseHarness(
    [{ code: 'A', name: '정적 A' }, { code: 'B', name: '정적 B' }],
    { PUBLIC_FEE_SCHEDULE_ITEMS: { items: [{ code: 'C', name: '공개 C' }] } }
);
harness.setOverlay([{ code: 'A', name: '승인 A' }]);
const merged = harness.getMedicalItemDatabase();
assert.strictEqual(merged.length, 3, '정적·공개·승인 항목이 코드 기준으로 병합되어야 합니다.');
assert.strictEqual(merged.find(item => item.code === 'A').name, '승인 A', '승인 항목이 같은 코드의 정적 항목보다 우선해야 합니다.');

const aliasHarness = createDatabaseHarness(
    [{ code: 'PR_TR09', name: '중심정맥관 삽입술', keywords: [] }],
    { PUBLIC_FEE_SCHEDULE_ITEMS: { items: [] } }
);
aliasHarness.setAliases(new Map([['PR_TR09', ['중심정맥']]]));
assert.deepStrictEqual(aliasHarness.getMedicalItemDatabase()[0].keywords, ['중심정맥'], '완료된 별칭이 기존 공식 코드 검색어에 병합되어야 합니다.');

const exactAliasStart = script.lastIndexOf('function getExactApprovedAliasCodes');
const activeSearchStart = script.lastIndexOf('function performSearch');
assert(exactAliasStart >= 0 && activeSearchStart > exactAliasStart, '정확 승인 별칭 판별 함수가 최종 검색 함수 앞에 있어야 합니다.');
const exactAliasEnd = script.indexOf('function performSearch', exactAliasStart);
const exactAliasSource = script.slice(exactAliasStart, exactAliasEnd);
const exactAliasHarness = new Function('approvedSearchAliases', `${exactAliasSource}\nreturn getExactApprovedAliasCodes;`)(
    new Map([
        ['FEE_HA456', ['디스크', '허리디스크 ct']],
        ['FEE_D5841', ['디스크확산법']]
    ])
);
assert.deepStrictEqual([...exactAliasHarness('디 스 크')], ['FEE_HA456'], '공백 변형도 정확 승인 별칭 코드만 선택해야 합니다.');
assert.deepStrictEqual([...exactAliasHarness('디스크확산법')], ['FEE_D5841'], '다른 정확 별칭은 해당 코드만 선택해야 합니다.');
assert(script.slice(activeSearchStart).includes('matched = matched.filter(item => exactApprovedCodes.has(item.code));'), '최종 검색은 정확 승인 별칭 코드만 남겨야 합니다.');

console.log('PASS: 관리자 실제 항목 입력 및 공개 DB 오버레이 계약');
