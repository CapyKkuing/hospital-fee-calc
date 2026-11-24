/**
 * 비급여 지역별 가격 데이터 검사
 * - 코드 형식·실제 심평원 코드 여부, 가격 값이 숫자인지, JS/JSON 사본이 같은지 확인한다.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const prices = JSON.parse(fs.readFileSync(path.join(ROOT, 'frontend/assets/data/nonbenefit_region_prices.json'), 'utf8'));
const codeMap = JSON.parse(fs.readFileSync(path.join(ROOT, 'frontend/assets/data/nonbenefit_code_map.json'), 'utf8'));
const lib = require(path.join(ROOT, 'scripts/fetch-nonbenefit-prices.js'));

// 2026-11-23 심평원 비급여 진료비용 정보(hira.or.kr/npay) 항목 검색으로 존재를 확인한 코드.
const VERIFIED_HIRA_CODES = new Set([
    'MX1220000',
    'HE1010001', 'HE2010001', 'HE1090000', 'HE1100000', 'HE1110000', 'HE1150000', 'HE1170000',
    'HE1180000', 'HE1200000', 'HE1210000', 'HE1230000', 'HE1270001', 'HE1280001',
    'EB4140000', 'EB4210000', 'EB4320000', 'EB4410000', 'EB4480001', 'EB4510001', 'EB4820000'
]);
const VALID_MATCH = new Set(['exact', 'similar', 'unverified']);

let passed = 0;
function test(name, fn) {
    fn();
    passed += 1;
    console.log('PASS: ' + name);
}

test('nonbenefit_data.js 와 JSON 두 파일 내용이 같다', () => {
    const sandbox = {};
    const source = fs.readFileSync(path.join(ROOT, 'frontend/assets/js/nonbenefit_data.js'), 'utf8');
    new Function('window', source)(sandbox);
    assert.deepStrictEqual(sandbox.NONBENEFIT_REGION_PRICES, prices);
    assert.deepStrictEqual(sandbox.NONBENEFIT_CODE_MAP, codeMap);
});

test('코드 표: 형식이 맞고 확인된 심평원 코드만 쓴다', () => {
    for (const [appKey, entry] of Object.entries(codeMap)) {
        assert(VALID_MATCH.has(entry.match), `${appKey}: match 값이 이상함 (${entry.match})`);
        if (entry.match === 'unverified') {
            assert.strictEqual(entry.publicCode, null, `${appKey}: 미확인 항목은 코드가 없어야 화면에 가격이 안 나옴`);
            continue;
        }
        assert.match(entry.publicCode, /^[A-Z]{2}\d{7}$/, `${appKey}: 코드 형식 오류`);
        assert(!entry.publicCode.startsWith('HE5'), `${appKey}: 존재하지 않는 HE5 계열 코드`);
        assert(VERIFIED_HIRA_CODES.has(entry.publicCode), `${appKey}: 확인되지 않은 코드 ${entry.publicCode}`);
        assert(typeof entry.publicName === 'string' && entry.publicName.length > 0, `${appKey}: 공식 이름 없음`);
    }
});

test('가격 파일: 모든 항목이 코드 표에서 확인된 코드로 연결된다', () => {
    const mapped = new Set(Object.values(codeMap).filter(e => e.match !== 'unverified').map(e => e.publicCode));
    for (const [code, item] of Object.entries(prices.items)) {
        assert(VERIFIED_HIRA_CODES.has(code), `가격 파일의 ${code}는 확인되지 않은 코드`);
        assert(mapped.has(code), `가격 파일의 ${code}를 쓰는 앱 항목이 없음`);
        const nameInMap = Object.values(codeMap).find(e => e.publicCode === code).publicName;
        assert.strictEqual(item.officialName, nameInMap, `${code}: 코드 표와 가격 파일의 공식 이름이 다름`);
    }
});

test('가격 값은 모두 숫자이고 최소 ≤ 중간값·평균 ≤ 최대', () => {
    for (const [code, item] of Object.entries(prices.items)) {
        const rows = Object.entries(item.regions);
        assert(rows.length > 0, `${code}: 지역 값이 없음`);
        if (item.national) rows.push(['national', item.national]);
        for (const [regionKey, row] of rows) {
            assert(typeof row.name === 'string' && row.name, `${code}/${regionKey}: 지역 이름 없음`);
            for (const field of ['min', 'max', 'avg', 'median']) {
                if (!(field in row)) continue;
                assert(Number.isFinite(row[field]) && row[field] >= 0, `${code}/${regionKey}.${field} 숫자 아님: ${row[field]}`);
            }
            assert(Number.isFinite(row.median) || Number.isFinite(row.avg), `${code}/${regionKey}: 중간값·평균 둘 다 없음`);
            for (const field of ['avg', 'median']) {
                if (Number.isFinite(row.min) && Number.isFinite(row[field])) assert(row.min <= row[field], `${code}/${regionKey}: min > ${field}`);
                if (Number.isFinite(row.max) && Number.isFinite(row[field])) assert(row[field] <= row.max, `${code}/${regionKey}: ${field} > max`);
            }
        }
    }
});

test('견관절 MRI 값이 슬관절 MRI 값을 복사한 것이 아니다', () => {
    const shoulder = prices.items.HE1150000.regions;
    const knee = prices.items.HE1200000.regions;
    const same = Object.keys(shoulder).filter(key => knee[key] && JSON.stringify(shoulder[key]) === JSON.stringify(knee[key]));
    // 제주(39)는 심평원 원자료에서도 두 검사 값이 같음(병원 16곳). 그 외 지역은 달라야 한다.
    assert(same.length <= 1, '같은 값 지역이 너무 많음: ' + same.join(', '));
    assert.notDeepStrictEqual(shoulder['11'], knee['11'], '서울 값이 같음');
});

test('출처·조회일이 실제 값을 가리킨다', () => {
    assert.match(prices.fetchedAt, /^\d{4}-\d{2}-\d{2}$/);
    assert.notStrictEqual(prices.fetchedAt, '2026-05-23', '예전 임의값 날짜가 남아 있음');
    assert.match(prices.source, /심사평가원/);
    assert.match(prices.wording, /참고용/);
});

test('미확인 항목(수면내시경·임플란트)은 공개 가격이 연결되지 않는다', () => {
    for (const key of ['EN_SL01', 'EN_SL02', 'SU_DE05', 'SU_IMPLANT', 'IM_MR02']) {
        assert.strictEqual(codeMap[key].match, 'unverified', key);
        assert.strictEqual(codeMap[key].publicCode, null, key);
    }
});

test('수집 스크립트: XML 응답을 숫자로 바꾸고 빈 칸은 비워 둔다', () => {
    const xml = '<response><header><resultCode>00</resultCode><resultMsg>NORMAL SERVICE.</resultMsg></header><body><items><item>'
        + '<npayCd>MX1220000</npayCd><npayKorNm>도수치료</npayKorNm><stdDate>20260101</stdDate>'
        + '<prcMinAll>0</prcMinAll><prcMaxAll>500,000</prcMaxAll><prcAvgAll>110522</prcAvgAll><middAvgAll>100000</middAvgAll>'
        + '<prcMinSl>1000</prcMinSl><prcMaxSl>500000</prcMaxSl><prcAvgSl>129921</prcAvgSl><middAvgSl>120000</middAvgSl>'
        + '<prcMinKw></prcMinKw><prcMaxKw></prcMaxKw><prcAvgKw></prcAvgKw><middAvgKw></middAvgKw>'
        + '</item></items><totalCount>1</totalCount></body></response>';
    const { header, items } = lib.parseRegionalStatsXml(xml);
    assert.strictEqual(header.resultCode, '00');
    assert.strictEqual(header.totalCount, 1);
    const item = lib.convertApiItem(items[0], codeMap.PR_RE04.publicName);
    assert.strictEqual(item.officialName, codeMap.PR_RE04.publicName, '스크립트 결과의 officialName 이 코드 표 이름과 같아야 함');
    assert.deepStrictEqual(item.regions['11'], { name: '서울', min: 1000, max: 500000, avg: 129921, median: 120000 });
    assert.strictEqual(item.regions['24'], undefined, '값 없는 지역은 비워야 함');
    assert.strictEqual(item.national.min, 0, '실제 0원 최소값은 유지');
    assert.strictEqual(item.national.max, 500000);
});

test('수집 스크립트: 인증키는 환경변수에서만 읽고 주소를 출력하지 않는다', () => {
    const source = fs.readFileSync(path.join(ROOT, 'scripts/fetch-nonbenefit-prices.js'), 'utf8');
    assert(source.includes('process.env.DATA_GO_KR_SERVICE_KEY'));
    assert(!/process\.argv[^\n]*(key|Key)/.test(source), '명령줄 인자로 키를 받으면 안 됨');
    assert(!/console\.(log|error)\([^)]*\burl\b/.test(source), '인증키가 든 주소를 출력하면 안 됨');
});

test('계산기 문구가 참고용·병원별 차이를 알린다', () => {
    const script = fs.readFileSync(path.join(ROOT, 'frontend/assets/js/script.js'), 'utf8');
    assert(script.includes('심평원 공개자료 기준 지역별 중간값(참고용)'));
    assert(script.includes('병원마다 다를 수 있음'));
    assert(!/HE5\d{6}/.test(script), 'script.js 에 존재하지 않는 HE5 코드가 남아 있음');
});

const readPage = name => fs.readFileSync(path.join(ROOT, 'frontend', name), 'utf8');
const wonText = n => n.toLocaleString('en-US') + '원';

test('안내 페이지 지역표가 공식 데이터와 같다 (무릎 MRI·상복부 초음파·도수치료)', () => {
    for (const [page, code] of [['knee-mri-cost.html', 'HE1200000'], ['abdominal-ultrasound-cost.html', 'EB4410000'], ['manual-therapy-cost.html', 'MX1220000']]) {
        const html = readPage(page);
        for (const r of Object.values(prices.items[code].regions)) {
            const row = `<tr><td>${r.name}</td><td>${wonText(r.median)}</td><td>${wonText(r.min)}~${wonText(r.max)}</td><td>${r.count}곳</td></tr>`;
            assert(html.includes(row), `${page}: ${r.name} 줄이 공식값과 다름`);
        }
        assert(html.includes(code), `${page}: 출처에 코드 ${code} 없음`);
        assert(html.includes('2026년 11월 23일 조회'), `${page}: 조회일 없음`);
        assert(!html.includes('2026년 5월 23일'), `${page}: 예전 임의값 조회일이 남아 있음`);
    }
});

test('안내 페이지에 예전 임의 숫자가 남아 있지 않다', () => {
    const knee = readPage('knee-mri-cost.html');
    assert(!/40만 원|32만~39만|35만~65만/.test(knee), '무릎 MRI 예전 숫자');
    const abd = readPage('abdominal-ultrasound-cost.html');
    assert(!/10만 원\(6만|6만~18만|경기 중간값 9만/.test(abd), '복부 초음파 예전 숫자');
    const sed = readPage('sedation-endoscopy-cost.html');
    assert(!/중간값 6만|중간값 5만|3만~15만|3만~13만|8만 1천/.test(sed), '수면내시경 예전 숫자');
    assert(sed.includes('공식 값을 하나로 정할 수 없'), '수면내시경 안내 문구 없음');
    const manual = readPage('manual-therapy-cost.html');
    assert(!/5만~25만|4\.5만~23만|8\.5만 원/.test(manual), '도수치료 예전 숫자');
});

test('검색 목록 가격도 계산과 같은 공개 중간값을 쓴다', () => {
    const script = fs.readFileSync(path.join(ROOT, 'frontend/assets/js/script.js'), 'utf8');
    assert(script.includes('function getSearchListPrice(item)'));
    assert(!/search-result-price[^\n]*formatNumber\(item\.price\)/.test(script), '검색 목록에 앱 추정가를 그대로 쓰는 곳이 남아 있음');
});

console.log(`\n비급여 가격 데이터 검사 ${passed}개 통과`);
