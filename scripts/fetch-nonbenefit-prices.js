#!/usr/bin/env node
/**
 * 비급여 지역별 가격 수집 스크립트
 *
 * 공공데이터포털 "건강보험심사평가원_비급여진료비정보조회서비스"(data.go.kr/data/15001700)의
 * "7. 비급여진료비용지역별정보" 기능에서 지역별 최소·최대·평균·중간 비용을 받아
 * frontend/assets/data/nonbenefit_region_prices.json 과 frontend/assets/js/nonbenefit_data.js 를 만든다.
 *
 * 받을 항목은 frontend/assets/data/nonbenefit_code_map.json 에서
 * match 가 exact/similar 이고 publicCode 가 있는 코드만 고른다.
 *
 * 비밀값 규칙
 *   - 인증키는 환경변수 DATA_GO_KR_SERVICE_KEY 에서만 읽는다. 코드·명령줄 인자에 넣지 않는다.
 *   - 요청 주소에는 인증키가 들어가므로 화면·로그에 주소를 출력하지 않는다.
 *
 * 필요한 환경변수
 *   DATA_GO_KR_SERVICE_KEY   공공데이터포털 활용신청 후 받은 인증키(Decoding 키)
 *   NPAY_REGION_OPERATION    "비급여진료비용지역별정보" 기능의 요청 주소 이름(경로 마지막 부분).
 *                            data.go.kr 소개 화면에 경로 이름이 나오지 않아 추측하지 않고 설정으로 받는다.
 *                            활용신청 후 마이페이지 > 활용 API 상세 화면에서 확인해 넣는다.
 *
 * 사용법
 *   node scripts/fetch-nonbenefit-prices.js            → data/nonbenefit-review/ 에 검토용 파일만 저장
 *   node scripts/fetch-nonbenefit-prices.js --apply    → 검토 후 실제 화면용 파일 2개를 교체
 *
 * 응답 필드 이름은 data.go.kr 소개 화면(2026-11-24 열람)의 표를 옮긴 것으로, 실제 응답으로는 아직 미검증이다.
 *   npayCd, npayKorNm, stdDate, prcMinAll/prcMaxAll/prcAvgAll/middAvgAll,
 *   지역별: prcMin{접미사}, prcMax{접미사}, prcAvg{접미사}, middAvg{접미사}
 * 실제 응답에 이 필드가 없으면 멈추고 알린다(값을 지어내지 않음).
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PRICES_JSON = path.join(ROOT, 'frontend', 'assets', 'data', 'nonbenefit_region_prices.json');
const CODE_MAP_JSON = path.join(ROOT, 'frontend', 'assets', 'data', 'nonbenefit_code_map.json');
const DATA_JS = path.join(ROOT, 'frontend', 'assets', 'js', 'nonbenefit_data.js');
const REVIEW_DIR = path.join(ROOT, 'data', 'nonbenefit-review');
const API_BASE = 'https://apis.data.go.kr/B551182/nonPaymentDamtInfoService';

// 앱이 쓰는 지역 키(브라우저에 저장된 선택값과 맞추기 위해 기존 키를 유지).
const REGIONS = [
    { key: '11', name: '서울', apiSuffix: 'Sl' },
    { key: '21', name: '부산', apiSuffix: 'Ps' },
    { key: '22', name: '대구', apiSuffix: 'Tg' },
    { key: '23', name: '인천', apiSuffix: 'Ich' },
    { key: '24', name: '광주', apiSuffix: 'Kw' },
    { key: '25', name: '대전', apiSuffix: 'Dj' },
    { key: '26', name: '울산', apiSuffix: 'Usn' },
    { key: '29', name: '세종', apiSuffix: 'Sejong' },
    { key: '31', name: '경기', apiSuffix: 'Kyg' },
    { key: '32', name: '강원', apiSuffix: 'Kaw' },
    { key: '33', name: '충북', apiSuffix: 'Ccbk' },
    { key: '34', name: '충남', apiSuffix: 'Ccn' },
    { key: '35', name: '전북', apiSuffix: 'Clb' },
    { key: '36', name: '전남', apiSuffix: 'Cln' },
    { key: '37', name: '경북', apiSuffix: 'Ksb' },
    { key: '38', name: '경남', apiSuffix: 'Ksn' },
    { key: '39', name: '제주', apiSuffix: 'Chj' }
];

const PUBLIC_WORDING = '심평원 공개자료 기준 지역별 중간값(참고용)';

/** "  1,234 " 같은 문자열을 숫자로. 빈 값이면 null. */
function toAmount(value) {
    if (value === null || value === undefined) return null;
    const text = String(value).replace(/[\s,원]/g, '');
    if (text === '' || text === '-') return null;
    const number = Number(text);
    return Number.isFinite(number) ? number : null;
}

