const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { CALCULATOR_SCRIPTS, DEFERRED_CALCULATOR_SCRIPTS } = require('../frontend/assets/js/app-shell.js');

const root = path.join(__dirname, '..');
const frontend = path.join(root, 'frontend');
const evidence = path.join(root, '.codex-progress', 'browser-qa');
const chromePath = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const serverPort = 4193;
const debugPort = 9233;
const baseUrl = `http://127.0.0.1:${serverPort}`;
const expectedCalculatorScriptCount = CALCULATOR_SCRIPTS.length + DEFERRED_CALCULATOR_SCRIPTS.length;
const staticServerScript = `
import http.server

class Handler(http.server.SimpleHTTPRequestHandler):
    def do_POST(self):
        if not self.path.startswith('/api/'):
            self.send_error(404)
            return
        length = int(self.headers.get('Content-Length', '0'))
        if length:
            self.rfile.read(length)
        payload = b'{"ok":true}'
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

http.server.ThreadingHTTPServer(('127.0.0.1', ${serverPort}), Handler).serve_forever()
`;

fs.mkdirSync(evidence, { recursive: true });

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForHttp(url, timeoutMs = 10000) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
        try {
            const response = await fetch(url);
            if (response.ok) return response;
        } catch {}
        await sleep(150);
    }
    throw new Error(`Timed out waiting for ${url}`);
}

class CDP {
    constructor(url) {
        this.url = url;
        this.nextId = 1;
        this.pending = new Map();
        this.consoleEvents = [];
        this.networkRequests = [];
    }

    async connect() {
        this.socket = new WebSocket(this.url);
        this.socket.addEventListener('message', event => {
            const message = JSON.parse(event.data);
            if (message.id && this.pending.has(message.id)) {
                const { resolve, reject } = this.pending.get(message.id);
                this.pending.delete(message.id);
                message.error ? reject(new Error(JSON.stringify(message.error))) : resolve(message.result || {});
                return;
            }
            if (message.method === 'Runtime.exceptionThrown') {
                this.consoleEvents.push({ type: 'exception', text: message.params.exceptionDetails?.text || '' });
            }
            if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error') {
                this.consoleEvents.push({ type: 'error', text: message.params.entry.text || '' });
            }
            if (message.method === 'Network.requestWillBeSent') {
                this.networkRequests.push({
                    url: message.params.request.url,
                    method: message.params.request.method,
                    postData: message.params.request.postData || ''
                });
            }
        });
        await new Promise((resolve, reject) => {
            this.socket.addEventListener('open', resolve, { once: true });
            this.socket.addEventListener('error', reject, { once: true });
        });
    }

    send(method, params = {}) {
        const id = this.nextId++;
        this.socket.send(JSON.stringify({ id, method, params }));
        return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
    }

    close() {
        this.socket.close();
    }
}

async function evaluate(cdp, expression) {
    const response = await cdp.send('Runtime.evaluate', {
        expression,
        awaitPromise: true,
        returnByValue: true,
        userGesture: true
    });
    if (response.exceptionDetails) throw new Error(JSON.stringify(response.exceptionDetails));
    return response.result.value;
}

async function waitFor(cdp, expression, timeoutMs = 45000) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
        if (await evaluate(cdp, expression)) return;
        await sleep(200);
    }
    throw new Error(`Timed out waiting for browser condition: ${expression}`);
}

async function navigate(cdp, url) {
    await cdp.send('Page.navigate', { url });
    await waitFor(cdp, `document.readyState === 'complete'`);
    await sleep(500);
}

async function press(cdp, key, code = key) {
    const keyCode = key === 'Enter' ? 13 : key === 'Tab' ? 9 : key.length === 1 ? key.toUpperCase().charCodeAt(0) : 0;
    const params = { key, code, windowsVirtualKeyCode: keyCode, nativeVirtualKeyCode: keyCode };
    await cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...params });
    if (key === 'Enter') {
        await cdp.send('Input.dispatchKeyEvent', { type: 'char', ...params, text: '\r', unmodifiedText: '\r' });
    }
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...params });
}

async function screenshot(cdp, name) {
    const result = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
    fs.writeFileSync(path.join(evidence, name), Buffer.from(result.data, 'base64'));
}

