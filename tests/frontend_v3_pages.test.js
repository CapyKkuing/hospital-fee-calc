const assert = require('assert');
const fs = require('fs');
const path = require('path');

const frontend = path.join(__dirname, '..', 'frontend');
const pages = ['index.html', 'about.html', 'data-sources.html', 'privacy.html', 'contact.html', 'terms.html', 'disclaimer.html'];
const seoPages = [
    ['hospital-cost-calculator.html', 'hospital-cost-calculator', '병원비'],
    ['er-cost-calculator.html', 'er-cost-calculator', '응급실'],
    ['mri-cost-calculator.html', 'mri-cost-calculator', 'MRI'],
    ['ct-cost-calculator.html', 'ct-cost-calculator', 'CT'],
    ['endoscopy-cost-calculator.html', 'endoscopy-cost-calculator', '내시경'],
    ['hospitalization-cost-calculator.html', 'hospitalization-cost-calculator', '입원비'],
    ['noncovered-medical-cost.html', 'noncovered-medical-cost', '비급여'],
    ['abdominal-ultrasound-cost.html', 'abdominal-ultrasound-cost', '복부 초음파'],
    ['manual-therapy-cost.html', 'manual-therapy-cost', '도수치료'],
    ['knee-mri-cost.html', 'knee-mri-cost', '무릎 MRI'],
    ['sedation-endoscopy-cost.html', 'sedation-endoscopy-cost', '수면내시경'],
    ['copay-rate-guide.html', 'copay-rate-guide', '본인부담률']
];

function readPage(name) {
    return fs.readFileSync(path.join(frontend, name), 'utf8');
}

function test(name, run) {
    try {
        run();
        console.log(`  [PASS] ${name}`);
    } catch (error) {
        console.error(`  [FAIL] ${name}`);
        throw error;
    }
}

console.log('=== MEDICost v3.0 page contract ===');