/** 최소·최대·평균·중간 값 묶음을 만든다. 값이 없으면 칸을 비운다(가짜 숫자 금지). */
function buildStats({ name, min, max, avg, median, count }) {
    const stats = { name };
    const fields = { min, max, avg, median };
    for (const [field, raw] of Object.entries(fields)) {
        const amount = toAmount(raw);
        if (amount !== null) stats[field] = amount;
    }
    if (Number.isFinite(count)) stats.count = count;
    if (!Number.isFinite(stats.median) && !Number.isFinite(stats.avg)) return null;
    return stats;
}

/** 코드 표에서 가격을 받을 코드 목록을 고른다. */
function selectTargetCodes(codeMap) {
    const codes = new Map();
    for (const entry of Object.values(codeMap)) {
        if (!entry || !entry.publicCode) continue;
        if (entry.match !== 'exact' && entry.match !== 'similar') continue;
        if (!codes.has(entry.publicCode)) codes.set(entry.publicCode, entry.publicName || entry.publicCode);
    }
    return codes;
}

function renderDataJs(pricesDocument, codeMap) {
    const prices = JSON.stringify(pricesDocument, null, 2);
    const map = JSON.stringify(codeMap, null, 2);
    return '﻿window.NONBENEFIT_REGION_PRICES = ' + prices + '\n;\n'
        + 'window.NONBENEFIT_CODE_MAP = ' + map + '\n;\n';
}

function writeOutputs(pricesDocument, codeMap, { pricesPath = PRICES_JSON, codeMapPath = CODE_MAP_JSON, dataJsPath = DATA_JS } = {}) {
    fs.writeFileSync(pricesPath, JSON.stringify(pricesDocument, null, 2) + '\n', 'utf8');
    if (codeMapPath) fs.writeFileSync(codeMapPath, JSON.stringify(codeMap, null, 2) + '\n', 'utf8');
    fs.writeFileSync(dataJsPath, renderDataJs(pricesDocument, codeMap), 'utf8');
}

// ---------- data.go.kr 응답 처리 ----------

function decodeXml(text) {
    return text
        .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
        .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')
        .trim();
}

function readTag(xml, tag) {
    const match = xml.match(new RegExp('<' + tag + '>([\\s\\S]*?)</' + tag + '>'));
    return match ? decodeXml(match[1]) : null;
}

/** 지역별정보 XML 한 페이지를 { header, items[] } 로 바꾼다. */
function parseRegionalStatsXml(xml) {
    const header = {
        resultCode: readTag(xml, 'resultCode'),
        resultMsg: readTag(xml, 'resultMsg'),
        totalCount: toAmount(readTag(xml, 'totalCount'))
    };
    const items = [];
    const itemPattern = /<item>([\s\S]*?)<\/item>/g;
    let match;
    while ((match = itemPattern.exec(xml)) !== null) {
        const body = match[1];
        const fields = {};
        const fieldPattern = /<([A-Za-z0-9_]+)>([\s\S]*?)<\/\1>/g;
        let field;
        while ((field = fieldPattern.exec(body)) !== null) fields[field[1]] = decodeXml(field[2]);
        items.push(fields);
    }
    return { header, items };
}

/** API 항목 1개를 앱 형식으로 바꾼다. 필수 필드가 없으면 오류. */
function convertApiItem(fields, fallbackName) {
    if (!fields.npayCd) throw new Error('응답에 npayCd 필드가 없습니다. API 응답 형식을 확인하세요.');
    const regions = {};
    for (const region of REGIONS) {
        const s = region.apiSuffix;
        const stats = buildStats({
            name: region.name,
            min: fields['prcMin' + s],
            max: fields['prcMax' + s],
            avg: fields['prcAvg' + s],
            median: fields['middAvg' + s]
        });
        if (stats) regions[region.key] = stats;
    }
    const national = buildStats({
        name: '전국',
        min: fields.prcMinAll,
        max: fields.prcMaxAll,
        avg: fields.prcAvgAll,
        median: fields.middAvgAll
    });
    // officialName 은 코드 표의 publicName 과 같아야 한다(테스트가 확인).
    const item = { name: fields.npayKorNm || fallbackName, officialName: fallbackName, regions };
    if (fields.stdDate) item.effectiveFrom = fields.stdDate;
    if (national) item.national = national;
    return item;
}