(async () => {
    assert.ok(fs.existsSync(chromePath), 'Google Chrome 실행 파일이 필요합니다.');
    const stamp = Date.now();
    const serverLog = fs.openSync(path.join(evidence, `server-${stamp}.log`), 'a');
    const chromeLog = fs.openSync(path.join(evidence, `chrome-${stamp}.log`), 'a');
    const server = spawn(...(process.platform === 'win32' ? ['py', ['-3', '-c', staticServerScript]] : ['python3', ['-c', staticServerScript]]), {
        cwd: frontend,
        stdio: ['ignore', serverLog, serverLog]
    });
    const chrome = spawn(chromePath, [
        '--headless=new',
        '--disable-gpu',
        '--no-first-run',
        '--no-default-browser-check',
        ...(process.env.CHROME_NO_SANDBOX === '1' ? ['--no-sandbox'] : []),
        `--remote-debugging-port=${debugPort}`,
        `--user-data-dir=${path.join(evidence, `profile-${stamp}`)}`,
        'about:blank'
    ], { stdio: ['ignore', chromeLog, chromeLog] });

    let cdp;
    try {
        await waitForHttp(`${baseUrl}/index.html`);
        const targets = await (await waitForHttp(`http://127.0.0.1:${debugPort}/json/list`)).json();
        const target = targets.find(item => item.type === 'page' && item.webSocketDebuggerUrl);
        assert.ok(target, 'Chrome page target을 찾지 못했습니다.');
        cdp = new CDP(target.webSocketDebuggerUrl);
        await cdp.connect();
        await cdp.send('Page.enable');
        await cdp.send('Runtime.enable');
        await cdp.send('Log.enable');
        await cdp.send('Network.enable');
        await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });

        await navigate(cdp, `${baseUrl}/index.html`);
        const initial = await evaluate(cdp, `(() => ({
            consentVisible: !document.getElementById('consent-banner').hidden,
            consentTitle: document.getElementById('consent-title').textContent,
            consentSummary: document.getElementById('consent-summary').textContent,
            heavyScripts: performance.getEntriesByType('resource').filter(entry => /(?:hira_codes|fee_schedule_items|nonbenefit_data|medical_statistics|script)\\.js/.test(entry.name)).length,
            analyticsRequests: performance.getEntriesByType('resource').filter(entry => /googletagmanager|googlesyndication|analytics\\.js/.test(entry.name)).length,
            adRequests: performance.getEntriesByType('resource').filter(entry => /t1\\.kakaocdn\\.net|ads-partners\\.coupang\\.com/.test(entry.name)).length,
            adScripts: {
                kakao: document.querySelectorAll('script[src*="t1.kakaocdn.net/kas/static/ba.min.js"]').length,
                coupang: document.querySelectorAll('script[src*="ads-partners.coupang.com/g.js"]').length
            },
            overflow: document.documentElement.scrollWidth - innerWidth
        }))()`);
        assert.strictEqual(initial.consentVisible, true);
        assert.match(initial.consentTitle, /\[필수\] 프로토타입 선택 기능 데이터 수집 동의/);
        assert.match(initial.consentSummary, /수집·이용 목적/);
        assert.match(initial.consentSummary, /수집 항목/);
        assert.match(initial.consentSummary, /보유·이용 기간/);
        assert.match(initial.consentSummary, /동의 거부/);
        assert.strictEqual(initial.heavyScripts, 0);
        assert.strictEqual(initial.analyticsRequests, 0);
        assert.strictEqual(initial.adRequests, 0);
        assert.deepStrictEqual(initial.adScripts, { kakao: 0, coupang: 0 });
        assert.ok(initial.overflow <= 0, `1280px 초기 가로 넘침: ${initial.overflow}`);

        await evaluate(cdp, `document.querySelector('[data-consent-essential]').focus()`);
        await press(cdp, 'Enter');
        const essentialConsent = await evaluate(cdp, `JSON.parse(localStorage.getItem('medicost-consent-v3'))`);
        assert.deepStrictEqual(
            { enhancedFeatures: essentialConsent.enhancedFeatures, analytics: essentialConsent.analytics },
            { enhancedFeatures: false, analytics: false }
        );

        await cdp.send('Network.setBlockedURLs', { urls: ['*nonbenefit_data.js*'] });
        await evaluate(cdp, `document.querySelector('[data-load-calculator]').click()`);
        await waitFor(cdp, `document.querySelector('#calculator-loader strong')?.textContent.includes('불러오지 못했습니다')`);
        assert.strictEqual(await evaluate(cdp, `document.querySelectorAll('script[data-calculator-src="assets/js/nonbenefit_data.js"]').length`), 0);

        await cdp.send('Network.setBlockedURLs', { urls: [] });
        await evaluate(cdp, `document.querySelector('#calculator-loader button').click()`);
        await waitFor(cdp, `document.getElementById('calculator').classList.contains('is-ready')`);
        await waitFor(cdp, `document.querySelectorAll('script[data-calculator-src]').length === ${expectedCalculatorScriptCount}`);
        const loaded = await evaluate(cdp, `(() => ({
            scripts: document.querySelectorAll('script[data-calculator-src]').length,
            initialized: Boolean(window.MEDICostCalculator),
            inert: document.querySelector('.calculator-runtime').inert,
            date: document.getElementById('hero-data-date').textContent
        }))()`);
        assert.deepStrictEqual(
            { scripts: loaded.scripts, initialized: loaded.initialized, inert: loaded.inert },
            { scripts: expectedCalculatorScriptCount, initialized: true, inert: false }
        );
        assert.doesNotMatch(loaded.date, /확인 불가|로드 후/);
        assert.strictEqual(await evaluate(cdp, `document.querySelectorAll('.ad-slot, .kakao_ad_area, [data-adfit-unit], [data-coupang-id]').length`), 0);

        await sleep(1000);
        cdp.consoleEvents.length = 0;
        await evaluate(cdp, `document.querySelector('[data-step-next="2"]').focus()`);
        await press(cdp, 'Enter');
        const validation = await evaluate(cdp, `({
            error: document.getElementById('step-1-error').textContent,
            focusName: document.activeElement.name,
            stepOneVisible: !document.querySelector('[data-step-panel="1"]').hidden
        })`);
        assert.match(validation.error, /병원 등급/);
        assert.strictEqual(validation.focusName, 'hospital_class');
        assert.strictEqual(validation.stepOneVisible, true);

        const selected = await evaluate(cdp, `(() => {
            const hospital = document.querySelector('input[name="hospital_class"][value="clinic"]');
            const treatment = document.querySelector('input[name="treatment_type"][value="outpatient"]');
            hospital.click();
            treatment.click();
            const region = document.getElementById('nonbenefit_region');
            region.value = [...region.options].find(option => option.value)?.value || '';
            region.dispatchEvent(new Event('change', { bubbles: true }));
            return { hospital: hospital.checked, treatment: treatment.checked, region: region.value };
        })()`);
        assert.ok(selected.hospital && selected.treatment && selected.region);
        await evaluate(cdp, 'document.querySelector("[data-step-basic-result]").click()');
        await waitFor(cdp, 'document.getElementById("display_final_cost").textContent !== "0"');
        assert.strictEqual(await evaluate(cdp, 'document.getElementById("result-ad-dialog")'), null);
        assert.strictEqual(await evaluate(cdp, 'document.querySelectorAll("dialog[open]").length'), 0);
        assert.notStrictEqual(await evaluate(cdp, 'document.getElementById("display_final_cost").textContent'), '0');
        await waitFor(cdp, '!document.querySelector("[data-step-panel=\\\"3\\\"]").hidden');
        const basicResult = await evaluate(cdp, `({
            insuranceDisabled: document.getElementById('has_insurance').disabled,
            optionalCount: document.querySelectorAll('#added_items_unified_list .added-item').length,
            result: document.getElementById('display_final_cost').textContent
        })`);
        assert.strictEqual(basicResult.insuranceDisabled, true);
        assert.strictEqual(basicResult.optionalCount, 0);
        assert.notStrictEqual(basicResult.result, '0');
        await evaluate(cdp, 'document.querySelector("[data-step-back=\\\"2\\\"]").click()');
        await waitFor(cdp, '!document.querySelector("[data-step-panel=\\\"1\\\"]").hidden');
        await evaluate(cdp, 'document.querySelector("[data-step-next=\\\"2\\\"]").click()');
        await waitFor(cdp, 'document.getElementById("consent-banner").open');
        assert.strictEqual(await evaluate(cdp, 'document.querySelector("[data-step-panel=\\\"2\\\"]").hidden'), true);
        await evaluate(cdp, 'document.querySelector("[data-consent-all]").click()');
        await waitFor(cdp, '!document.getElementById("consent-banner").open');
        const enhancedConsent = await evaluate(cdp, `JSON.parse(localStorage.getItem('medicost-consent-v3'))`);
        assert.deepStrictEqual(
            { enhancedFeatures: enhancedConsent.enhancedFeatures, analytics: enhancedConsent.analytics },
            { enhancedFeatures: true, analytics: false }
        );
        await evaluate(cdp, 'document.querySelector("[data-step-next=\\\"2\\\"]").click()');
        await waitFor(cdp, '!document.querySelector("[data-step-panel=\\\"2\\\"]").hidden');
        assert.strictEqual(await evaluate(cdp, 'document.querySelector("[data-step-panel=\\\"3\\\"]").hidden'), true);
        assert.match(await evaluate(cdp, 'document.getElementById("selection-summary").textContent'), /동네 의원/);
        assert.strictEqual(await evaluate(cdp, 'document.querySelectorAll("[data-result-insurance], [data-result-edit]").length'), 0);
        cdp.networkRequests.length = 0;
        await evaluate(cdp, `(() => {
            const input = document.getElementById('global-search-input');
            input.value = 'qa-browser-missing';
            input.dispatchEvent(new Event('input', { bubbles: true }));
            document.getElementById('btn-run-global-search').click();
        })()`);
        await sleep(500);
        const telemetrySearchRequests = cdp.networkRequests.filter(request => request.method === 'POST' && request.url.endsWith('/api/search-log'));
        assert.strictEqual(telemetrySearchRequests.length, 1, '검색 실행 한 번은 검색 로그 한 건만 전송해야 합니다.');
        assert.deepStrictEqual(JSON.parse(telemetrySearchRequests[0].postData), {
            query: 'qa-browser-missing',
            resultCount: 0,
            operationalConsent: true
        });
        await sleep(400);
        await screenshot(cdp, '1280-result.png');

        await evaluate(cdp, `(() => {
            const input = document.getElementById('global-search-input');
            input.value = 'zzzzzzzzzzzzzz';
            performSearch(input.value, 'global', { logSearch: false });
        })()`);
        const noResultText = await evaluate(cdp, `document.getElementById('global-search-results').textContent`);
        assert.match(noResultText, /없습니다/);

        await evaluate(cdp, `(() => {
            const input = document.getElementById('global-search-input');
            input.value = '';
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.focus();
        })()`);
        await evaluate(cdp, `(() => {
            const input = document.getElementById('global-search-input');
            input.value = 'MRI';
            performSearch(input.value, 'global', { logSearch: false });
        })()`);
        await waitFor(cdp, `document.querySelectorAll('#global-search-results .search-result-item').length > 0`);
        await evaluate(cdp, `document.querySelector('#global-search-results .search-result-item').click()`);
        await waitFor(cdp, `document.querySelectorAll('#added_items_unified_list .added-item').length > 0`);
        assert.match(await evaluate(cdp, 'document.getElementById("selection-summary").textContent'), /추가 1건/);

        const openFractureSurgery = async query => {
            await sleep(300);
            await evaluate(cdp, `(() => {
                const input = document.getElementById('global-search-input');
                input.value = ${JSON.stringify(query)};
                input.dispatchEvent(new Event('input', { bubbles: true }));
                performSearch(input.value, 'global', { logSearch: false });
            })()`);
            await waitFor(cdp, `document.querySelector('#global-search-results .search-result-item')`);
            await evaluate(cdp, `document.querySelector('#global-search-results .search-result-item').click()`);
            await waitFor(cdp, `document.getElementById('anesthesia-dialog').open`);
        };

        await openFractureSurgery('무릎 골절');
        for (const width of [1280, 768, 375]) {
            await cdp.send('Emulation.setDeviceMetricsOverride', { width, height: 800, deviceScaleFactor: 1, mobile: width < 768 });
            const dialogLayout = await evaluate(cdp, `(() => {
                const dialog = document.getElementById('anesthesia-dialog');
                const rect = dialog.getBoundingClientRect();
                return { left: rect.left, right: rect.right, width: innerWidth, scrollWidth: dialog.scrollWidth, clientWidth: dialog.clientWidth };
            })()`);
            assert.ok(dialogLayout.left >= 0 && dialogLayout.right <= dialogLayout.width, `${width}px 마취 팝업 화면 잘림`);
            assert.ok(dialogLayout.scrollWidth <= dialogLayout.clientWidth, `${width}px 마취 팝업 가로 넘침`);
            await screenshot(cdp, `${width}-anesthesia-dialog.png`);
        }
        await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
        await evaluate(cdp, `(() => {
            const type = document.getElementById('anesthesia-type');
            type.value = 'general';
            type.dispatchEvent(new Event('change', { bubbles: true }));
            document.getElementById('anesthesia-duration').value = '120';
            const sedation = document.getElementById('anesthesia-sedation');
            sedation.value = 'yes';
            sedation.dispatchEvent(new Event('change', { bubbles: true }));
        })()`);
        assert.match(await evaluate(cdp, `document.getElementById('anesthesia-status').textContent`), /중복 산정하지 않습니다/);
        await evaluate(cdp, `document.getElementById('anesthesia-form').requestSubmit()`);
        await waitFor(cdp, `!document.getElementById('anesthesia-dialog').open`);
        await waitFor(cdp, `document.querySelectorAll('#added_items_unified_list .added-item').length === 2`);
        assert.match(await evaluate(cdp, `document.getElementById('added_items_unified_list').textContent`), /전신마취 · 120분/);

        await openFractureSurgery('발목 골절');
        const sameSessionVisible = await evaluate(cdp, `({
            visible: !document.getElementById('anesthesia-session-fieldset').hidden,
            checked: document.querySelector('input[name="anesthesia_session_mode"][value="same"]').checked,
            typeDisabled: document.getElementById('anesthesia-type').disabled
        })`);
        assert.deepStrictEqual(sameSessionVisible, { visible: true, checked: true, typeDisabled: true });
        await evaluate(cdp, `document.getElementById('anesthesia-duration').value = '180'; document.getElementById('anesthesia-form').requestSubmit()`);
        await waitFor(cdp, `document.querySelectorAll('#added_items_unified_list .added-item').length === 3`);
        const sharedAnesthesia = await evaluate(cdp, `getAnesthesiaEstimate('clinic')`);
        assert.strictEqual(sharedAnesthesia.episodes.length, 1);
        assert.strictEqual(sharedAnesthesia.total, 145420 + (27980 * 8));

        await evaluate(cdp, `document.querySelector('[data-step-next="3"]').click()`);
        await waitFor(cdp, `!document.querySelector('[data-step-panel="3"]').hidden`);
        await evaluate(cdp, `document.querySelector('[data-step-back="2"]').click()`);
        const preserved = await evaluate(cdp, `({
            hospital: document.querySelector('input[name="hospital_class"]:checked')?.value,
            treatment: document.querySelector('input[name="treatment_type"]:checked')?.value,
            region: document.getElementById('nonbenefit_region').value,
            items: document.querySelectorAll('#added_items_unified_list .added-item').length
        })`);
        assert.deepStrictEqual(preserved, { hospital: 'clinic', treatment: 'outpatient', region: selected.region, items: 3 });

        await evaluate(cdp, `document.querySelector('[data-step-next="3"]').click()`);
        await waitFor(cdp, `document.getElementById('display_final_cost').textContent !== '0'`);
        const result = await evaluate(cdp, `({
            finalCost: document.getElementById('display_final_cost').textContent,
            totalCost: document.getElementById('display_total_cost').textContent,
            rows: document.querySelectorAll('#cost-table-body tr').length,
            sticky: getComputedStyle(document.querySelector('.result-card')).position
        })`);
        assert.notStrictEqual(result.finalCost, '0');
        assert.notStrictEqual(result.totalCost, '0');
        assert.ok(result.rows > 0);
        assert.strictEqual(result.sticky, 'sticky');
        const insights = JSON.parse(await evaluate(cdp, 'JSON.stringify({ drivers: document.querySelectorAll("#result-insights-drivers li").length, summary: document.getElementById("result-insights-summary").textContent, gasan: document.getElementById("display_gasan_label").textContent, gasanWordBreak: getComputedStyle(document.getElementById("display_gasan_label")).wordBreak, summaryWordBreak: getComputedStyle(document.getElementById("result-insights-summary")).wordBreak })'));
        assert.ok(insights.drivers > 0);
        assert.match(insights.summary, /비급여 공개자료|실손보험/);
        assert.match(insights.gasan, /%를/);
        assert.doesNotMatch(insights.gasan, /%이/);
        assert.strictEqual(insights.gasanWordBreak, 'keep-all');
        assert.strictEqual(insights.summaryWordBreak, 'keep-all');
        await evaluate(cdp, 'document.getElementById("result-insights").scrollIntoView({ block: "center" })');
        await sleep(300);
        await screenshot(cdp, '1280-result-insights.png');
        await screenshot(cdp, '1280-calculator-result.png');

        const emergencyCost = await evaluate(cdp, `(() => {
            document.querySelector('input[name="treatment_type"][value="er"]').click();
            requestCalculation();
            return document.getElementById('display_final_cost').textContent;
        })()`);
        assert.notStrictEqual(emergencyCost, '0');

        const inpatientCost = await evaluate(cdp, `(() => {
            document.querySelector('input[name="treatment_type"][value="inpatient"]').click();
            document.getElementById('stay_days').value = '3';
            requestCalculation();
            return document.getElementById('display_final_cost').textContent;
        })()`);
        assert.notStrictEqual(inpatientCost, '0');

        await evaluate(cdp, `document.querySelector('[data-step-target="2"]').click()`);
        await evaluate(cdp, `document.getElementById('advanced-items-toggle').click()`);
        await evaluate(cdp, `document.getElementById('has_disease_code').click()`);
        const diseaseFocus = await evaluate(cdp, `(() => {
            document.getElementById('disease_code_input').focus();
            return { id: document.activeElement.id, tag: document.activeElement.tagName };
        })()`);
        assert.deepStrictEqual(diseaseFocus, { id: 'disease_code_input', tag: 'INPUT' });
        await cdp.send('Input.insertText', { text: '감기' });
        await sleep(300);
        const diseaseDiagnostics = await evaluate(cdp, `({
            inputValue: document.getElementById('disease_code_input').value,
            activeElementId: document.activeElement.id,
            activeElementTag: document.activeElement.tagName,
            hasInputHandler: typeof document.getElementById('disease_code_input').oninput === 'function',
            databaseSize: ALL_KCD_DATABASE.length,
            matchedCount: eofSearchKcd('감기').length,
            resultButtons: document.querySelectorAll('#disease-search-results .search-result-item').length,
            resultText: document.getElementById('disease-search-results').textContent.trim().slice(0, 120)
        })`);
        await press(cdp, 'Enter');
        assert.ok(diseaseDiagnostics.databaseSize > 0, JSON.stringify(diseaseDiagnostics));
        assert.ok(diseaseDiagnostics.matchedCount > 0, JSON.stringify(diseaseDiagnostics));
        assert.ok(diseaseDiagnostics.resultButtons > 0, JSON.stringify(diseaseDiagnostics));
        const diseaseSelection = await evaluate(cdp, `document.getElementById('disease_code_input').value`);
        assert.match(diseaseSelection, /[A-Z][0-9]/);

        await evaluate(cdp, `document.querySelector('[data-step-next="3"]').click()`);
        const insuranceResult = await evaluate(cdp, `(() => {
            document.getElementById('has_insurance').click();
            const initialRefund = document.getElementById('display_refund_cost').textContent;
            const generation = document.getElementById('insurance_generation');
            generation.value = 'gen4';
            generation.dispatchEvent(new Event('change', { bubbles: true }));
            return {
                initialRefund,
                refund: document.getElementById('display_refund_cost').textContent,
                visible: !document.getElementById('result_insurance_box').classList.contains('hidden')
            };
        })()`);
        assert.notStrictEqual(insuranceResult.refund, '0');
        assert.notStrictEqual(insuranceResult.refund, insuranceResult.initialRefund);
        assert.strictEqual(insuranceResult.visible, true);
        await cdp.send('Emulation.setDeviceMetricsOverride', { width: 375, height: 800, deviceScaleFactor: 1, mobile: true });
        await evaluate(cdp, 'document.querySelector(".result-card").scrollIntoView({ block: "start" })');
        await sleep(300);
        await screenshot(cdp, '375-result-controls.png');
        await cdp.send('Emulation.setDeviceMetricsOverride', { width: 768, height: 800, deviceScaleFactor: 1, mobile: false });
        await evaluate(cdp, 'document.querySelector(".result-card").scrollIntoView({ block: "start" })');
        await sleep(300);
        await screenshot(cdp, '768-result-controls.png');
        await cdp.send('Emulation.setDeviceMetricsOverride', { width: 375, height: 800, deviceScaleFactor: 1, mobile: true });
        await evaluate(cdp, 'document.getElementById("result-insights").scrollIntoView({ block: "start" })');
        await sleep(300);
        const mobileInsights = await evaluate(cdp, '({ scrollWidth: document.documentElement.scrollWidth, width: innerWidth, drivers: document.querySelectorAll("#result-insights-drivers li").length })');
        assert.ok(mobileInsights.scrollWidth <= mobileInsights.width, `375px 결과 해석 가로 넘침: ${mobileInsights.scrollWidth - mobileInsights.width}px`);
        assert.ok(mobileInsights.drivers > 0);
        await screenshot(cdp, '375-result-insights.png');
        await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
        await evaluate(cdp, 'document.querySelector("[data-reset-calculator]").click()');
        assert.strictEqual(await evaluate(cdp, 'document.querySelector("[data-step-panel=\\\"1\\\"]").hidden'), false);
        assert.strictEqual(await evaluate(cdp, 'document.querySelectorAll("#added_items_unified_list .added-item").length'), 0);
        assert.strictEqual(await evaluate(cdp, 'document.activeElement.name'), 'hospital_class');
        assert.match(await evaluate(cdp, 'document.getElementById("calculator-reset-status").textContent'), /초기화/);
        const scenarioResults = { emergencyCost, inpatientCost, diseaseDiagnostics, diseaseSelection, insuranceResult };

        const viewportChecks = [];
        for (const width of [375, 768, 1000, 1280, 1440]) {
            await cdp.send('Emulation.setDeviceMetricsOverride', { width, height: 800, deviceScaleFactor: 1, mobile: width < 768 });
            await navigate(cdp, `${baseUrl}/index.html`);
            const check = await evaluate(cdp, `(() => {
                const touchNodes = [...document.querySelectorAll('button, a, input, select')].filter(node => {
                    const rect = node.getBoundingClientRect();
                    const style = getComputedStyle(node);
                    return rect.width > 0 && rect.height > 0 && style.opacity !== '0' && style.pointerEvents !== 'none';
                });
                return {
                    width: innerWidth,
                    scrollWidth: document.documentElement.scrollWidth,
                    minTouch: Math.min(...touchNodes.map(node => node.getBoundingClientRect().height)),
                    smallTouches: touchNodes.filter(node => node.getBoundingClientRect().height < 44).map(node => ({ tag: node.tagName, id: node.id, className: node.className, text: node.textContent.trim().slice(0, 30), height: node.getBoundingClientRect().height })).slice(0, 12),
                    resultPosition: getComputedStyle(document.querySelector('.result-card')).position,
                    appColumns: getComputedStyle(document.querySelector('.app-main')).gridTemplateColumns.split(' ').length,
                    workspaceColumns: getComputedStyle(document.querySelector('.calculator-workspace')).gridTemplateColumns.split(' ').length,
                    formWidth: Math.round(document.querySelector('.form-card').getBoundingClientRect().width),
                    workspaceWidth: Math.round(document.querySelector('.calculator-workspace').getBoundingClientRect().width),
                    adSlots: document.querySelectorAll('.ad-slot, [data-adfit-unit], [data-coupang-id]').length
                };
            })()`);
            viewportChecks.push(check);
            assert.ok(check.scrollWidth <= check.width, `${width}px 가로 넘침: ${check.scrollWidth - check.width}px`);
            assert.ok(check.minTouch >= 44, `${width}px 최소 터치 높이: ${check.minTouch}px ${JSON.stringify(check.smallTouches)}`);
            assert.strictEqual(check.resultPosition, width < 768 ? 'static' : 'sticky');
            assert.strictEqual(check.appColumns, 1);
            assert.strictEqual(check.workspaceColumns, width < 768 ? 1 : 2);
            assert.strictEqual(check.adSlots, 0);
            if (width >= 1280) {
                assert.ok(check.formWidth >= 360, `${width}px 입력 카드 폭이 좁습니다: ${check.formWidth}px`);
                assert.ok(check.workspaceWidth >= width * 0.55, `${width}px 계산기 작업면이 PC 폭을 쓰지 않습니다: ${check.workspaceWidth}px`);
            }
            await screenshot(cdp, `${width}-hero.png`);
        }

        await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
        await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: 2 });
        assert.ok(await evaluate(cdp, `document.documentElement.scrollWidth <= innerWidth`), '200% 확대에서 가로 넘침이 발생했습니다.');
        await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1 });
        await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
        const reducedMotion = await evaluate(cdp, `getComputedStyle(document.querySelector('.receipt-preview')).transitionDuration`);
        assert.match(reducedMotion, /0\.01ms|1e-05s|0s/);

        const optionalRequests = await evaluate(cdp, `performance.getEntriesByType('resource').filter(entry => /googletagmanager|googlesyndication|analytics\\.js/.test(entry.name)).length`);
        assert.strictEqual(optionalRequests, 0);
        const vendorConsoleEvents = cdp.consoleEvents.filter(event => /Cannot visible ad on screen ins\.kakao_ad_area/.test(event.text));
        const appConsoleEvents = cdp.consoleEvents.filter(event => !/Cannot visible ad on screen ins\.kakao_ad_area/.test(event.text));
        assert.deepStrictEqual(appConsoleEvents, []);

        const supportResults = [];
        for (const page of ['about.html', 'data-sources.html', 'privacy.html', 'contact.html', 'terms.html', 'disclaimer.html']) {
            await navigate(cdp, `${baseUrl}/${page}`);
            const support = await evaluate(cdp, `({
                page: ${JSON.stringify(page)},
                lang: document.documentElement.lang,
                title: document.title,
                heading: document.querySelector('h1')?.textContent.trim(),
                current: document.querySelector('[aria-current="page"]')?.textContent.trim(),
                overflow: document.documentElement.scrollWidth - innerWidth
            })`);
            supportResults.push(support);
            assert.strictEqual(support.lang, 'ko');
            assert.ok(support.title && support.heading && support.current, `${page} 필수 문서 구조가 누락됐습니다.`);
            assert.ok(support.overflow <= 0, `${page} 가로 넘침: ${support.overflow}px`);
        }
        await screenshot(cdp, '1280-contact.png');

        await evaluate(cdp, `(() => {
            document.querySelector('[data-open-consent]').click();
            document.getElementById('consent-analytics').checked = true;
            document.querySelector('[data-consent-save]').click();
        })()`);
        await navigate(cdp, `${baseUrl}/hospital-cost-calculator.html`);
        await waitFor(cdp, `document.getElementById('medicost-analytics')`);
        await waitFor(cdp, `document.getElementById('medicost-analytics-loader')`);
        const optionalScriptsAfterConsent = await evaluate(cdp, `({
            analytics: document.getElementById('medicost-analytics')?.getAttribute('src'),
            analyticsLoader: Boolean(document.getElementById('medicost-analytics-loader')),
            kakaoScripts: document.querySelectorAll('script[src*="t1.kakaocdn.net/kas/static/ba.min.js"]').length,
            kakaoSlots: document.querySelectorAll('.kakao_ad_area').length,
            kakaoRequests: performance.getEntriesByType('resource').filter(entry => entry.name.includes('t1.kakaocdn.net/kas/static/ba.min.js')).length
        })`);
        assert.match(optionalScriptsAfterConsent.analytics, /assets\/js\/analytics\.js/);
        assert.strictEqual(optionalScriptsAfterConsent.analyticsLoader, true);
        assert.strictEqual(optionalScriptsAfterConsent.kakaoScripts, 0);
        assert.strictEqual(optionalScriptsAfterConsent.kakaoSlots, 0);
        assert.strictEqual(optionalScriptsAfterConsent.kakaoRequests, 0);
        await evaluate(cdp, `window.MEDICostConsent.saveConsent(false)`);
        const optionalScriptsAfterWithdrawal = await evaluate(cdp, `({
            analytics: Boolean(document.getElementById('medicost-analytics')),
            analyticsLoader: Boolean(document.getElementById('medicost-analytics-loader')),
            analyticsDisabled: window['ga-disable-G-YCKQ2W2BWT'],
            kakaoScripts: document.querySelectorAll('script[src*="t1.kakaocdn.net/kas/static/ba.min.js"]').length,
            kakaoSlots: document.querySelectorAll('.kakao_ad_area').length
        })`);
        assert.deepStrictEqual(optionalScriptsAfterWithdrawal, { analytics: false, analyticsLoader: false, analyticsDisabled: true, kakaoScripts: 0, kakaoSlots: 0 });

        const report = { initial, loaded, validation, selected, telemetrySearchRequestCount: telemetrySearchRequests.length, preserved, result, scenarioResults, viewportChecks, reducedMotion, optionalRequests, vendorConsoleEvents, appConsoleEvents, supportResults, optionalScriptsAfterConsent, optionalScriptsAfterWithdrawal };
        fs.writeFileSync(path.join(evidence, 'results.json'), JSON.stringify(report, null, 2));
        console.log('PASS: MEDICost v3.0 Chrome QA');
        console.log(JSON.stringify(report, null, 2));
    } finally {
        if (cdp) cdp.close();
        server.kill();
        chrome.kill();
        fs.closeSync(serverLog);
        fs.closeSync(chromeLog);
    }
})().catch(error => {
    console.error(error.stack || error);
    process.exitCode = 1;
});