test('지원 페이지는 UTF-8, canonical, 공통 탐색과 홈 복귀 경로를 제공한다', () => {
    for (const name of pages) {
        const html = readPage(name);
        assert.match(html, /<meta charset=["']?utf-8/i, name);
        assert.match(html, /rel="canonical"/, name);
        assert.match(html, /class="site-header"/, name);
        assert.match(html, /class="site-footer"/, name);
        assert.match(html, /href="\/?(?:#calculator)?"/, name);
        assert.doesNotMatch(html, /(?:癰|筌|揶|占쏙)/, name);
    }
});

test('초기 HTML은 계산 데이터, 분석, 광고 스크립트를 직접 로드하지 않는다', () => {
    const html = readPage('index.html');
    for (const source of [
        'hira_codes.js',
        'fee_schedule_items.js',
        'nonbenefit_data.js',
        'medical_statistics.js',
        'analytics.js',
        'pagead2.googlesyndication.com'
    ]) {
        assert.doesNotMatch(html, new RegExp(`<script[^>]+${source.replaceAll('.', '\\.')}`, 'i'), source);
    }
});

test('공개 HTML은 동의 전에 분석 스크립트를 직접 로드하지 않는다', () => {
    const htmlFiles = fs.readdirSync(frontend).filter(name => name.endsWith('.html') && !name.startsWith('admin-'));
    for (const name of htmlFiles) {
        const html = readPage(name);
        assert.doesNotMatch(html, /<script[^>]+(?:analytics\.js|pagead2\.googlesyndication\.com)/i, name);
    }
});

test('모든 공개 페이지는 프로토타입 필수 자체통계와 선택 외부 분석을 구분한다', () => {
    for (const name of [...pages, ...seoPages.map(([pageName]) => pageName)]) {
        const html = readPage(name);
        assert.match(html, /\[필수\] 프로토타입 선택 기능 데이터 수집 동의/, name);
        assert.match(html, /수집·이용 목적/, name);
        assert.match(html, /수집 항목/, name);
        assert.match(html, /보유·이용 기간/, name);
        assert.match(html, /동의 거부/, name);
        assert.match(html, /필수 통계에 동의하고 선택 기능 이용/, name);
        assert.match(html, /동의하지 않고 기본 계산/, name);
        assert.match(html, /id="consent-enhanced"/, name);
        assert.match(html, /id="consent-analytics"/, name);
        assert.match(html, /\[필수\] 자체 방문·검색 통계 수집/, name);
        assert.match(html, /\[선택\] Google Analytics/, name);
        assert.match(html, /선택하지 않아도 프로토타입 선택 기능을 이용할 수 있습니다/, name);
        assert.doesNotMatch(html, /id="consent-ads"|맞춤 광고/, name);
    }
});

test('메인 페이지는 v3.0, 단계형 계산기, 동의 설정과 환자 부담금 의미를 명시한다', () => {
    const html = readPage('index.html');
    assert.match(html, /MEDICost <span class="brand-version">v3\.0/);
    assert.match(html, /data-step-panel="1"/);
    assert.match(html, /data-step-panel="2"/);
    assert.match(html, /data-step-panel="3"/);
    assert.match(html, /data-step-next="3"/);
    assert.match(html, /data-step-next="2"/);
    assert.match(html, /data-step-basic-result>필수 조건으로 계산/);
    assert.match(html, />선택 조건 추가<\/button>/);
    assert.match(html, />선택 조건으로<\/button>/);
    assert.doesNotMatch(html, /data-step-quick-result|data-quick-result/);
    assert.match(html, /id="advanced-items-toggle"/);
    assert.match(html, /id="advanced-items-panel"/);
    assert.match(html, /id="selection-summary"/);
    assert.match(html, /id="result-insights"/);
    assert.match(html, /id="result-insights-drivers"/);
    assert.match(html, /id="result-insights-summary"/);
    assert.match(html, /data-reset-calculator/);
    assert.doesNotMatch(html, /data-result-insurance|data-result-edit/);
    assert.doesNotMatch(html, /data-open-insurance|data-edit-conditions/);
    assert.doesNotMatch(html, /id="btn-show-result"|id="result-ready-message"|data-focus-result/);
    assert.match(html, /실비 환급 전 예상 환자 부담금/);
    assert.match(html, /data-open-consent/);
    assert.doesNotMatch(html, /style=/i);
});

test('문의 안내는 채널과 의료상담을 만들어내지 않는다', () => {
    const html = readPage('contact.html');
    assert.match(html, /공식 문의 채널을 준비하고 있습니다/);
    assert.match(html, /개인 의료상담/);
    assert.match(html, /환자정보/);
    assert.doesNotMatch(html, /mailto:|tel:/i);
});

test('개인정보 안내는 최소수집과 30일 보유 기준을 명시한다', () => {
    const html = readPage('privacy.html');
    assert.match(html, /프로토타입 선택 기능 필수 동의 항목/);
    assert.match(html, /목적:/);
    assert.match(html, /항목:/);
    assert.match(html, /보유·이용 기간:/);
    assert.match(html, /동의 거부 권리와 이용 제한/);
    assert.match(html, /실제 검색어/);
    assert.match(html, /검색 로그에는 IP, 브라우저 식별자, 세션, User-Agent를 저장하지 않습니다/);
    assert.match(html, /검색 로그와 연결하는 키를 두지 않습니다/);
    assert.match(html, /기본 계산은 가능합니다/);
    assert.match(html, /30일/);
    assert.match(html, /데이터 오류/);
    assert.match(html, /현재 이 사이트에는 광고와 제휴 링크를 게재하지 않습니다/);
    assert.match(html, /게재를 시작하기 전에/);
    assert.match(html, /입력칸과 예상 금액 숫자 위에는 광고를 겹치지 않으며/);
    assert.doesNotMatch(html, /Kakao AdFit|쿠팡 파트너스/);
});

test('이용약관과 면책·의료 고지는 색인 가능한 실제 페이지이고 모든 공개 페이지 하단에서 연결된다', () => {
    const terms = readPage('terms.html');
    const disclaimer = readPage('disclaimer.html');
    for (const [name, html] of [['terms.html', terms], ['disclaimer.html', disclaimer]]) {
        assert.match(html, /<title>[^<]{5,}<\/title>/, name);
        assert.match(html, /<meta name="description" content="[^"]{20,}"/, name);
        assert.match(html, /<meta name="robots" content="index, follow"/, name);
        assert.doesNotMatch(html, /mailto:|tel:/i, name);
    }
    assert.match(terms, /계산 결과의 성격/);
    assert.match(terms, /책임의 범위/);
    assert.match(disclaimer, /확정 견적이 아닙니다/);
    assert.match(disclaimer, /의료 판단을 제공하지 않습니다/);
    assert.match(disclaimer, /실제 청구액이 달라지는 이유/);
    assert.match(disclaimer, /자료 출처와 기준일/);
    assert.match(disclaimer, /119/);

    const feeDate = readPage('assets/js/fee_schedule_items.js').match(/"sourceDate":\s*"(\d{4})-(\d{2})-(\d{2})"/);
    const nonbenefitDate = readPage('assets/js/nonbenefit_data.js').match(/"fetchedAt":\s*"(\d{4})-(\d{2})-(\d{2})"/);
    for (const [label, match] of [['급여 수가 기준일', feeDate], ['비급여 수집일', nonbenefitDate]]) {
        assert.ok(match, label);
        const [, year, month, day] = match;
        assert.ok(disclaimer.includes(`${year}년 ${Number(month)}월 ${Number(day)}일`), `${label}: 면책 고지의 날짜가 데이터 파일과 다릅니다`);
    }

    for (const name of [...pages, ...seoPages.map(([pageName]) => pageName)]) {
        const footer = readPage(name).match(/<footer class="(?:site|seo)-footer">[\s\S]*?<\/footer>/);
        assert.ok(footer, `${name}: footer`);
        assert.match(footer[0], /href="\/terms"/, `${name}: terms link`);
        assert.match(footer[0], /href="\/disclaimer"/, `${name}: disclaimer link`);
    }
});

test('없는 주소는 홈으로 대체되지 않고 404 전용 페이지로 응답한다', () => {
    const html = readPage('404.html');
    assert.match(html, /<meta name="robots" content="noindex, follow"/);
    assert.doesNotMatch(html, /rel="canonical"/);
    assert.match(html, /페이지를 찾을 수 없습니다/);
    assert.match(html, /href="\/#calculator"/);
    assert.doesNotMatch(html, /(?:href|src)="assets\//, '중첩 경로에서도 깨지지 않도록 절대 경로 자산을 써야 합니다');
    assert.doesNotMatch(readPage('sitemap.xml'), /404/);
    for (const name of ['_redirects', '_routes.json']) {
        assert.strictEqual(fs.existsSync(path.join(frontend, name)), false, `${name}: SPA fallback 규칙이 404 응답을 가릴 수 있습니다`);
    }
});

test('관리자 검색 화면은 레거시 클릭 상세 대신 운영 통계 자산을 사용한다', () => {
    const html = readPage('admin-search.html');
    assert.match(html, /assets\/css\/admin-search\.css/);
    assert.match(html, /assets\/js\/admin-search\.js/);
    assert.doesNotMatch(html, /clicked_item_id|clicked_item_name|row\.user_agent|getDeviceLabel/);
});

test('검색 운영 관리자는 필요한 네 보기와 목록별 삭제 확인을 제공한다', () => {
    const html = readPage('admin-search.html');
    const script = readPage('assets/js/admin-search.js');
    assert.match(html, /data-tab="missing"/);
    assert.match(html, /data-tab="completed"/);
    assert.match(html, /data-tab="searches"/);
    assert.match(html, /data-tab="visitors"/);
    assert.match(html, /id="delete-dialog"/);
    assert.match(html, /검색어와 연결되지 않은 일별 익명 통계/);
    assert.match(script, /type: state\.pendingDelete\.type/);
    assert.match(script, /candidate-history/);
});

test('필수 안내 페이지는 현재 위치를 탐색 메뉴에 표시한다', () => {
    for (const name of ['about.html', 'data-sources.html', 'privacy.html', 'contact.html', 'terms.html', 'disclaimer.html']) {
        assert.match(readPage(name), /aria-current="page"/, name);
    }
});

test('홈은 사이트맵의 모든 공개 clean URL을 직접 연결하고 legacy HTML 링크를 만들지 않는다', () => {
    const sitemap = readPage('sitemap.xml');
    const home = readPage('index.html');
    const publicHtml = [...pages, ...seoPages.map(([name]) => name)].map(readPage).join('\n');
    const sitemapUrls = [...sitemap.matchAll(/<loc>https:\/\/hospital-fee-calc\.pages\.dev(\/[^<]*)?<\/loc>/g)]
        .map(([, pathname]) => pathname || '/');

    for (const pathname of sitemapUrls.filter((pathname) => pathname !== '/')) {
        assert.match(home, new RegExp(`href="${pathname.replaceAll('-', '\\-')}"`), pathname);
    }
    assert.doesNotMatch(publicHtml, /href="(?:\/)?(?:about|contact|data-sources|privacy|terms|disclaimer)\.html(?:[#?"])/);
});

test('공개 페이지 canonical은 운영 clean URL과 일치한다', () => {
    const supportPages = [
        ['about.html', 'about'],
        ['data-sources.html', 'data-sources'],
        ['privacy.html', 'privacy'],
        ['contact.html', 'contact'],
        ['terms.html', 'terms'],
        ['disclaimer.html', 'disclaimer']
    ];
    for (const [name, slug] of supportPages) {
        assert.match(readPage(name), new RegExp(`<link rel="canonical" href="https://hospital-fee-calc\\.pages\\.dev/${slug}"`), name);
    }
});

test('공개 SEO 페이지는 고유 한글 메타데이터와 검색용 본문을 제공한다', () => {
    for (const [name, slug, keyword] of seoPages) {
        const html = readPage(name);
        assert.match(html, /<meta charset=["']?utf-8/i, name);
        assert.match(html, /<meta name="robots" content="index, follow"/i, name);
        assert.match(html, new RegExp(`<link rel="canonical" href="https://hospital-fee-calc\\.pages\\.dev/${slug}"`), name);
        assert.match(html, new RegExp(`<title>[^<]*${keyword}`), name);
        assert.match(html, /<meta name="description" content="[^"]{20,}"/i, name);
        assert.match(html, new RegExp(`<h1[^>]*>[^<]*${keyword}`), name);
        assert.doesNotMatch(html, /(?:�|癰|沅|쑴|쎿)/, name);
        assert.match(html, /href="\/#calculator"/, `${name}: calculator CTA`);
        assert.match(html, /id="consent-banner"/);
        assert.match(html, /data-open-consent/);
        assert.doesNotMatch(html, /(?:googlesyndication|pagead2\.googlesyndication\.com)/i, `${name}: Google ad script`);
    }
});

test('공개 SEO 페이지의 JSON-LD와 크롤링 파일은 대표 URL과 일치한다', () => {
    const sitemap = readPage('sitemap.xml');
    const robots = readPage('robots.txt');
    const llms = readPage('llms.txt');
    const key = readPage('medicost-pages-20260712.txt');

    for (const [name, slug] of seoPages) {
        const html = readPage(name);
        const canonical = `https://hospital-fee-calc.pages.dev/${slug}`;
        const jsonLdBlocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi)];
        assert.ok(jsonLdBlocks.length > 0, `${name}: JSON-LD`);
        const structuredData = jsonLdBlocks.map(([, block]) => JSON.parse(block.trim()));
        assert.ok(structuredData.some((data) => data['@type'] === 'WebPage' && data['@id'] === `${canonical}#webpage` && data.url === canonical), `${name}: WebPage JSON-LD`);
        const faqPage = structuredData.find((data) => data['@type'] === 'FAQPage');
        const visibleFaqAnswers = [...html.matchAll(/<details><summary>[^<]+<\/summary><p>([^<]+)<\/p><\/details>/g)].map(([, answer]) => answer);
        assert.deepStrictEqual(faqPage.mainEntity.map((item) => item.acceptedAnswer.text), visibleFaqAnswers, `${name}: FAQ answer parity`);
        assert.match(sitemap, new RegExp(`<loc>${canonical.replaceAll('.', '\\.')}</loc>`), `${name}: sitemap`);
    }

    assert.match(robots, /Disallow: \/admin-search(?:\r?\n|$)/);
    assert.match(robots, /Disallow: \/admin-search\.html(?:\r?\n|$)/);
    assert.match(robots, /Disallow: \/admin-dashboard-prototype(?:\r?\n|$)/);
    assert.match(robots, /Sitemap: https:\/\/hospital-fee-calc\.pages\.dev\/sitemap\.xml/);
    assert.match(llms, /MEDICost/);
    assert.match(llms, /https:\/\/hospital-fee-calc\.pages\.dev\//);
    for (const [, url] of sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)) {
        assert.match(llms, new RegExp(url.replaceAll('.', '\\.') ), `llms.txt: ${url}`);
    }
    assert.doesNotMatch(llms, /(?:�|癰|沅|쑴|쎿)/);
    assert.strictEqual(key.trim(), 'medicost-pages-20260712');
});

test('AdSense 심사 전에는 공개 페이지에 Kakao AdFit·쿠팡 파트너스 광고와 운영자용 광고 안내를 두지 않는다', () => {
    const htmlFiles = fs.readdirSync(frontend).filter(name => name.endsWith('.html') && !name.startsWith('admin-'));
    for (const name of htmlFiles) {
        const html = readPage(name);
        assert.doesNotMatch(html, /class="[^"]*\bad-slot\b/, `${name}: ad slot`);
        assert.doesNotMatch(html, /kakao_ad_area|data-adfit-unit|t1\.kakaocdn\.net|adfit-ads\.js/i, `${name}: Kakao AdFit`);
        assert.doesNotMatch(html, /coupang|쿠팡/i, `${name}: Coupang Partners`);
        assert.doesNotMatch(html, /pagead2\.googlesyndication\.com/i, `${name}: Google ad script`);
    }

    const home = readPage('index.html');
    assert.doesNotMatch(home, /monetization-strip|AdSense 승인 전|result-ad-dialog|calculator-ad-footer/);
    assert.match(home, /현재 이 사이트에는 광고를 게재하지 않습니다/);
    assert.doesNotMatch(readPage('assets/js/app-shell.js'), /result-ad-dialog|MEDICostCoupangAds/);
    assert.strictEqual(readPage('ads.txt').trim(), 'google.com, pub-1927730301151401, DIRECT, f08c47fec0942fa0');

    const css = readPage('assets/css/style-v3.css');
    assert.match(css, /\.app-main \{[^}]*grid-template-columns: minmax\(0, 1fr\);[^}]*grid-template-areas: "workspace";/);
});

test('보관 중인 쿠팡 로더(현재 미연결)는 공식 추적 위젯만 렌더하고 결과 안내 위젯은 요청 시 연다', () => {
    const script = readPage('assets/js/coupang-ads.js');
    assert.match(script, /new root\.PartnersCoupang\.G/);
    assert.match(script, /trackingCode: 'AF2104018'/);
    assert.match(script, /container: frame/);
    assert.match(script, /root\.matchMedia/);
    assert.match(script, /fallback\.hidden = Boolean\(hasAd\)/);
    assert.match(script, /renderTriggeredSlots/);
    assert.match(script, /root\.MEDICostCoupangAds/);
});