function buildPricesDocument({ items, fetchedAt, source, sourceUrl, notes }) {
    return {
        source,
        sourceUrl,
        fetchedAt,
        wording: PUBLIC_WORDING,
        notes,
        items
    };
}

async function fetchPage(operation, serviceKey, pageNo, numOfRows) {
    const url = new URL(API_BASE + '/' + operation);
    url.searchParams.set('ServiceKey', serviceKey);
    url.searchParams.set('pageNo', String(pageNo));
    url.searchParams.set('numOfRows', String(numOfRows));
    const response = await fetch(url, { headers: { Accept: 'application/xml' } });
    // 주소에 인증키가 있으므로 오류에도 주소를 넣지 않는다.
    if (!response.ok) throw new Error('API 응답 실패: HTTP ' + response.status + ' (page ' + pageNo + ')');
    return response.text();
}

async function main() {
    const apply = process.argv.includes('--apply');
    const serviceKey = process.env.DATA_GO_KR_SERVICE_KEY;
    const operation = process.env.NPAY_REGION_OPERATION;
    if (!serviceKey) {
        console.error('환경변수 DATA_GO_KR_SERVICE_KEY 가 없습니다. 공공데이터포털 인증키를 비밀 저장소/환경변수로만 넣어 주세요.');
        process.exit(2);
    }
    if (!operation || !/^[A-Za-z0-9_]+$/.test(operation)) {
        console.error('환경변수 NPAY_REGION_OPERATION 이 없거나 형식이 맞지 않습니다. 활용신청 후 "비급여진료비용지역별정보" 요청 주소 이름을 넣어 주세요.');
        process.exit(2);
    }

    const codeMap = JSON.parse(fs.readFileSync(CODE_MAP_JSON, 'utf8'));
    const targets = selectTargetCodes(codeMap);
    const numOfRows = 1000;
    const found = {};
    let pageNo = 1;
    let totalCount = Infinity;
    let seen = 0;

    while (seen < totalCount) {
        const xml = await fetchPage(operation, serviceKey, pageNo, numOfRows);
        const { header, items } = parseRegionalStatsXml(xml);
        if (header.resultCode && header.resultCode !== '00') {
            throw new Error('API 오류 코드 ' + header.resultCode + ': ' + (header.resultMsg || ''));
        }
        if (Number.isFinite(header.totalCount)) totalCount = header.totalCount;
        if (items.length === 0) break;
        for (const fields of items) {
            if (targets.has(fields.npayCd)) found[fields.npayCd] = convertApiItem(fields, targets.get(fields.npayCd));
        }
        seen += items.length;
        pageNo += 1;
        if (pageNo > 200) throw new Error('페이지가 너무 많습니다. 응답 형식을 확인하세요.');
    }

    const missing = [...targets.keys()].filter(code => !found[code]);
    const today = new Date().toISOString().slice(0, 10);
    const document = buildPricesDocument({
        items: found,
        fetchedAt: today,
        source: '건강보험심사평가원_비급여진료비정보조회서비스 > 비급여진료비용지역별정보 (공공데이터포털)',
        sourceUrl: 'https://www.data.go.kr/data/15001700/openapi.do',
        notes: [
            '지역별 중간값은 참고용이며 병원마다 다를 수 있음.',
            missing.length ? '응답에 없어 비워 둔 코드: ' + missing.join(', ') : '코드 표의 대상 코드를 모두 받음.'
        ]
    });

    if (apply) {
        writeOutputs(document, codeMap, { codeMapPath: null });
        console.log('화면용 파일을 교체했습니다: 항목 ' + Object.keys(found).length + '개, 비어 있는 코드 ' + missing.length + '개');
    } else {
        fs.mkdirSync(REVIEW_DIR, { recursive: true });
        const reviewPath = path.join(REVIEW_DIR, 'nonbenefit_region_prices.' + today + '.json');
        fs.writeFileSync(reviewPath, JSON.stringify(document, null, 2) + '\n', 'utf8');
        console.log('검토용 파일 저장: ' + path.relative(ROOT, reviewPath));
        console.log('항목 ' + Object.keys(found).length + '개, 비어 있는 코드 ' + missing.length + '개. 확인 후 --apply 로 교체하세요.');
    }
}

module.exports = {
    REGIONS,
    PUBLIC_WORDING,
    toAmount,
    buildStats,
    selectTargetCodes,
    renderDataJs,
    writeOutputs,
    parseRegionalStatsXml,
    convertApiItem,
    buildPricesDocument
};

if (require.main === module) {
    main().catch(error => {
        console.error('수집 실패: ' + error.message);
        process.exit(1);
    });
}
