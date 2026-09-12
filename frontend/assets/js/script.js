/*
  =====================================================
  MEDICost v3.0 — 심평원 전체 수가 코드 기반 계산기
  =====================================================
  건강보험심사평가원의 수가 데이터를 기반으로 계산을 처리하는 스크립트입니다.
  검색 및 추가 인터페이스를 [검사], [시술], [수술] 3대 대분류 탭으로 구분하고,
  각 대분류 내에서 직접 선택(셀렉트 박스)과 자연어/의학 용어 검색이 동시에 가능하도록 제공합니다.
  "기타 처치, 주사, 마취 등"은 접이식 아코디언 버튼을 클릭하면 활성화되어 선택/검색이 가능해집니다.

  ★ 자료 기준: 2025년 1월 고시 기준 (환산지수 94.1원/점)
  ★ 초보자 교육용 상세 설명과 풍부한 한글 주석을 제공합니다.
*/

// =========================================================
// 1. 심평원 수가 데이터베이스 (DB 객체)
// =========================================================
const DB = {

    /* ---------------------------------------------------
       A. 병원 등급별 기본 세팅
       - 2025년 기준 환산지수: 의원 94.1원, 병원급 이상 82.2원
       - 종별 가산: 의원 15%, 병원 20%, 종합병원 25%, 상급종합 30%
       - 외래 본인부담: 의원 30%, 병원 40%, 종합 50%, 상급종합 60%
       - 입원 본인부담: 전 등급 20%
     --------------------------------------------------- */
    HOSPITAL_CLASS: {
        clinic: {
            name: "동네 의원",
            gasanRate: 1.15,
            outpatientRate: 0.30,
            inpatientRate: 0.20,
            baseConsult: 17000,
            erFee: 20000,
            roomStandard: 40000
        },
        hospital: {
            name: "일반 병원",
            gasanRate: 1.20,
            outpatientRate: 0.40,
            inpatientRate: 0.20,
            baseConsult: 19000,
            erFee: 50000,
            roomStandard: 55000
        },
        general_hospital: {
            name: "종합병원",
            gasanRate: 1.25,
            outpatientRate: 0.50,
            inpatientRate: 0.20,
            baseConsult: 21000,
            erFee: 70000,
            roomStandard: 75000
        },
        tertiary_hospital: {
            name: "대학병원 (상급종합)",
            gasanRate: 1.30,
            outpatientRate: 0.60,
            inpatientRate: 0.20,
            baseConsult: 23000,
            erFee: 90000,
            roomStandard: 100000
        }
    },

    // 상급병실(1~2인실) 비급여 1일 추가 차액
    ROOM_PREMIUM_ADD: 150000,

    /* ---------------------------------------------------
       B. 입원 시 일일 기본 부대비용 자동 산정 기준표
       - 실제 입원 시 별도 청구되는 주사/투약/처치/식대를
         소비자가 일일이 입력할 수 없으므로 자동 산정합니다.
     --------------------------------------------------- */
    INPATIENT_DAILY_EXTRAS: {
        injection_med: { name: "주사·수액·투약료", price: 25000, isBenefit: true },
        nursing_care: { name: "간호·기본처치료", price: 15000, isBenefit: true },
        meal: { name: "식대 (3식)", price: 13000, isBenefit: true }
    },

    /* ---------------------------------------------------
       D. 실비보험 세대별 보장 비율 및 한도
     --------------------------------------------------- */
    INSURANCE_RATES: {
        gen1: { name: "1세대 (~2009.7)", benefitRate: 1.00, nonBenefitRate: 1.00 },
        gen2: { name: "2세대 (2009.8~2017.3)", benefitRate: 0.90, nonBenefitRate: 0.90 },
        gen3: { name: "3세대 (2017.4~2021.6)", benefitRate: 0.90, nonBenefitRate: 0.80 },
        gen4: { name: "4세대 (2021.7~현재)", benefitRate: 0.80, nonBenefitRate: 0.70 }
    },
    SANJEONG_SPECIAL_RATES: {
        cancer: { name: "중증 암 환자", rate: 0.05 },
        heart: { name: "심장질환 수술 환자", rate: 0.05 },
        cerebro: { name: "뇌혈관질환 수술 환자", rate: 0.05 },
        burn: { name: "중증 화상 환자", rate: 0.05 },
        rare: { name: "희귀질환자", rate: 0.10 },
        intractable: { name: "중증난치질환자", rate: 0.10 },
        dementia: { name: "중증치매 환자", rate: 0.10 },
        tuberculosis: { name: "결핵 산정특례 대상자", rate: 0.00 }
    },
    NON_BENEFIT_PUBLIC_PRICE_DATA: {
        reference: "국민건강보험 비급여 항목별 가격정보 공개 화면, 2026-05-23 확인",
        defaultRegion: "national",
        regions: {
            national: { name: "전국" }
        },
        items: {
            PR_RE04: {
                nhisCode: "MX1220000",
                nhisName: "도수치료",
                regionPrices: {
                    national: { median: 100000, min: 30000 }
                }
            },
            IM_MR05: {
                nhisCode: "HE5200000",
                nhisName: "슬관절 MRI 3차원",
                regionPrices: {
                    national: { median: 550000, min: 400000 }
                }
            },
            IM_MR06: {
                nhisCode: "HE5150000",
                nhisName: "견관절 MRI 3차원",
                regionPrices: {
                    national: { median: 550000, min: 400000 }
                }
            }
        }
    },
    OUTPATIENT_LIMIT: 250000,
    DATA_REFERENCE_DATE: "데이터 기준일 확인 중"
};


// =========================================================
// 2. 상태 변수 (사용자가 추가한 항목 저장)
// =========================================================
let addedTests = [];
let addedSurgeries = [];
let addedProcedures = [];
let pendingSurgeryItem = null;
let testIdCounter = 0;
let surgeryIdCounter = 0;
let procedureIdCounter = 0;
let anesthesiaSessionCounter = 0;

let activeTab = 'test'; // 현재 활성화된 카테고리 탭 (기본값: 검사)
let etcAccordionOpen = false; // 기타 처치 아코디언의 펼침 여부 상태
let resultRequested = false;

const EMERGENCY_SEVERITY_CODE_MAP = {
    mild: 'ER_LG01',
    moderate: 'ER_MD01',
    severe: 'ER_ST01'
};

const DATA_SOURCE_CONFIG = {
    apiBaseUrl: (typeof window !== 'undefined' && window.MEDICOST_API_BASE_URL) ? window.MEDICOST_API_BASE_URL : '',
    nonBenefitRegionPricesPath: '/api/nonbenefit/region-prices',
    nonBenefitCodeMapPath: '/api/nonbenefit/code-map'
};

const nonBenefitDataState = {
    prices: null,
    codeMap: null,
    sourceType: 'static',
    statusText: '정적 공개자료 기준'
};

const publicMedicalStatsState = {
    stats: (typeof window !== 'undefined' && window.MEDICAL_STATISTICS) ? window.MEDICAL_STATISTICS : null,
    sourceType: (typeof window !== 'undefined' && window.MEDICAL_STATISTICS) ? 'local-csv' : 'none'
};

function getPublicMedicalStatistics() {
    if (!publicMedicalStatsState.stats && typeof window !== 'undefined' && window.MEDICAL_STATISTICS) {
        publicMedicalStatsState.stats = window.MEDICAL_STATISTICS;
        publicMedicalStatsState.sourceType = 'local-csv';
    }
    return publicMedicalStatsState.stats;
}

const VISIT_TYPE_MAP = {
    outpatient: '외래',
    er: '외래',
    inpatient: '입원'
};

function getVisitTypeLabel(treatmentType) {
    return VISIT_TYPE_MAP[treatmentType] || '외래';
}

function normalizeDiseaseCodeInput(value) {
    return String(value || '')
        .trim()
        .toUpperCase()
        .replace(/\s+/g, '')
        .replace(/\./g, '');
}

function getDiseaseStatistics(code, treatmentType) {
    const normalizedCode = normalizeDiseaseCodeInput(code);
    const stats = getPublicMedicalStatistics();
    if (!normalizedCode || !stats || !stats.diseases) return null;

    const visitType = getVisitTypeLabel(treatmentType);
    const exact = stats.diseases[`${normalizedCode}|${visitType}`];
    if (exact) return { code: normalizedCode, visitType, stat: exact, matchType: 'exact' };

    const shortCode = normalizedCode.slice(0, 3);
    const prefix = Object.keys(stats.diseases).find(key => key.startsWith(`${shortCode}|`) && key.endsWith(`|${visitType}`));
    if (!prefix) return null;

    return { code: shortCode, visitType, stat: stats.diseases[prefix], matchType: 'prefix' };
}

function getActionStatistics(item, treatmentType) {
    const stats = getPublicMedicalStatistics();
    const actionCode = item && (item.publicActionCode || item.actionCode || item.ediCode);
    if (!stats || !stats.actions || !actionCode) return null;

    const visitType = getVisitTypeLabel(treatmentType);
    const stat = stats.actions[`${actionCode}|${visitType}`];
    if (!stat || !stat.avgClaimPerUse) return null;

    return { actionCode, visitType, stat };
}

function applyPublicStatsToItem(item) {
    const treatmentType = document.querySelector('input[name="treatment_type"]:checked')?.value || 'outpatient';
    const actionStats = getActionStatistics(item, treatmentType);
    if (!actionStats) return { ...item };

    return {
        ...item,
        price: actionStats.stat.avgClaimPerUse,
        alreadyPricedByProvider: true,
        publicStatsSource: `2024 공공데이터 행위코드 ${actionStats.actionCode} ${actionStats.visitType} 평균`
    };
}

let medicalItemsOverlay = [];
let approvedSearchAliases = new Map();

function normalizeMedicalItem(item) {
    const code = String(item.code || item.item_code || '');
    return {
        code,
        publicActionCode: item.publicActionCode || item.public_action_code || code.replace(/^FEE_/, ''),
        category: item.category || item.item_category || 'procedure',
        group: item.group || item.item_group || 'etc',
        type: item.type || item.item_type || 'custom',
        name: String(item.name || item.item_name || ''),
        price: Number(item.price ?? item.hospitalPrice ?? item.hospital_price ?? 0),
        clinicPrice: Number(item.clinicPrice ?? item.clinic_price ?? 0),
        hospitalPrice: Number(item.hospitalPrice ?? item.hospital_price ?? item.price ?? 0),
        isBenefit: Boolean(item.isBenefit ?? item.is_benefit),
        alreadyPricedByProvider: true,
        publicFeeScheduleSource: item.publicFeeScheduleSource || item.sourceUrl || item.source_url || '관리자 승인 공개 DB',
        keywords: Array.isArray(item.keywords) ? item.keywords.map(String) : []
    };
}

async function loadMedicalItemsOverlay() {
    try {
        const response = await fetch('/api/medical-items', { cache: 'no-store' });
        if (!response.ok) return;
        const data = await response.json();
        const items = Array.isArray(data.items) ? data.items : [];
        medicalItemsOverlay = items.map(normalizeMedicalItem).filter(item => item.code && item.name);
    } catch (error) {
        medicalItemsOverlay = [];
    }
}

async function loadApprovedSearchAliases() {
    try {
        const response = await fetch('/api/search-aliases', { cache: 'no-store' });
        if (!response.ok) return;
        const data = await response.json();
        const aliases = Array.isArray(data.aliases) ? data.aliases : [];
        approvedSearchAliases = aliases.reduce(function(map, item) {
            if (item && typeof item.alias === 'string' && typeof item.code === 'string') {
                const existing = map.get(item.code) || [];
                map.set(item.code, existing.concat(item.alias));
            }
            return map;
        }, new Map());
    } catch (error) {
        approvedSearchAliases = new Map();
    }
}

function getMedicalItemDatabase() {
    const publicFeeItems = (typeof window !== 'undefined' && window.PUBLIC_FEE_SCHEDULE_ITEMS && Array.isArray(window.PUBLIC_FEE_SCHEDULE_ITEMS.items))
        ? window.PUBLIC_FEE_SCHEDULE_ITEMS.items
        : [];
    const itemsByCode = new Map();
    HIRA_DATABASE.concat(publicFeeItems).forEach(item => itemsByCode.set(item.code, item));
    medicalItemsOverlay.forEach(item => itemsByCode.set(item.code, item));
    return Array.from(itemsByCode.values()).map(function(item) {
        const aliases = approvedSearchAliases.get(item.code) || [];
        if (!aliases.length) return item;
        return { ...item, keywords: Array.from(new Set([...(item.keywords || []), ...aliases])) };
    });
}

function resolveProviderPrice(item) {
    const hospitalClass = document.querySelector('input[name="hospital_class"]:checked')?.value || 'hospital';
    if (hospitalClass === 'clinic' && item.clinicPrice) return item.clinicPrice;
    if (item.hospitalPrice) return item.hospitalPrice;
    return item.price;
}

function getBenefitChargeBase(item, hData) {
    const base = item.basePrice || 0;
    return item.alreadyPricedByProvider ? base : base * hData.gasanRate;
}

function getHospitalGasanInfo(hData) {
    const ratePercent = Math.max(0, Math.round(((hData?.gasanRate || 1) - 1) * 100));
    return {
        ratePercent,
        label: ratePercent > 0 ? `${hData.name} 종별가산 ${ratePercent}%` : `${hData.name} 종별가산 없음`
    };
}

function getBenefitGasanPatientPay(item, hData, patientRate, discountFactor = 1, count = 1) {
    if (!item || item.alreadyPricedByProvider) return 0;
    const base = Number(item.basePrice || 0);
    const gasanRate = Math.max(0, Number(hData?.gasanRate || 1) - 1);
    return base * gasanRate * discountFactor * patientRate * count;
}

function getAutoGasanPatientPay(basePrice, hData, patientRate, count = 1) {
    const base = Number(basePrice || 0);
    const gasanRate = Math.max(0, Number(hData?.gasanRate || 1) - 1);
    return base * gasanRate * patientRate * count;
}

function onDocumentReady(callback) {
    if (!document.readyState || document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', callback, { once: true });
        return;
    }
    callback();
}

let calculatorInitialization = null;

function initializeCalculatorApp() {
    if (calculatorInitialization) return calculatorInitialization;

    calculatorInitialization = (async () => {
        await Promise.resolve();
        const form = document.getElementById('calculator-form');
        if (form && form.dataset.calculatorBound !== 'true') {
            form.addEventListener('change', handleCalculatorInputChange, true);
            form.dataset.calculatorBound = 'true';
        }

        const dateEl = document.getElementById('data-reference-date');
        if (dateEl) {
            const feeDate = window.PUBLIC_FEE_SCHEDULE_ITEMS?.sourceDate;
            const nonBenefitDate = window.NONBENEFIT_REGION_PRICES?.fetchedAt;
            dateEl.innerText = feeDate && nonBenefitDate
                ? `급여 ${feeDate} · 비급여 ${nonBenefitDate}`
                : DB.DATA_REFERENCE_DATE;
        }

        const optionalMedicalItems = Promise.all([loadMedicalItemsOverlay(), loadApprovedSearchAliases()]);
        const optionalData = Promise.all([optionalMedicalItems, initializeDataSources()]);
        populateNonBenefitRegions();
        switchTab('test');
        renderDirectSelectOptions('etc', 'etc');
        initSearchEvents();
        resetResultView();
        updateResultButtonState();
        optionalData.catch(() => undefined);
    })();

    return calculatorInitialization;
}

if (typeof window !== 'undefined') {
    window.MEDICostCalculator = Object.freeze({
        init: initializeCalculatorApp,
        prepareBasicCalculation
    });
}

// =========================================================
// 3. 문서 로드 완료 시 초기화
// =========================================================
onDocumentReady(() => initializeCalculatorApp());


// =========================================================
// 4. UI 탭 및 아코디언 제어 함수
// =========================================================

/** 
 * 카테고리 탭 전환 처리 함수
 * @param {string} tabId - 전환할 탭 아이디 ('test', 'procedure_hira', 'surgery')
 */
function switchTab(tabId) {
    activeTab = tabId;
    
    // 탭 버튼 active 클래스 전환 적용
    document.querySelectorAll('.category-tabs .tab-btn').forEach(btn => {
        if (btn.getAttribute('data-tab') === tabId) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
    
    // 직접 선택 셀렉트 박스의 옵션들을 현재 활성 탭에 맞춰서 갱신
    renderDirectSelectOptions('category', tabId);
    
    // 하단 추천 검색어 키워드 칩 목록 갱신
    renderRecommendChips(tabId);
    
    // 검색 입력값 및 검색 결과 목록 초기화
    const searchInput = document.getElementById('category-search-input');
    const btnClear = document.getElementById('btn-clear-category-search');
    const resultsList = document.getElementById('category-search-results');
    const btnRun = document.getElementById('btn-run-category-search');
    
    if (searchInput) searchInput.value = '';
    if (btnClear) btnClear.classList.add('hidden');
    if (btnRun) {
        btnRun.disabled = true;
        btnRun.classList.remove('active');
    }
    if (resultsList) {
        resultsList.innerHTML = '';
        resultsList.classList.add('hidden');
    }
}

function getRequiredCalculationSelections() {
    const hospitalClassEl = document.querySelector('input[name="hospital_class"]:checked');
    const treatmentTypeEl = document.querySelector('input[name="treatment_type"]:checked');
    const regionEl = document.getElementById('nonbenefit_region');

    return {
        hospitalClass: hospitalClassEl ? hospitalClassEl.value : '',
        treatmentType: treatmentTypeEl ? treatmentTypeEl.value : '',
        nonBenefitRegion: regionEl ? regionEl.value : ''
    };
}

function isCalculationReady() {
    const selections = getRequiredCalculationSelections();
    return Boolean(selections.hospitalClass && selections.treatmentType && selections.nonBenefitRegion);
}

function getMissingCalculationLabels() {
    const selections = getRequiredCalculationSelections();
    const missing = [];

    if (!selections.hospitalClass) missing.push('병원 등급');
    if (!selections.treatmentType) missing.push('진료 형태');
    if (!selections.nonBenefitRegion) missing.push('비급여 기준 지역');

    return missing;
}

function updateResultButtonState() {
    const btn = document.getElementById('btn-show-result');
    const message = document.getElementById('result-ready-message');
    const ready = isCalculationReady();

    if (btn) {
        btn.classList.toggle('needs-selection', !ready);
    }
    if (!message) return;

    if (ready) {
        message.classList.remove('warning');
        message.innerText = resultRequested
            ? '선택 조건 기준으로 결과를 계산했습니다. 조건을 바꾸면 결과가 바로 반영됩니다.'
            : '필수 조건이 모두 선택되었습니다. 조건 선택에서 추가 항목을 확인하세요.';
    } else {
        message.classList.add('warning');
        message.innerText = `${getMissingCalculationLabels().join(', ')} 선택 후 결과를 조회할 수 있습니다.`;
    }
}

function resetResultView() {
    const finalCostEl = document.getElementById('display_final_cost');
    const totalCostEl = document.getElementById('display_total_cost');
    const gasanCostEl = document.getElementById('display_gasan_cost');
    const gasanLabelEl = document.getElementById('display_gasan_label');
    const refundCostEl = document.getElementById('display_refund_cost');
    const rangeEl = document.getElementById('display_cost_range');
    const tableBody = document.getElementById('cost-table-body');
    const comparisonBody = document.getElementById('comparison-table-body');
    const insuranceBox = document.getElementById('result_insurance_box');
    const drgNotice = document.getElementById('drg-notice');
    const sanjeongNotice = document.getElementById('sanjeong-notice');
    const insights = document.getElementById('result-insights');
    const insightsSummary = document.getElementById('result-insights-summary');
    const insightDrivers = document.getElementById('result-insights-drivers');

    if (finalCostEl) finalCostEl.innerText = '0';
    if (totalCostEl) totalCostEl.innerText = '0';
    if (gasanCostEl) gasanCostEl.innerText = '0';
    if (gasanLabelEl) gasanLabelEl.innerText = '병원 등급별 가산율이 급여 항목에 자동 반영됩니다.';
    if (refundCostEl) refundCostEl.innerText = '0';
    if (rangeEl) rangeEl.innerText = '0원 ~ 0원';
    if (tableBody) tableBody.innerHTML = '<tr><td colspan="3" class="empty-row">필수 조건을 선택하면 세부 산출 내역이 표시됩니다.</td></tr>';
    if (comparisonBody) comparisonBody.innerHTML = '<tr><td colspan="3" class="empty-row">필수 조건을 선택하면 병원 규모별 예상 금액을 확인할 수 있습니다.</td></tr>';
    if (insuranceBox) insuranceBox.classList.add('hidden');
    if (drgNotice) drgNotice.classList.add('hidden');
    if (sanjeongNotice) sanjeongNotice.classList.add('hidden');
    if (insights) insights.hidden = true;
    if (insightsSummary) insightsSummary.textContent = '';
    if (insightDrivers) insightDrivers.replaceChildren();
}

function renderResultInsights(breakdown, patientTotalPay, options) {
    const section = document.getElementById('result-insights');
    const summary = document.getElementById('result-insights-summary');
    const drivers = document.getElementById('result-insights-drivers');
    if (!section || !summary || !drivers) return;

    const region = document.getElementById('nonbenefit_region');
    const regionLabel = region?.selectedOptions?.[0]?.textContent?.trim() || '선택 지역';
    const sources = [regionLabel + ' 비급여 공개자료 기준을 우선 반영했습니다.'];
    if (options.diseaseStats && !options.hasSpecificSelectedItems) sources.push('상병코드 평균 진료비를 함께 반영했습니다.');
    if (options.hasInsurance) sources.push('실손보험 예상 환급금을 최종 부담금에 반영했습니다.');
    else sources.push('실손보험은 반영하지 않았습니다.');
    summary.textContent = '실비 환급 전 ' + formatNumber(patientTotalPay) + '원 기준입니다. ' + sources.join(' ');

    const topDrivers = breakdown
        .filter(item => item.type !== 'gasan')
        .slice()
        .sort((a, b) => b.price - a.price)
        .slice(0, 3);
    drivers.replaceChildren(...topDrivers.map(item => {
        const row = document.createElement('li');
        const label = document.createElement('span');
        const price = document.createElement('strong');
        label.textContent = item.name;
        price.textContent = formatNumber(item.price) + '원';
        row.append(label, price);
        return row;
    }));
    section.hidden = false;
}

function resetCalculatorState() {
    const form = document.getElementById('calculator-form');
    form?.reset();
    addedTests = [];
    addedSurgeries = [];
    addedProcedures = [];
    pendingSurgeryItem = null;
    testIdCounter = 0;
    surgeryIdCounter = 0;
    procedureIdCounter = 0;
    anesthesiaSessionCounter = 0;
    resultRequested = false;
    etcAccordionOpen = false;
    const anesthesiaDialog = document.getElementById('anesthesia-dialog');
    if (anesthesiaDialog?.open) anesthesiaDialog.close();

    const region = document.getElementById('nonbenefit_region');
    if (region) region.value = getStoredNonBenefitRegion() || '';
    const stayDays = document.getElementById('stay_days');
    if (stayDays) stayDays.value = '1';
    ['hospitalization_details', 'emergency_details', 'sanjeong_details', 'disease_code_details', 'insurance_details', 'etc-accordion-body']
        .forEach(id => document.getElementById(id)?.classList.add('hidden'));
    document.querySelectorAll('.search-input').forEach(input => { input.value = ''; });
    document.querySelectorAll('.search-results-list').forEach(results => {
        results.replaceChildren();
        results.classList.add('hidden');
    });
    document.getElementById('advanced-items-panel').hidden = true;
    const advancedToggle = document.getElementById('advanced-items-toggle');
    if (advancedToggle) {
        advancedToggle.setAttribute('aria-expanded', 'false');
        advancedToggle.textContent = '고급 항목 열기';
    }
    renderAddedItems();
    updateEtcAddedBadge();
    resetResultView();
    document.dispatchEvent(new Event('medicost:items-changed'));
}

function prepareBasicCalculation() {
    addedTests = [];
    addedSurgeries = [];
    addedProcedures = [];
    pendingSurgeryItem = null;
    ['has_sanjeong', 'has_disease_code', 'has_insurance'].forEach(id => {
        const input = document.getElementById(id);
        if (input) input.checked = false;
    });
    const diseaseInput = document.getElementById('disease_code_input');
    if (diseaseInput) diseaseInput.value = '';
    ['sanjeong_details', 'disease_code_details', 'insurance_details'].forEach(id => {
        document.getElementById(id)?.classList.add('hidden');
    });
    document.querySelectorAll('.search-results-list').forEach(results => {
        results.replaceChildren();
        results.classList.add('hidden');
    });
    renderAddedItems();
    updateEtcAddedBadge();
    markResultStale();
    document.dispatchEvent(new Event('medicost:items-changed'));
}

function markResultStale() {
    resultRequested = false;
    resetResultView();
    updateResultButtonState();
}

function handleCalculatorInputChange(event) {
    if (resultRequested && ['has_insurance', 'insurance_generation'].includes(event?.target?.id)) return;
    markResultStale();
}

function requestCalculation() {
    updateResultButtonState();
    if (!isCalculationReady()) {
        const missingLabels = getMissingCalculationLabels();
        const message = `${missingLabels.join(', ')}을(를) 선택해야 결과를 조회할 수 있습니다.`;
        const messageEl = document.getElementById('result-ready-message');
        if (messageEl) {
            messageEl.classList.add('warning');
            messageEl.innerText = message;
        }
        const firstMissing = !document.querySelector('input[name="hospital_class"]:checked')
            ? document.querySelector('input[name="hospital_class"]')
            : !document.querySelector('input[name="treatment_type"]:checked')
                ? document.querySelector('input[name="treatment_type"]')
                : document.getElementById('nonbenefit_region');
        firstMissing?.focus();
        return;
    }

    resultRequested = true;
    calculate();
}

/**
 * 탭 또는 기타 처치 영역의 직접 선택 셀렉트 박스 옵션 동적 렌더링 함수
 * @param {string} target - 대상 구분 ('category': 대분류 탭, 'etc': 기타 처치)
 * @param {string} groupOrTab - 매핑될 그룹 코드 ('test', 'procedure_hira', 'surgery', 'etc')
 */
function renderDirectSelectOptions(target, groupOrTab) {
    const selectEl = target === 'category' 
        ? document.getElementById('category-direct-select')
        : document.getElementById('etc-direct-select');
        
    if (!selectEl) return;
    
    selectEl.innerHTML = '';
    
    // 기본 플레이스홀더 성격의 비활성 옵션 추가
    const defaultOpt = document.createElement('option');
    defaultOpt.value = '';
    defaultOpt.text = target === 'category' ? '-- 추가할 항목 직접 선택 --' : '-- 기타 처치/주사/마취 직접 선택 --';
    defaultOpt.disabled = true;
    defaultOpt.selected = true;
    selectEl.appendChild(defaultOpt);
    
    // HIRA_DATABASE의 전체 수가 항목 중 해당 그룹에 매핑되는 항목 필터링
    const filtered = getMedicalItemDatabase().filter(item => getItemTypeGroup(item) === groupOrTab && !isEmergencyManagementItem(item));
    
    // 항목 명칭 기준 가나다 사전 순 정렬
    filtered.sort((a, b) => a.name.localeCompare(b.name, 'ko-KR'));
    
    // 옵션 추가
    filtered.forEach(item => {
        const opt = document.createElement('option');
        opt.value = item.code;
        const benefitText = item.isBenefit ? '급여' : '비급여';
        opt.text = `[${benefitText}] ${item.name} (${formatNumber(item.price)}원)`;
        selectEl.appendChild(opt);
    });
}

/**
 * 직접선택 드롭다운 변경 감지 핸들러
 * @param {string} selectType - 변경이 감지된 셀렉트박스 구분 ('category' / 'etc')
 */
function handleDirectSelectChange(selectType) {
    const selectEl = selectType === 'category' 
        ? document.getElementById('category-direct-select')
        : document.getElementById('etc-direct-select');
        
    if (!selectEl || selectEl.value === '') return;
    
    const selectedCode = selectEl.value;
    // 선택된 수가 항목 DB에서 검색 후 추가
    const matchedItem = getMedicalItemDatabase().find(item => item.code === selectedCode);
    
    if (matchedItem) {
        addHiraItem(matchedItem);
    }
    
    // 선택 완료 후 다시 플레이스홀더 기본 옵션으로 리셋
    selectEl.value = '';
}

/**
 * 활성 탭 카테고리에 상응하는 대표 인기 검색어 칩 목록 생성
 * @param {string} tabId - 활성화된 탭 아이디
 */
function renderRecommendChips(tabId) {
    const chipsListEl = document.getElementById('recommend-chips-list');
    if (!chipsListEl) return;
    
    chipsListEl.innerHTML = '';
    
    let keywords = [];
    if (tabId === 'test') {
        keywords = ['허리 MRI', '뇌 CT', '수면 위내시경', '복부 초음파', '심전도'];
    } else if (tabId === 'procedure_hira') {
        keywords = ['스케일링', '임플란트', '스텐트 시술', '쇄석술', '폐렴 입원'];
    } else if (tabId === 'surgery') {
        keywords = ['맹장 수술', '무릎 관절경', '허리디스크 수술', '백내장 수술', '제왕절개'];
    }
    
    keywords.forEach(kw => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'search-chip';
        btn.innerText = kw;
        btn.setAttribute('onclick', `searchByChip('${kw}')`);
        chipsListEl.appendChild(btn);
    });
}

/** 
 * 기타 처치, 주사, 마취 등 아코디언 토글 제어 
 */
function toggleEtcAccordion() {
    const trigger = document.querySelector('.etc-accordion-trigger');
    const body = document.getElementById('etc-accordion-body');
    
    etcAccordionOpen = !etcAccordionOpen;
    if (etcAccordionOpen) {
        body.classList.remove('hidden');
        trigger.classList.add('active');
    } else {
        body.classList.add('hidden');
        trigger.classList.remove('active');
    }
}

/**
 * 추가된 리스트 내에서 기타(etc) 탭에 해당하는 항목이 총 몇 개인지 파악해 배지를 갱신합니다.
 */
function updateEtcAddedBadge() {
    const badgeEl = document.getElementById('etc-added-badge');
    if (!badgeEl) return;
    
    let etcCount = 0;
    
    // addedTests에서 기타 항목 카운트
    addedTests.forEach(item => {
        const dbItem = getMedicalItemDatabase().find(db => db.code === item.type);
        if (dbItem && getItemTypeGroup(dbItem) === 'etc') etcCount += item.count;
    });
    
    // addedSurgeries에서 기타 항목 카운트
    addedSurgeries.forEach(item => {
        const dbItem = getMedicalItemDatabase().find(db => db.code === item.type);
        if (dbItem && getItemTypeGroup(dbItem) === 'etc') etcCount++;
    });
    
    // addedProcedures에서 기타 항목 카운트
    addedProcedures.forEach(item => {
        const dbItem = getMedicalItemDatabase().find(db => db.code === item.type);
        if (dbItem && getItemTypeGroup(dbItem) === 'etc') etcCount += item.count;
    });
    
    if (etcCount > 0) {
        badgeEl.innerText = `${etcCount}개 추가됨`;
        badgeEl.style.display = 'inline-block';
    } else {
        badgeEl.style.display = 'none';
    }
}

/** 진료 형태 변경 시 입원 세부 필드 토글 */
function toggleTreatmentDetails() {
    const treatmentTypeEl = document.querySelector('input[name="treatment_type"]:checked');
    const treatmentType = treatmentTypeEl ? treatmentTypeEl.value : '';
    const hospitalizationSection = document.getElementById('hospitalization_details');
    const emergencySection = document.getElementById('emergency_details');
    if (treatmentType === 'inpatient') {
        hospitalizationSection.classList.remove('hidden');
    } else {
        hospitalizationSection.classList.add('hidden');
    }

    if (treatmentType === 'er') {
        emergencySection.classList.remove('hidden');
    } else {
        emergencySection.classList.add('hidden');
    }
    calculate();
}

/** 실비보험 환급 토글 */
function toggleInsuranceSection() {
    const hasInsurance = document.getElementById('has_insurance').checked;
    const detailsSection = document.getElementById('insurance_details');
    const resultBox = document.getElementById('result_insurance_box');
    if (hasInsurance) {
        detailsSection.classList.remove('hidden');
        resultBox.classList.remove('hidden');
    } else {
        detailsSection.classList.add('hidden');
        resultBox.classList.add('hidden');
    }
    calculate();
}

/** 산정특례 토글 */
function toggleSanjeongSpecial() {
    const hasSanjeong = document.getElementById('has_sanjeong').checked;
    const detailsSection = document.getElementById('sanjeong_details');
    if (hasSanjeong) {
        detailsSection.classList.remove('hidden');
    } else {
        detailsSection.classList.add('hidden');
    }
    calculate();
}

/** 입원 일수 조절 버튼 */
function adjustDays(amount) {
    const input = document.getElementById('stay_days');
    if (!input) return;
    let val = parseInt(input.value, 10) || 1;
    val = Math.max(1, Math.min(90, val + amount));
    input.value = val;
    calculate();
}

/** 영수증 상세 명세서 아코디언 토글 */
function toggleAccordion() {
    const trigger = document.querySelector('.accordion-trigger');
    const content = document.getElementById('accordion-content');
    const icon = document.getElementById('accordion-icon');
    
    if (content.classList.contains('hidden')) {
        content.classList.remove('hidden');
        trigger.classList.add('active');
        if (icon) icon.style.transform = 'rotate(180deg)';
    } else {
        content.classList.add('hidden');
        trigger.classList.remove('active');
        if (icon) icon.style.transform = 'rotate(0deg)';
    }
}

/** 금액 포맷 (1,000 단위 쉼표 추가) */
function formatNumber(num) {
    return Math.round(num).toLocaleString('ko-KR');
}

/** 선택된 산정특례 유형의 급여 본인부담률 정보 */
function getSanjeongSpecialInfo() {
    const hasSanjeong = document.getElementById('has_sanjeong').checked;
    if (!hasSanjeong) return null;

    const selectedType = document.getElementById('sanjeong_disease').value || 'cancer';
    return DB.SANJEONG_SPECIAL_RATES[selectedType] || DB.SANJEONG_SPECIAL_RATES.cancer;
}

function isEmergencyManagementItem(item) {
    return item && item.code && item.code.startsWith('ER_');
}

function getEmergencySeverityInfo() {
    const severity = document.getElementById('er_severity').value || 'mild';
    const code = EMERGENCY_SEVERITY_CODE_MAP[severity] || EMERGENCY_SEVERITY_CODE_MAP.mild;
    const item = getMedicalItemDatabase().find(dbItem => dbItem.code === code);
    return item || { code, name: '응급실 경증 진료 (응급의료 관리료 경증 환자)', price: 20000, isBenefit: true };
}

let ALL_KCD_DATABASE = [];

async function loadKcdDatabase() {
    try {
        const res = await fetch('/assets/data/kcd_codes.json');
        if (res.ok) {
            ALL_KCD_DATABASE = await res.json();
        } else {
            console.warn(`KCD 데이터베이스 로드 실패 (HTTP status: ${res.status}), 기본 축소 DB 사용`);
        }
    } catch (error) {
        console.error("KCD 데이터베이스 로드 중 오류 발생, 기본 축소 DB 사용", error);
    }
}

async function initializeDataSources() {
    loadStaticNonBenefitData();

    if (typeof fetch === 'function') {
        const promises = [];
        if (isHttpRuntime()) {
            promises.push(loadBackendNonBenefitData());
        }
        promises.push(loadKcdDatabase());
        await Promise.all(promises);
    }

    renderDataSourceStatus();
}

function loadStaticNonBenefitData() {
    if (typeof window === 'undefined') return;
    if (!window.NONBENEFIT_REGION_PRICES || !window.NONBENEFIT_CODE_MAP) return;
    if (!window.NONBENEFIT_REGION_PRICES.items) return;

    nonBenefitDataState.prices = window.NONBENEFIT_REGION_PRICES;
    nonBenefitDataState.codeMap = window.NONBENEFIT_CODE_MAP;
    nonBenefitDataState.sourceType = 'static';
    nonBenefitDataState.statusText = `정적 공개자료 사용 중 (${window.NONBENEFIT_REGION_PRICES.fetchedAt || '수집일 미상'} 기준)`;
}

async function loadBackendNonBenefitData() {
    const baseUrl = DATA_SOURCE_CONFIG.apiBaseUrl.replace(/\/$/, '');
    const pricesUrl = `${baseUrl}${DATA_SOURCE_CONFIG.nonBenefitRegionPricesPath}`;
    const codeMapUrl = `${baseUrl}${DATA_SOURCE_CONFIG.nonBenefitCodeMapPath}`;

    try {
        const [pricesResponse, codeMapResponse] = await Promise.all([
            fetch(pricesUrl, { cache: 'no-store' }),
            fetch(codeMapUrl, { cache: 'no-store' })
        ]);

        if (!pricesResponse.ok || !codeMapResponse.ok) return;

        const [prices, codeMap] = await Promise.all([
            pricesResponse.json(),
            codeMapResponse.json()
        ]);

        if (!prices || !prices.items || !codeMap) return;

        nonBenefitDataState.prices = prices;
        nonBenefitDataState.codeMap = codeMap;
        nonBenefitDataState.sourceType = 'backend';
        nonBenefitDataState.statusText = `백엔드 최신자료 사용 중 (${prices.fetchedAt || '갱신일 미상'} 기준)`;
    } catch (error) {
        // 백엔드가 아직 없거나 일시 실패해도 정적 자료로 계산을 계속한다.
    }
}

function isHttpRuntime() {
    if (typeof window === 'undefined') return false;
    return window.location.protocol === 'http:' || window.location.protocol === 'https:';
}

function renderDataSourceStatus() {
    const statusEl = document.getElementById('data-source-status');
    if (!statusEl) return;
    statusEl.textContent = nonBenefitDataState.statusText || '비급여 데이터 준비 중';
}

function getNonBenefitRegionData() {
    if (!nonBenefitDataState.prices || !nonBenefitDataState.codeMap) return null;
    if (!nonBenefitDataState.prices.items) return null;
    return {
        prices: nonBenefitDataState.prices,
        codeMap: nonBenefitDataState.codeMap,
        sourceType: nonBenefitDataState.sourceType
    };
}

function collectExternalNonBenefitRegions() {
    const externalData = getNonBenefitRegionData();
    if (!externalData) return {};

    return Object.values(externalData.prices.items).reduce((regions, publicItem) => {
        Object.entries(publicItem.regions || {}).forEach(([code, region]) => {
            if (!regions[code]) regions[code] = { name: region.name || code };
        });
        return regions;
    }, {});
}

function populateNonBenefitRegions() {
    const regionEl = document.getElementById('nonbenefit_region');
    if (!regionEl) return;

    const externalRegions = collectExternalNonBenefitRegions();
    const hasExternalRegions = Object.keys(externalRegions).length > 0;
    const regions = hasExternalRegions ? externalRegions : DB.NON_BENEFIT_PUBLIC_PRICE_DATA.regions;
    const regionEntries = Object.entries(regions).sort(([a], [b]) => a.localeCompare(b, 'ko'));

    const options = ['<option value="" selected>-- 비급여 가격 기준 지역 선택 --</option>'];
    options.push(...regionEntries.map(([code, region]) => {
        return `<option value="${code}">${region.name}</option>`;
    }));
    regionEl.innerHTML = options.join('');

    regionEl.addEventListener('change', () => {
        setStoredNonBenefitRegion(regionEl.value);
    });
}

function getStoredNonBenefitRegion() {
    try {
        return localStorage.getItem('nonbenefit_region');
    } catch (error) {
        return null;
    }
}

function setStoredNonBenefitRegion(regionCode) {
    try {
        localStorage.setItem('nonbenefit_region', regionCode);
    } catch (error) {
        // 로컬 파일 실행 환경에서 저장소가 막혀도 계산은 계속 진행한다.
    }
}

function getSelectedNonBenefitRegion() {
    const externalRegions = collectExternalNonBenefitRegions();
    const hasExternalRegions = Object.keys(externalRegions).length > 0;
    const regions = hasExternalRegions ? externalRegions : DB.NON_BENEFIT_PUBLIC_PRICE_DATA.regions;
    const defaultRegion = hasExternalRegions && regions['11'] ? '11' : DB.NON_BENEFIT_PUBLIC_PRICE_DATA.defaultRegion;
    const regionEl = document.getElementById('nonbenefit_region');
    const selected = regionEl ? regionEl.value : defaultRegion;
    return regions[selected] ? selected : defaultRegion;
}

function getExternalPublicNonBenefitPriceInfo(item) {
    const externalData = getNonBenefitRegionData();
    if (!externalData) return null;

    const mapping = externalData.codeMap[item.type];
    if (!mapping || !mapping.publicCode) return null;

    const publicItem = externalData.prices.items[mapping.publicCode];
    if (!publicItem) return null;

    const selectedRegion = getSelectedNonBenefitRegion();
    const regions = publicItem.regions || {};
    const regionPrice = regions[selectedRegion];
    if (!regionPrice) return null;

    const metric = Number.isFinite(regionPrice.median) ? 'median' : (Number.isFinite(regionPrice.avg) ? 'avg' : null);
    if (!metric) return null;

    return {
        price: regionPrice[metric],
        min: regionPrice.min,
        max: regionPrice.max,
        avg: regionPrice.avg,
        median: regionPrice.median,
        metric,
        metricLabel: metric === 'median' ? '중앙값' : '평균값',
        regionName: regionPrice.name || selectedRegion,
        nhisCode: mapping.publicCode,
        nhisName: mapping.publicName || publicItem.name,
        effectiveFrom: publicItem.effectiveFrom,
        reference: `${externalData.prices.source || '비급여 공개자료'} (${externalData.prices.fetchedAt || '수집일 미상'} 수집)`
    };
}

function getFallbackPublicNonBenefitPriceInfo(item) {
    const publicItem = DB.NON_BENEFIT_PUBLIC_PRICE_DATA.items[item.type];
    if (!publicItem) return null;

    const selectedRegion = getSelectedNonBenefitRegion();
    const regionPrice = publicItem.regionPrices[selectedRegion] || publicItem.regionPrices[DB.NON_BENEFIT_PUBLIC_PRICE_DATA.defaultRegion];
    if (!regionPrice || !regionPrice.median) return null;

    const fallbackRegion = DB.NON_BENEFIT_PUBLIC_PRICE_DATA.regions[selectedRegion] || DB.NON_BENEFIT_PUBLIC_PRICE_DATA.regions[DB.NON_BENEFIT_PUBLIC_PRICE_DATA.defaultRegion];
    return {
        price: regionPrice.median,
        min: regionPrice.min,
        metric: 'median',
        metricLabel: '중앙값',
        regionName: fallbackRegion.name,
        nhisCode: publicItem.nhisCode,
        nhisName: publicItem.nhisName,
        reference: DB.NON_BENEFIT_PUBLIC_PRICE_DATA.reference
    };
}

function getPublicNonBenefitPriceInfo(item) {
    if (!item || item.isBenefit) return null;
    return getExternalPublicNonBenefitPriceInfo(item) || getFallbackPublicNonBenefitPriceInfo(item);
}

function getNonBenefitBasePrice(item) {
    const publicPriceInfo = getPublicNonBenefitPriceInfo(item);
    if (!publicPriceInfo) {
        return {
            price: item.basePrice,
            labelSuffix: "",
            publicPriceInfo: null
        };
    }

    return {
        price: publicPriceInfo.price,
        labelSuffix: ` [${publicPriceInfo.regionName} 기준 공개 ${publicPriceInfo.metricLabel} · ${publicPriceInfo.nhisCode}]`,
        publicPriceInfo
    };
}


// =========================================================
// 5. 오타 보정 및 한글 초성 실시간 검색 엔진
// =========================================================

/**
 * 한글 음절 및 단독 자모를 2벌식 키보드 기준 영어 알파벳 글쇠 나열 문자열로 변환합니다.
 * 이를 통해 "허리 mri" -> "gjfl mri", "ㅅ 네ㅑㅜㄷ" -> "t spine" 과 같은 한영 자판 매칭이 완벽히 가능해집니다.
 */
function convertToEnglishKeys(text) {
    if (!text) return '';
    
    const choKeys = ['r', 'R', 's', 'e', 'E', 'f', 'a', 'q', 'Q', 't', 'T', 'd', 'w', 'W', 'c', 'z', 'x', 'v', 'g'];
    const jungKeys = ['k', 'o', 'i', 'O', 'j', 'p', 'u', 'P', 'h', 'hk', 'ho', 'hl', 'y', 'n', 'nj', 'np', 'nl', 'm', 'ml', 'l'];
    const jongKeys = ['', 'r', 'R', 'rt', 's', 'sw', 'sg', 'e', 'f', 'fr', 'fa', 'fq', 'ft', 'fx', 'fv', 'fg', 'a', 'q', 'qt', 't', 'T', 'd', 'w', 'c', 'z', 'x', 'v', 'g'];
    
    let result = '';
    
    for (let i = 0; i < text.length; i++) {
        const code = text.charCodeAt(i);
        
        // 1. 일반 한글 음절 분리 처리 (가 ~ 힣)
        if (code >= 0xAC00 && code <= 0xD7A3) {
            const originCode = code - 0xAC00;
            const cho = Math.floor(originCode / 588);
            const jung = Math.floor((originCode % 588) / 28);
            const jong = originCode % 28;
            
            result += choKeys[cho] + jungKeys[jung] + jongKeys[jong];
        } 
        // 2. 단독 한글 자모 자판 매핑 처리 (호환 자모 영역)
        else if (code >= 0x3130 && code <= 0x318F) {
            const char = text.charAt(i);
            const singleJaMoMap = {
                'ㄱ':'r', 'ㄲ':'R', 'ㄳ':'rt', 'ㄴ':'s', 'ㄵ':'sw', 'ㄶ':'sg', 'ㄷ':'e', 'ㄸ':'E', 'ㄹ':'f', 'ㄺ':'fr', 
                'ㄻ':'fa', 'ㄼ':'fq', 'ㄽ':'ft', 'ㄾ':'fx', 'ㄿ':'fv', 'ㅀ':'fg', 'ㅁ':'a', 'ㅂ':'q', 'ㅃ':'Q', 'ㅄ':'qt', 
                'ㅅ':'t', 'ㅆ':'T', 'ㅇ':'d', 'ㅈ':'w', 'ㅉ':'W', 'ㅊ':'c', 'ㅋ':'z', 'ㅌ':'x', 'ㅍ':'v', 'ㅎ':'g',
                'ㅏ':'k', 'ㅐ':'o', 'ㅑ':'i', 'ㅒ':'O', 'ㅓ':'j', 'ㅔ':'p', 'ㅕ':'u', 'ㅖ':'P', 'ㅗ':'h', 'ㅘ':'hk', 
                'ㅙ':'ho', 'ㅚ':'hl', 'ㅛ':'y', 'ㅜ':'n', 'ㅝ':'nj', 'ㅞ':'np', 'ㅟ':'nl', 'ㅡ':'m', 'ㅢ':'ml', 'ㅣ':'l'
            };
            result += singleJaMoMap[char] || char;
        } 
        // 3. 영문, 기호 등은 소문자로 변환하여 일치시킴
        else {
            result += text.charAt(i).toLowerCase();
        }
    }
    
    return result;
}

function normalizeSearchText(text) {
    const matches = String(text || '')
        .toLowerCase()
        .match(/[0-9A-Za-z\u3131-\u318E\uAC00-\uD7A3]+/g);
    return matches ? matches.join('').replace(/-/g, '') : '';
}

/** 한글 텍스트에서 초성만 추출합니다. (초성 검색 지원용) */
function getChosung(text) {
    const choList = ['ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
    let result = '';
    for (let i = 0; i < text.length; i++) {
        const code = text.charCodeAt(i);
        if (code >= 0xAC00 && code <= 0xD7A3) {
            const choIndex = Math.floor((code - 0xAC00) / 588);
            result += choList[choIndex];
        } else if (code >= 0x3131 && code <= 0x314E) {
            result += text.charAt(i);
        } else {
            result += text.charAt(i).toLowerCase();
        }
    }
    return result;
}

/** 입력 검색어가 한글 초성으로만 이루어져 있는지 판별합니다. */
function isChosungOnly(text) {
    const chosungRegex = /^[ㄱ-ㅎ\s]+$/;
    return chosungRegex.test(text);
}

/**
 * 검색 쿼리어가 대상 항목의 명칭이나 키워드와 매칭되는지 다각도로 비교합니다.
 * (한글 초성 매칭, 한영 키보드 오타 교정, 띄어쓰기 생략 검색 완벽 보장)
 */
function isMatch(query, item) {
    const cleanQuery = normalizeSearchText(query);
    if (!cleanQuery) return false;

    // 매칭 대상: 공식 명칭, 카테고리 태그명, DB 지정 일상어 keywords 목록
    const targets = [item.name, item.category, ...(item.keywords || [])];
    
    // 1단계: 초성 자음만 입력했을 시 초성 일치 대조
    if (isChosungOnly(cleanQuery)) {
        for (const target of targets) {
            const cleanTarget = normalizeSearchText(target);
            const chosungTarget = getChosung(cleanTarget);
            if (chosungTarget.includes(cleanQuery)) return true;
        }
    }
    
    // 2단계: 양방향 영어 자판 키 코드 일치 대조 (한영 변환 오타 방지 핵심)
    const englishQuery = convertToEnglishKeys(cleanQuery);
    for (const target of targets) {
        const cleanTarget = normalizeSearchText(target);
        const englishTarget = convertToEnglishKeys(cleanTarget);
        if (englishTarget.includes(englishQuery) || cleanTarget.includes(cleanQuery)) return true;
    }
    
    return false;
}

/** 통합 검색창 이벤트 처리 초기화 및 리스너 등록 */
function initSearchEvents() {
    // A. 대분류 탭 검색창 리스너 바인딩
    const categorySearchInput = document.getElementById('category-search-input');
    const categoryResultsList = document.getElementById('category-search-results');
    const btnClearCategory = document.getElementById('btn-clear-category-search');
    const btnRunCategory = document.getElementById('btn-run-category-search');
    
    if (categorySearchInput && categoryResultsList) {
        categorySearchInput.addEventListener('input', (e) => {
            const query = e.target.value.trim();
            updateSearchControlState(categorySearchInput, btnClearCategory, btnRunCategory);
            categoryResultsList.innerHTML = '';
            categoryResultsList.classList.add('hidden');
        });

        categorySearchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                executeSearchFromInput(categorySearchInput, activeTab);
            }
        });
        
        if (btnClearCategory) {
            btnClearCategory.addEventListener('click', (e) => {
                e.stopPropagation();
                categorySearchInput.value = '';
                updateSearchControlState(categorySearchInput, btnClearCategory, btnRunCategory);
                categoryResultsList.innerHTML = '';
                categoryResultsList.classList.add('hidden');
                categorySearchInput.focus();
            });
        }

        if (btnRunCategory) {
            btnRunCategory.addEventListener('click', (e) => {
                e.stopPropagation();
                executeSearchFromInput(categorySearchInput, activeTab);
            });
        }
        
    }

    // B. 기타 처치 검색창 리스너 바인딩
    const etcSearchInput = document.getElementById('etc-search-input');
    const etcResultsList = document.getElementById('etc-search-results');
    const btnClearEtc = document.getElementById('btn-clear-etc-search');
    const btnRunEtc = document.getElementById('btn-run-etc-search');
    
    if (etcSearchInput && etcResultsList) {
        etcSearchInput.addEventListener('input', (e) => {
            const query = e.target.value.trim();
            updateSearchControlState(etcSearchInput, btnClearEtc, btnRunEtc);
            etcResultsList.innerHTML = '';
            etcResultsList.classList.add('hidden');
        });

        etcSearchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                executeSearchFromInput(etcSearchInput, 'etc');
            }
        });
        
        if (btnClearEtc) {
            btnClearEtc.addEventListener('click', (e) => {
                e.stopPropagation();
                etcSearchInput.value = '';
                updateSearchControlState(etcSearchInput, btnClearEtc, btnRunEtc);
                etcResultsList.innerHTML = '';
                etcResultsList.classList.add('hidden');
                etcSearchInput.focus();
            });
        }

        if (btnRunEtc) {
            btnRunEtc.addEventListener('click', (e) => {
                e.stopPropagation();
                executeSearchFromInput(etcSearchInput, 'etc');
            });
        }
        
    }
    
    // C. 드롭다운 바깥 영역 클릭 시 검색창 드롭다운 레이어 닫기
    document.addEventListener('click', (e) => {
        if (categorySearchInput && categoryResultsList && !categorySearchInput.contains(e.target) && !categoryResultsList.contains(e.target)) {
            categorySearchInput.blur();
        }
        if (etcSearchInput && etcResultsList && !etcSearchInput.contains(e.target) && !etcResultsList.contains(e.target)) {
            etcSearchInput.blur();
        }
    });
}

function updateSearchControlState(searchInput, clearButton, runButton) {
    const hasQuery = Boolean(searchInput && searchInput.value.trim().length > 0);

    if (clearButton) {
        clearButton.classList.toggle('hidden', !hasQuery);
    }

    if (runButton) {
        runButton.disabled = !hasQuery;
        runButton.classList.toggle('active', hasQuery);
    }
}

function executeSearchFromInput(searchInput, targetGroup) {
    if (!searchInput) return;

    const query = searchInput.value.trim();
    if (!query) {
        searchInput.focus();
        return;
    }

    performSearch(query, targetGroup, { logSearch: true });
    searchInput.focus();
    const textLength = searchInput.value.length;
    searchInput.setSelectionRange(textLength, textLength);
}

function hasAnalyticsConsent() {
    if (typeof window === 'undefined' || !window.MEDICostConsent) return false;
    return window.MEDICostConsent.canLoadAnalytics(window.MEDICostConsent.readConsent());
}

function hasEnhancedFeatureConsent() {
    if (typeof window === 'undefined' || !window.MEDICostConsent) return false;
    return window.MEDICostConsent.canUseEnhancedFeatures(window.MEDICostConsent.readConsent());
}

const pendingSearchLogs = new Map();

async function sendSearchLog(query, resultCount) {
    if (!hasEnhancedFeatureConsent() || !query || query.trim().length < 2 || typeof fetch !== 'function') return;

    const telemetryKey = query.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('ko-KR');
    const pending = pendingSearchLogs.get(telemetryKey);
    if (pending) {
        pending.resultCount = Math.max(pending.resultCount, resultCount);
        return;
    }

    const payload = { query, resultCount };
    pendingSearchLogs.set(telemetryKey, payload);
    await new Promise(resolve => setTimeout(resolve, 0));
    pendingSearchLogs.delete(telemetryKey);

    try {
        await fetch('/api/search-log', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                query: payload.query,
                resultCount: payload.resultCount,
                operationalConsent: true
            }),
            keepalive: true
        });
    } catch (error) {
        // 검색 로그 저장 실패는 사용자 검색 흐름을 막지 않는다.
    }
}

function compactSelectedItems(items) {
    return items.map(item => ({
        code: item.type,
        name: item.typeName,
        category: item.categoryName || item.category,
        count: item.count || 1,
        basePrice: item.basePrice,
        isBenefit: item.isBenefit
    }));
}

async function sendCalculationLog(payload) {
    if (!hasAnalyticsConsent() || !payload || typeof fetch !== 'function') return;

    try {
        await fetch('/api/calculation-log', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                ...payload,
                operationalConsent: true,
                path: window.location.pathname
            }),
            keepalive: true
        });
    } catch (error) {
        // 계산 로그 저장 실패는 결과 표시를 막지 않는다.
    }
}

/** 
 * 검색 실행 후 결과 목록 렌더링
 * @param {string} query - 검색어
 * @param {string} targetGroup - 검색 대상 탭/분류 ('test', 'procedure_hira', 'surgery', 'etc')
 */
function performSearch(query, targetGroup, options = {}) {
    const resultsList = targetGroup === 'etc' 
        ? document.getElementById('etc-search-results')
        : document.getElementById('category-search-results');
        
    if (!resultsList) return;
    
    // 1단계: 전체 DB에서 문자열 매칭
    let matched = getMedicalItemDatabase().filter(item => isMatch(query, item) && !isEmergencyManagementItem(item));
    
    // 2단계: 타겟 그룹에 속하는지 탭 필터링
    matched = matched.filter(item => getItemTypeGroup(item) === targetGroup);

    if (options.logSearch) {
        sendSearchLog(query, matched.length);
    }
    
    resultsList.innerHTML = '';
    
    // 매칭 결과가 없을 때
    if (matched.length === 0) {
        const emptyDiv = document.createElement('div');
        emptyDiv.className = 'empty-search-results';
        emptyDiv.innerHTML = `
            <i data-lucide="search"></i>
            <p>'<strong>${query}</strong>'에 매칭되는 항목이 없습니다.</p>
            <span style="font-size:0.75rem; color:var(--text-muted);">부위나 오타를 확인하거나, 다른 대분류 탭을 선택해 보세요.</span>
        `;
        resultsList.appendChild(emptyDiv);
    } 
    // 매칭 결과가 있을 때 최대 15개 렌더링
    else {
        const limitResults = matched.slice(0, 15);
        limitResults.forEach(item => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'search-result-item';
            
            // 배지에 띄워줄 한글 카테고리 매핑
            const groupLabels = {
                test: '검사',
                procedure_hira: '시술',
                surgery: '수술',
                etc: '기타'
            };
            const itemGroup = getItemTypeGroup(item);
            
            const categoryBadge = `<span class="badge badge-benefit" style="padding: 0.15rem 0.35rem; font-size: 0.68rem; margin-right: 0.4rem;">${groupLabels[itemGroup] || itemGroup}</span>`;
            const benefitBadge = item.isBenefit 
                ? '<span class="badge badge-benefit" style="font-size: 0.65rem;">급여</span>' 
                : '<span class="badge badge-non-benefit" style="font-size: 0.65rem;">비급여</span>';
            const drgBadge = item.isDRG ? '<span class="badge badge-drg">DRG</span>' : '';
            
            const keywordSnippet = item.keywords ? item.keywords.slice(0, 4).join(', ') : '';
            
            btn.innerHTML = `
                <div class="search-result-info">
                    <span class="search-result-name">${categoryBadge}${item.name}${drgBadge}</span>
                    <span class="search-result-keywords">동의어: ${keywordSnippet}</span>
                </div>
                <div class="search-result-meta">
                    <span class="search-result-price">${formatNumber(item.price)}원</span>
                    ${benefitBadge}
                    <span class="btn-result-add"><i data-lucide="plus" style="width:12px; height:12px;"></i> 추가</span>
                </div>
            `;
            
            // 검색 결과 항목 선택(클릭) 이벤트
            btn.addEventListener('click', () => {
                addHiraItem(item);
                
                // 입력창 및 결과 목록 클리어
                const searchInput = targetGroup === 'etc' 
                    ? document.getElementById('etc-search-input')
                    : document.getElementById('category-search-input');
                    
                const btnClear = targetGroup === 'etc'
                    ? document.getElementById('btn-clear-etc-search')
                    : document.getElementById('btn-clear-category-search');

                const btnRun = targetGroup === 'etc'
                    ? document.getElementById('btn-run-etc-search')
                    : document.getElementById('btn-run-category-search');
                    
                if (searchInput) searchInput.value = '';
                if (searchInput) updateSearchControlState(searchInput, btnClear, btnRun);
                resultsList.innerHTML = '';
                resultsList.classList.add('hidden');
                if (searchInput) searchInput.focus();
            });
            
            resultsList.appendChild(btn);
        });
    }
    
    resultsList.classList.remove('hidden');
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

// =========================================================
// 10. Search UX final override
// =========================================================

const CONSUMER_SUB_LABELS = {
    test: {
        imaging: '영상검사',
        specimen: '혈액·소변·조직검사',
        endoscopy: '내시경검사',
        functional: '심장·호흡·신경 기능검사'
    },
    procedure_hira: {
        cardiovascular: '심장·혈관 시술',
        interventional: '영상의학·중재 시술',
        dental: '치과 시술',
        rehab_pain: '재활·통증 시술',
        general_proc: '일반 처치·시술'
    },
    surgery: {
        ortho: '정형외과 수술',
        neuro: '신경외과 수술',
        chest: '흉부·심장 수술',
        abdomen: '외과·소화기 수술',
        urology_ob: '비뇨의학과·산부인과 수술',
        eye_ent: '안과·이비인후과 수술'
    }
};

const CONSUMER_DETAIL_LABELS = {
    imaging: {
        xray: 'X-ray·일반촬영',
        ct: 'CT 촬영',
        mri: 'MRI 촬영',
        ultrasound: '초음파',
        angio: '조영·혈관촬영',
        special: '기타 영상검사'
    },
    specimen: {
        blood: '혈액검사',
        urine: '소변검사',
        chemistry: '간·신장·당뇨·지질검사',
        tumor: '암표지자·특수검사'
    },
    endoscopy: {
        gastro: '위내시경',
        colono: '대장내시경',
        broncho: '기관지내시경',
        etc: '기타 내시경'
    },
    functional: {
        cardio: '심전도·심장기능',
        respiratory: '폐기능',
        neuro: '뇌파·근전도·신경검사',
        sleep: '수면검사',
        sensory: '청력·시력·감각검사'
    }
};

function clearSelect(selectEl, placeholder) {
    if (!selectEl) return;
    selectEl.innerHTML = `<option value="" disabled selected>${placeholder}</option>`;
}

function resetScopedSearchUi() {
    activeTab = '';
    document.querySelectorAll('.category-tabs .tab-btn').forEach(btn => btn.classList.remove('active'));
    const mainSelect = document.getElementById('main-category-select');
    const subSelect = document.getElementById('sub-category-select');
    const detailSelect = document.getElementById('detail-item-select');
    const itemsList = document.getElementById('hierarchical-items-list');
    if (mainSelect) mainSelect.value = '';
    clearSelect(subSelect, '-- 중분류 선택 --');
    if (subSelect) subSelect.disabled = true;
    clearSelect(detailSelect, '-- 소분류 선택 --');
    if (detailSelect) detailSelect.disabled = true;
    if (itemsList) {
        itemsList.innerHTML = '';
        itemsList.classList.add('hidden');
    }
    renderRecommendChips('');
}

function switchTab(tabId) {
    activeTab = tabId;
    document.querySelectorAll('.category-tabs .tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-tab') === tabId);
    });

    const mainSelect = document.getElementById('main-category-select');
    if (mainSelect) mainSelect.value = tabId;

    updateSubCategoriesForTab(tabId);
    clearScopedSearchResults();
    renderRecommendChips(tabId);
}

function updateSubCategoriesForTab(tabId) {
    const subSelect = document.getElementById('sub-category-select');
    const detailSelect = document.getElementById('detail-item-select');
    const itemsList = document.getElementById('hierarchical-items-list');
    clearSelect(subSelect, '-- 중분류 선택 --');
    clearSelect(detailSelect, '-- 소분류 선택 --');
    if (!tabId || !CONSUMER_SUB_LABELS[tabId]) {
        if (subSelect) subSelect.disabled = true;
        if (detailSelect) detailSelect.disabled = true;
        return;
    }

    Object.entries(CONSUMER_SUB_LABELS[tabId]).forEach(([code, label]) => {
        const opt = document.createElement('option');
        opt.value = code;
        opt.textContent = label;
        subSelect.appendChild(opt);
    });
    subSelect.disabled = false;
    if (detailSelect) detailSelect.disabled = true;
    if (itemsList) {
        itemsList.innerHTML = '';
        itemsList.classList.add('hidden');
    }
}

function handleMainCategoryChange() {
    const mainSelect = document.getElementById('main-category-select');
    if (!mainSelect || !mainSelect.value) {
        resetScopedSearchUi();
        return;
    }
    switchTab(mainSelect.value);
}

function handleSubCategoryChange() {
    const subSelect = document.getElementById('sub-category-select');
    const detailSelect = document.getElementById('detail-item-select');
    const subVal = subSelect?.value || '';
    clearSelect(detailSelect, '-- 소분류 선택 --');

    const details = CONSUMER_DETAIL_LABELS[subVal] || {};
    if (Object.keys(details).length > 0) {
        Object.entries(details).forEach(([code, label]) => {
            const opt = document.createElement('option');
            opt.value = code;
            opt.textContent = label;
            detailSelect.appendChild(opt);
        });
        detailSelect.disabled = false;
    } else if (detailSelect) {
        detailSelect.disabled = true;
    }

    renderHierarchicalItemsList(activeTab, subVal, 'all');
    clearScopedSearchResults(false);
}

function handleDetailItemChange() {
    const subSelect = document.getElementById('sub-category-select');
    const detailSelect = document.getElementById('detail-item-select');
    renderHierarchicalItemsList(activeTab, subSelect?.value || '', detailSelect?.value || 'all');
    clearScopedSearchResults(false);
}

function getHierarchicalClassification(item) {
    const originalMain = getItemTypeGroup(item);
    let main = originalMain;
    let sub = '';
    let detail = 'all';
    const code = String(item.publicActionCode || item.actionCode || item.ediCode || item.code || '').toUpperCase();
    const name = String(item.name || '').toLowerCase();
    const category = item.category || '';

    if (main === 'test') {
        if (category === 'imaging' || code.startsWith('G') || code.startsWith('H') || name.includes('ct') || name.includes('mri') || name.includes('촬영') || name.includes('초음파') || name.includes('조영')) {
            sub = 'imaging';
            if (name.includes('mri') || name.includes('자기공명') || code.startsWith('HE')) detail = 'mri';
            else if (name.includes('ct') || name.includes('전산화') || code.startsWith('HA')) detail = 'ct';
            else if (name.includes('초음파') || code.startsWith('EB') || code.startsWith('EZ')) detail = 'ultrasound';
            else if (name.includes('조영') || name.includes('혈관촬영') || name.includes('angio')) detail = 'angio';
            else if (name.includes('x-ray') || name.includes('엑스') || name.includes('촬영')) detail = 'xray';
            else detail = 'special';
        } else if (category === 'endoscopy' || name.includes('내시경')) {
            sub = 'endoscopy';
            if (name.includes('위') || name.includes('식도') || name.includes('십이지장')) detail = 'gastro';
            else if (name.includes('대장') || name.includes('결장') || name.includes('직장')) detail = 'colono';
            else if (name.includes('기관지')) detail = 'broncho';
            else detail = 'etc';
        } else if (category === 'specimen' || code.startsWith('D') || name.includes('혈액') || name.includes('소변') || name.includes('검사')) {
            sub = 'specimen';
            if (name.includes('혈액') || name.includes('cbc') || name.includes('혈구') || code.startsWith('D0')) detail = 'blood';
            else if (name.includes('소변') || name.includes('요검')) detail = 'urine';
            else if (name.includes('종양') || name.includes('암') || name.includes('psa') || name.includes('afp') || name.includes('cea')) detail = 'tumor';
            else detail = 'chemistry';
        } else {
            sub = 'functional';
            if (name.includes('심전도') || name.includes('심장') || name.includes('ecg')) detail = 'cardio';
            else if (name.includes('폐기능') || name.includes('호흡')) detail = 'respiratory';
            else if (name.includes('뇌파') || name.includes('근전도') || name.includes('신경')) detail = 'neuro';
            else if (name.includes('수면')) detail = 'sleep';
            else detail = 'sensory';
        }
    } else if (main === 'procedure_hira') {
        if (name.includes('치과') || name.includes('치아') || code.startsWith('U')) sub = 'dental';
        else if (name.includes('심장') || name.includes('혈관') || name.includes('관상') || name.includes('카테터')) sub = 'cardiovascular';
        else if (name.includes('조영') || name.includes('색전') || name.includes('스텐트') || name.includes('picc')) sub = 'interventional';
        else if (name.includes('재활') || name.includes('통증') || name.includes('신경차단') || name.includes('도수')) sub = 'rehab_pain';
        else sub = 'general_proc';
    } else if (main === 'surgery') {
        if (name.includes('척추') || name.includes('뇌') || name.includes('신경') || code.startsWith('S4')) sub = 'neuro';
        else if (name.includes('눈') || name.includes('백내장') || name.includes('코') || name.includes('귀') || name.includes('후두') || name.includes('편도')) sub = 'eye_ent';
        else if (name.includes('심장') || name.includes('흉부') || name.includes('폐') || name.includes('대동맥')) sub = 'chest';
        else if (name.includes('자궁') || name.includes('분만') || name.includes('전립선') || name.includes('방광') || name.includes('요도') || name.includes('신장')) sub = 'urology_ob';
        else if (name.includes('위') || name.includes('대장') || name.includes('충수') || name.includes('담낭') || name.includes('간') || name.includes('복부')) sub = 'abdomen';
        else sub = 'ortho';
    } else {
        main = 'etc';
        sub = 'etc';
    }

    return { main, sub, detail };
}

function getScopedSearchFilters() {
    const subVal = document.getElementById('sub-category-select')?.value || '';
    const detailVal = document.getElementById('detail-item-select')?.value || '';
    return { main: activeTab || '', sub: subVal, detail: detailVal };
}

function getSurgeryAutoSupportItems(maxSurgPrice) {
    const items = [
        { name: '수술 전후 주사·수액·기본 처치', price: 45000 },
        { name: '수술실 소모품·회복실 기본 관리', price: 35000 }
    ];

    if (maxSurgPrice >= 1000000) {
        items.push({ name: '수술 후 통증 조절 주사·처치', price: 60000 });
    }

    if (maxSurgPrice >= 3000000) {
        items.push({ name: '고난도 수술 보조 처치·감시장치', price: 120000 });
    }

    return items;
}

function itemMatchesScope(item, scope) {
    const classification = getHierarchicalClassification(item);
    if (classification.main !== scope.main) return false;
    if (scope.sub && classification.sub !== scope.sub) return false;
    if (scope.detail && scope.detail !== 'all' && classification.detail !== scope.detail) return false;
    return true;
}

function clearScopedSearchResults(clearInput = true) {
    const input = document.getElementById('category-search-input');
    const results = document.getElementById('category-search-results');
    const btnClear = document.getElementById('btn-clear-category-search');
    const btnRun = document.getElementById('btn-run-category-search');
    if (clearInput && input) input.value = '';
    if (btnClear) btnClear.classList.add('hidden');
    if (btnRun) {
        btnRun.disabled = true;
        btnRun.classList.remove('active');
    }
    if (results) {
        results.innerHTML = '';
        results.classList.add('hidden');
    }
}

function getSearchElements(targetGroup) {
    if (targetGroup === 'global') {
        return {
            input: document.getElementById('global-search-input'),
            results: document.getElementById('global-search-results'),
            clear: document.getElementById('btn-clear-global-search'),
            run: document.getElementById('btn-run-global-search')
        };
    }
    return {
        input: document.getElementById('category-search-input'),
        results: document.getElementById('category-search-results'),
        clear: document.getElementById('btn-clear-category-search'),
        run: document.getElementById('btn-run-category-search')
    };
}

function renderSearchResults(query, targetGroup, resultsList, items) {
    resultsList.innerHTML = '';
    if (items.length === 0) {
        const emptyDiv = document.createElement('div');
        emptyDiv.className = 'empty-search-results';
        emptyDiv.innerHTML = `<i data-lucide="search"></i><p>'<strong>${query}</strong>' 검색 결과가 없습니다.</p>`;
        resultsList.appendChild(emptyDiv);
    } else {
        items.slice(0, 30).forEach(item => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'search-result-item';
            const itemGroup = getItemTypeGroup(item);
            const groupLabels = { test: '검사', procedure_hira: '시술', surgery: '수술', etc: '기타' };
            const classification = getHierarchicalClassification(item);
            const subLabel = CONSUMER_SUB_LABELS[classification.main]?.[classification.sub] || groupLabels[itemGroup] || '';
            const detailLabel = CONSUMER_DETAIL_LABELS[classification.sub]?.[classification.detail] || '';
            const benefitBadge = item.isBenefit
                ? '<span class="badge badge-benefit" style="font-size: 0.65rem;">급여</span>'
                : '<span class="badge badge-non-benefit" style="font-size: 0.65rem;">비급여</span>';
            const code = item.publicActionCode || item.actionCode || item.ediCode || item.code || '';
            btn.innerHTML = `
                <div class="search-result-info">
                    <span class="search-result-name"><span class="badge badge-benefit" style="padding:0.15rem 0.35rem;font-size:0.68rem;margin-right:0.4rem;">${groupLabels[itemGroup] || itemGroup}</span>${item.name}</span>
                    <span class="search-result-keywords">${subLabel}${detailLabel ? ` · ${detailLabel}` : ''}${code ? ` · 코드 ${code}` : ''}</span>
                </div>
                <div class="search-result-meta">
                    <span class="search-result-price">${formatNumber(item.price)}원</span>
                    ${benefitBadge}
                    <span class="btn-result-add"><i data-lucide="plus" style="width:12px;height:12px;"></i> 추가</span>
                </div>
            `;
            btn.addEventListener('click', () => {
                addHiraItem(item);
                const el = getSearchElements(targetGroup);
                if (el.input) el.input.value = '';
                updateSearchControlState(el.input, el.clear, el.run);
                el.results.innerHTML = '';
                el.results.classList.add('hidden');
                if (el.input) el.input.focus();
            });
            resultsList.appendChild(btn);
        });
    }
    resultsList.classList.remove('hidden');
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

// =========================================================
// 12. Absolute final search override
// Keep this block as the last search definition. Earlier generated code has
// duplicate function names, so this section uses direct onclick handlers.
// =========================================================

function getFinalSearchElements(targetGroup) {
    const isGlobal = targetGroup === 'global';
    return {
        input: document.getElementById(isGlobal ? 'global-search-input' : 'category-search-input'),
        results: document.getElementById(isGlobal ? 'global-search-results' : 'category-search-results'),
        clear: document.getElementById(isGlobal ? 'btn-clear-global-search' : 'btn-clear-category-search'),
        run: document.getElementById(isGlobal ? 'btn-run-global-search' : 'btn-run-category-search')
    };
}

function finalNormalizeSearch(value) {
    return String(value || '').toLowerCase().replace(/\s+/g, '');
}

function finalKcdCode(item) {
    return String(item.code || '').trim();
}

function finalKcdName(item) {
    return String(item.name || item.ko || item.name_ko || '').trim();
}

function finalKcdEnglish(item) {
    return String(item.name_en || item.en || '').trim();
}

function finalKcdKeywords(item) {
    return Array.isArray(item.keywords) ? item.keywords : [];
}

const FINAL_KCD_ALIASES = [
    { code: 'J00', name: '감기', keywords: ['감기', '코감기', '목감기', '급성 비인두염', 'cold'] },
    { code: 'J10', name: '독감', keywords: ['독감', '인플루엔자', 'flu'] },
    { code: 'K35', name: '맹장염', keywords: ['맹장염', '충수염', 'appendicitis'] },
    { code: 'M54', name: '허리통증', keywords: ['허리통증', '요통', '등통증', 'back pain'] },
    { code: 'M545', name: '요통', keywords: ['요통', '허리 아픔', 'low back pain'] },
    { code: 'M51', name: '허리디스크', keywords: ['허리디스크', '요추디스크'] },
    { code: 'M50', name: '목디스크', keywords: ['목디스크', '경추디스크'] },
    { code: 'I10', name: '고혈압', keywords: ['고혈압', '혈압'] },
    { code: 'E11', name: '당뇨병', keywords: ['당뇨', '당뇨병'] },
    { code: 'R51', name: '두통', keywords: ['두통', '머리 아픔'] },
    { code: 'R42', name: '어지럼증', keywords: ['어지럼', '어지럼증', '현기증'] },
    { code: 'O82', name: '제왕절개 분만', keywords: ['제왕절개', 'c-section'] }
];

function finalKcdDatabase() {
    const merged = [];
    const seen = new Set();
    const fullDb = Array.isArray(ALL_KCD_DATABASE) ? ALL_KCD_DATABASE : [];
    const fallbackDb = Array.isArray(KCD_DATABASE) ? KCD_DATABASE : [];
    FINAL_KCD_ALIASES.concat(fallbackDb, fullDb).forEach(item => {
        const code = finalKcdCode(item);
        const name = finalKcdName(item);
        const key = `${code}|${name}`;
        if (!code || seen.has(key)) return;
        seen.add(key);
        merged.push(item);
    });
    return merged;
}

function finalSearchKcd(query) {
    const clean = finalNormalizeSearch(query);
    if (!clean) return [];
    return finalKcdDatabase().filter(item => {
        const fields = [
            finalKcdCode(item),
            finalKcdName(item),
            finalKcdEnglish(item),
            ...finalKcdKeywords(item)
        ];
        return fields.some(field => finalNormalizeSearch(field).includes(clean));
    }).slice(0, 40);
}

function finalRenderDiseaseResults(query) {
    const input = document.getElementById('disease_code_input');
    const results = document.getElementById('disease-search-results');
    if (!input || !results) return;
    const matched = finalSearchKcd(query);
    results.innerHTML = '';
    if (matched.length === 0) {
        results.innerHTML = `<div class="empty-search-results"><p>'<strong>${escapeHtml(query)}</strong>' 질병명/상병코드 결과가 없습니다.</p></div>`;
    } else {
        matched.forEach(item => {
            const code = finalKcdCode(item);
            const name = finalKcdName(item) || finalKcdEnglish(item) || code;
            const en = finalKcdEnglish(item);
            const safeCode = escapeHtml(code);
            const safeName = escapeHtml(name);
            const safeEn = escapeHtml(en);
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'search-result-item';
            btn.innerHTML = `
                <div class="search-result-info">
                    <span class="search-result-name"><span class="badge badge-benefit" style="font-size:0.68rem;margin-right:0.4rem;">상병</span>${safeName}</span>
                    <span class="search-result-keywords">KCD ${safeCode}${en ? ` · ${safeEn}` : ''}</span>
                </div>
                <div class="search-result-meta"><span class="btn-result-add">적용</span></div>
            `;
            btn.onclick = () => {
                addKcdDisease(code, name);
                input.value = `${code} ${name}`;
                results.innerHTML = '';
                results.classList.add('hidden');
                input.focus();
            };
            results.appendChild(btn);
        });
    }
    results.classList.remove('hidden');
}

function finalItemMatchesScope(item) {
    const scope = getScopedSearchFilters();
    if (!scope.main) return false;
    const classification = getHierarchicalClassification(item);
    if (classification.main !== scope.main) return false;
    if (scope.sub && classification.sub !== scope.sub) return false;
    if (scope.detail && scope.detail !== 'all' && classification.detail !== scope.detail) return false;
    return true;
}

function finalRenderItemResults(query, targetGroup, items) {
    const el = getFinalSearchElements(targetGroup);
    if (!el.results) return;
    el.results.innerHTML = '';
    if (items.length === 0) {
        el.results.innerHTML = `<div class="empty-search-results"><p>'<strong>${query}</strong>' 검색 결과가 없습니다.</p></div>`;
        el.results.classList.remove('hidden');
        return;
    }

    items.slice(0, 30).forEach(item => {
        const itemGroup = getItemTypeGroup(item);
        const groupLabels = { test: '검사', procedure_hira: '시술', surgery: '수술', etc: '기타' };
        const classification = getHierarchicalClassification(item);
        const subLabel = CONSUMER_SUB_LABELS[classification.main]?.[classification.sub] || groupLabels[itemGroup] || '';
        const detailLabel = CONSUMER_DETAIL_LABELS[classification.sub]?.[classification.detail] || '';
        const code = item.estimateKind ? '' : (item.publicActionCode || item.actionCode || item.ediCode || item.code || '');
        const benefitBadge = item.isBenefit
            ? '<span class="badge badge-benefit" style="font-size:0.65rem;">급여</span>'
            : '<span class="badge badge-non-benefit" style="font-size:0.65rem;">비급여</span>';

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'search-result-item';
        btn.innerHTML = `
            <div class="search-result-info">
                <span class="search-result-name"><span class="badge badge-benefit" style="padding:0.15rem 0.35rem;font-size:0.68rem;margin-right:0.4rem;">${groupLabels[itemGroup] || itemGroup}</span>${item.name}</span>
                <span class="search-result-keywords">${subLabel}${detailLabel ? ` · ${detailLabel}` : ''}${code ? ` · 코드 ${code}` : ''}</span>
            </div>
            <div class="search-result-meta">
                <span class="search-result-price">${formatNumber(item.price)}원</span>
                ${benefitBadge}
                <span class="btn-result-add">추가</span>
            </div>
        `;
        btn.onclick = () => {
            addHiraItem(item);
            const searchEl = getFinalSearchElements(targetGroup);
            if (searchEl.input) searchEl.input.value = '';
            updateSearchControlState(searchEl.input, searchEl.clear, searchEl.run);
            if (searchEl.results) {
                searchEl.results.innerHTML = '';
                searchEl.results.classList.add('hidden');
            }
            if (searchEl.input) searchEl.input.focus();
        };
        el.results.appendChild(btn);
    });
    el.results.classList.remove('hidden');
}

function performSearch(query, targetGroup = 'scoped', options = {}) {
    const clean = String(query || '').trim();
    if (!clean) return;
    const el = getFinalSearchElements(targetGroup);
    if (!el.results) return;
    let matched = getMedicalItemDatabase().filter(item => isMatch(clean, item) && !isEmergencyManagementItem(item));
    if (targetGroup !== 'global') {
        const scope = getScopedSearchFilters();
        if (!scope.main) {
            el.results.innerHTML = '<div class="empty-search-results"><p>먼저 검사, 시술, 수술 중 하나를 선택하세요.</p></div>';
            el.results.classList.remove('hidden');
            return;
        }
        matched = matched.filter(finalItemMatchesScope);
    }
    if (options.logSearch) sendSearchLog(clean, matched.length);
    finalRenderItemResults(clean, targetGroup, matched);
}

function executeSearchFromInput(searchInput, targetGroup = 'scoped') {
    if (!searchInput) return;
    const query = searchInput.value.trim();
    if (!query) {
        searchInput.focus();
        return;
    }
    performSearch(query, targetGroup, { logSearch: true });
    searchInput.focus();
}

function finalBindSearchBox(targetGroup) {
    const el = getFinalSearchElements(targetGroup);
    if (!el.input || !el.results) return;
    el.input.oninput = () => updateSearchControlState(el.input, el.clear, el.run);
    el.input.onkeydown = event => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        executeSearchFromInput(el.input, targetGroup);
    };
    if (el.clear) {
        el.clear.onclick = event => {
            event.stopPropagation();
            el.input.value = '';
            updateSearchControlState(el.input, el.clear, el.run);
            el.results.innerHTML = '';
            el.results.classList.add('hidden');
            el.input.focus();
        };
    }
    if (el.run) {
        el.run.disabled = !el.input.value.trim();
        el.run.onclick = event => {
            event.stopPropagation();
            executeSearchFromInput(el.input, targetGroup);
        };
    }
}

function finalBindDiseaseSearchBox() {
    const input = document.getElementById('disease_code_input');
    const results = document.getElementById('disease-search-results');
    if (!input || !results) return;
    input.oninput = () => {
        const query = input.value.trim();
        if (!query) {
            results.innerHTML = '';
            results.classList.add('hidden');
            return;
        }
        finalRenderDiseaseResults(query);
    };
    input.onkeydown = event => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        const first = results.querySelector('button.search-result-item');
        if (first) first.click();
    };
}

function finalBindAllSearchControls() {
    finalBindSearchBox('global');
    finalBindSearchBox('scoped');
    finalBindDiseaseSearchBox();
}

onDocumentReady(finalBindAllSearchControls);
setTimeout(finalBindAllSearchControls, 0);

// =========================================================
// 11. Final search binding override
// This block must stay at file end because earlier generated code defines
// duplicate search functions.
// =========================================================

const KCD_COMMON_ALIASES = [
    { code: 'J00', name: '감기', keywords: ['감기', '코감기', '목감기', '급성 비인두염', 'cold'] },
    { code: 'J10', name: '독감', keywords: ['독감', '인플루엔자', 'flu'] },
    { code: 'J20', name: '기관지염', keywords: ['기관지염', '기침', 'bronchitis'] },
    { code: 'J18', name: '폐렴', keywords: ['폐렴', 'pneumonia'] },
    { code: 'K35', name: '맹장염', keywords: ['맹장염', '충수염', 'appendicitis'] },
    { code: 'K29', name: '위염', keywords: ['위염', '소화불량', 'gastritis'] },
    { code: 'K21', name: '역류성 식도염', keywords: ['역류성 식도염', '식도염', 'gerd'] },
    { code: 'M54', name: '허리통증', keywords: ['허리통증', '요통', '등통증', 'back pain'] },
    { code: 'M545', name: '요통', keywords: ['요통', '허리 아픔', 'low back pain'] },
    { code: 'M51', name: '허리디스크', keywords: ['허리디스크', '요추디스크', 'herniated disc'] },
    { code: 'M50', name: '목디스크', keywords: ['목디스크', '경추디스크'] },
    { code: 'M17', name: '무릎 관절염', keywords: ['무릎 관절염', '퇴행성 관절염'] },
    { code: 'I10', name: '고혈압', keywords: ['고혈압', '혈압', 'hypertension'] },
    { code: 'E11', name: '당뇨병', keywords: ['당뇨', '당뇨병', 'diabetes'] },
    { code: 'R51', name: '두통', keywords: ['두통', '머리 아픔', 'headache'] },
    { code: 'R42', name: '어지럼증', keywords: ['어지럼', '어지럼증', '현기증', 'dizziness'] },
    { code: 'O82', name: '제왕절개 분만', keywords: ['제왕절개', 'c-section', 'cesarean'] }
];

function normalizeSearchText(value) {
    const matches = String(value || '')
        .toLowerCase()
        .match(/[0-9A-Za-z\u3131-\u318E\uAC00-\uD7A3]+/g);
    return matches ? matches.join('').replace(/-/g, '') : '';
}

function getKcdCode(item) {
    return String(item.code || '').trim();
}

function getKcdName(item) {
    return String(item.name || item.ko || item.name_ko || '').trim();
}

function getKcdEnglishName(item) {
    return String(item.name_en || item.en || '').trim();
}

function getKcdKeywords(item) {
    return Array.isArray(item.keywords) ? item.keywords : [];
}

function getKcdSearchDatabase() {
    const fullDb = Array.isArray(ALL_KCD_DATABASE) ? ALL_KCD_DATABASE : [];
    const fallbackDb = Array.isArray(KCD_DATABASE) ? KCD_DATABASE : [];
    const merged = [];
    const seen = new Set();

    KCD_COMMON_ALIASES.concat(fallbackDb, fullDb).forEach(item => {
        const code = getKcdCode(item);
        const name = getKcdName(item);
        const key = `${code}|${name}`;
        if (!code || seen.has(key)) return;
        seen.add(key);
        merged.push(item);
    });

    return merged;
}

function searchKcdDiseases(query) {
    const cleanQuery = normalizeSearchText(query);
    if (!cleanQuery) return [];

    return getKcdSearchDatabase().filter(item => {
        const fields = [
            getKcdCode(item),
            getKcdName(item),
            getKcdEnglishName(item),
            ...getKcdKeywords(item)
        ];
        return fields.some(field => normalizeSearchText(field).includes(cleanQuery));
    }).slice(0, 40);
}

function renderDiseaseSearchResults(query) {
    const input = document.getElementById('disease_code_input');
    const results = document.getElementById('disease-search-results');
    if (!input || !results) return;

    const matched = searchKcdDiseases(query);
    results.innerHTML = '';

    if (matched.length === 0) {
        results.innerHTML = `<div class="empty-search-results"><i data-lucide="search"></i><p>'<strong>${escapeHtml(query)}</strong>' 질병명/상병코드 결과가 없습니다.</p></div>`;
    } else {
        matched.forEach(item => {
            const code = getKcdCode(item);
            const name = getKcdName(item) || getKcdEnglishName(item) || code;
            const en = getKcdEnglishName(item);
            const safeCode = escapeHtml(code);
            const safeName = escapeHtml(name);
            const safeEn = escapeHtml(en);
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'search-result-item';
            btn.innerHTML = `
                <div class="search-result-info">
                    <span class="search-result-name"><span class="badge badge-benefit" style="font-size:0.68rem;margin-right:0.4rem;">상병</span>${safeName}</span>
                    <span class="search-result-keywords">KCD ${safeCode}${en ? ` · ${safeEn}` : ''}</span>
                </div>
                <div class="search-result-meta">
                    <span class="btn-result-add">적용</span>
                </div>
            `;
            btn.addEventListener('click', () => {
                addKcdDisease(code, name);
                input.value = `${code} ${name}`;
                results.innerHTML = '';
                results.classList.add('hidden');
                input.focus();
            });
            results.appendChild(btn);
        });
    }

    results.classList.remove('hidden');
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

function bindDiseaseSearchBox() {
    const input = document.getElementById('disease_code_input');
    const results = document.getElementById('disease-search-results');
    if (!input || !results || input.dataset.finalBound === '1') return;
    input.dataset.finalBound = '1';

    input.addEventListener('input', () => {
        const query = input.value.trim();
        if (query.length < 1) {
            results.innerHTML = '';
            results.classList.add('hidden');
            return;
        }
        renderDiseaseSearchResults(query);
    });

    input.addEventListener('keydown', event => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        const first = results.querySelector('button.search-result-item');
        if (first) first.click();
    });
}

function getSearchElements(targetGroup) {
    if (targetGroup === 'global') {
        return {
            input: document.getElementById('global-search-input'),
            results: document.getElementById('global-search-results'),
            clear: document.getElementById('btn-clear-global-search'),
            run: document.getElementById('btn-run-global-search')
        };
    }
    return {
        input: document.getElementById('category-search-input'),
        results: document.getElementById('category-search-results'),
        clear: document.getElementById('btn-clear-category-search'),
        run: document.getElementById('btn-run-category-search')
    };
}

function performSearch(query, targetGroup = 'scoped', options = {}) {
    const el = getSearchElements(targetGroup);
    if (!el.results) return;
    const cleanQuery = String(query || '').trim();
    if (!cleanQuery) return;

    let matched = getMedicalItemDatabase().filter(item => isMatch(cleanQuery, item) && !isEmergencyManagementItem(item));

    if (targetGroup !== 'global') {
        const scope = getScopedSearchFilters();
        if (!scope.main) {
            el.results.innerHTML = '<div class="empty-search-results"><i data-lucide="search"></i><p>먼저 검사, 시술, 수술 중 하나를 선택하세요.</p></div>';
            el.results.classList.remove('hidden');
            if (typeof lucide !== 'undefined') lucide.createIcons();
            return;
        }
        matched = matched.filter(item => itemMatchesScope(item, scope));
    }

    // 질병명/KCD는 통합검색과 항목추가 검색에서 의도적으로 제외한다.
    if (options.logSearch) sendSearchLog(cleanQuery, matched.length);
    renderSearchResults(cleanQuery, targetGroup, el.results, matched);
}

function executeSearchFromInput(searchInput, targetGroup = 'scoped') {
    if (!searchInput) return;
    const query = searchInput.value.trim();
    if (!query) {
        searchInput.focus();
        return;
    }
    performSearch(query, targetGroup, { logSearch: true });
    searchInput.focus();
}

function bindSearchBox(targetGroup) {
    const el = getSearchElements(targetGroup);
    if (!el.input || !el.results || el.input.dataset.finalBound === '1') return;
    el.input.dataset.finalBound = '1';

    el.input.addEventListener('input', () => {
        updateSearchControlState(el.input, el.clear, el.run);
    });

    el.input.addEventListener('keydown', event => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        executeSearchFromInput(el.input, targetGroup);
    });

    if (el.clear) {
        el.clear.onclick = event => {
            event.stopPropagation();
            el.input.value = '';
            updateSearchControlState(el.input, el.clear, el.run);
            el.results.innerHTML = '';
            el.results.classList.add('hidden');
            el.input.focus();
        };
    }

    if (el.run) {
        el.run.onclick = event => {
            event.stopPropagation();
            executeSearchFromInput(el.input, targetGroup);
        };
    }
}

function initSearchEvents() {
    bindSearchBox('global');
    bindSearchBox('scoped');
    bindDiseaseSearchBox();
}

onDocumentReady(() => {
    bindSearchBox('global');
    bindSearchBox('scoped');
    bindDiseaseSearchBox();
});

function performSearch(query, targetGroup = 'scoped', options = {}) {
    const el = getSearchElements(targetGroup);
    if (!el.results) return;
    const cleanQuery = String(query || '').trim();
    if (!cleanQuery) return;

    let matched = getMedicalItemDatabase().filter(item => isMatch(cleanQuery, item) && !isEmergencyManagementItem(item));

    if (targetGroup === 'global') {
        // 통합검색은 검사, 시술, 수술, 기타 처치, 주사, 마취 전체 허용.
    } else {
        const scope = getScopedSearchFilters();
        if (!scope.main) {
            el.results.innerHTML = '<div class="empty-search-results"><i data-lucide="search"></i><p>먼저 검사, 시술, 수술 중 하나를 선택하세요.</p></div>';
            el.results.classList.remove('hidden');
            if (typeof lucide !== 'undefined') lucide.createIcons();
            return;
        }
        matched = matched.filter(item => itemMatchesScope(item, scope));
    }

    if (options.logSearch) sendSearchLog(cleanQuery, matched.length);
    renderSearchResults(cleanQuery, targetGroup, el.results, matched);
}

function executeSearchFromInput(searchInput, targetGroup) {
    if (!searchInput) return;
    const query = searchInput.value.trim();
    if (!query) {
        searchInput.focus();
        return;
    }
    performSearch(query, targetGroup, { logSearch: true });
    searchInput.focus();
}

function bindSearchBox(targetGroup) {
    const el = getSearchElements(targetGroup);
    if (!el.input || !el.results) return;
    el.input.addEventListener('input', () => {
        updateSearchControlState(el.input, el.clear, el.run);
    });
    el.input.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
            e.preventDefault();
            executeSearchFromInput(el.input, targetGroup);
        }
    });
    if (el.clear) {
        el.clear.addEventListener('click', e => {
            e.stopPropagation();
            el.input.value = '';
            updateSearchControlState(el.input, el.clear, el.run);
            el.results.innerHTML = '';
            el.results.classList.add('hidden');
            el.input.focus();
        });
    }
    if (el.run) {
        el.run.addEventListener('click', e => {
            e.stopPropagation();
            executeSearchFromInput(el.input, targetGroup);
        });
    }
}

function initSearchEvents() {
    bindSearchBox('global');
    bindSearchBox('scoped');
}

onDocumentReady(() => {
    resetScopedSearchUi();
});

/** 
 * 추천 검색어 칩 클릭 시 즉시 탭 내부 검색창에 입력 후 검색 실행 
 * @param {string} keyword - 검색할 단어
 */
function searchByChip(keyword) {
    const searchInput = document.getElementById('category-search-input');
    if (!searchInput) return;
    
    searchInput.value = keyword;
    
    const btnClear = document.getElementById('btn-clear-category-search');
    if (btnClear) btnClear.classList.remove('hidden');
    const btnRun = document.getElementById('btn-run-category-search');
    updateSearchControlState(searchInput, btnClear, btnRun);
    
    performSearch(keyword, activeTab, { logSearch: true });
    searchInput.focus();
}

/**
 * 심평원 데이터베이스의 각 수가 항목을 사용자가 직관적으로 인지할 수 있는 
 * [검사], [시술], [수술], [기타] 4대 대분류 탭/영역으로 분류하는 헬퍼 함수입니다.
 */
function getItemTypeGroup(item) {
    if (item.group) return item.group;

    // 1. 검사 (imaging, specimen, functional, endoscopy 카테고리 전체)
    if (['imaging', 'specimen', 'functional', 'endoscopy'].includes(item.category)) {
        return 'test';
    }
    
    // 2. 기타 처치, 주사, 마취 등 (type이 anesthesia, injection, rehab, korean_med 이거나 응급실 ER_ 코드, 단순 소독/깁스 등)
    if (
        item.type === 'anesthesia' || 
        item.type === 'injection' || 
        item.type === 'rehab' || 
        item.type === 'korean_med' ||
        item.code.startsWith('ER_') ||
        (item.category === 'procedure' && ['PR_TR03', 'PR_TR08'].includes(item.code))
    ) {
        return 'etc';
    }
    
    // 3. 시술 (수가 코드 중 색전술, 스텐트, 쇄석술, 스케일링, 임플란트, 단순 봉합 및 입원 패키지 등)
    if (
        ['SU_HN03', 'SU_TH06', 'SU_UR02', 'SU_DE01', 'SU_DE05', 'PR_TR01', 'PK_PN01'].includes(item.code)
    ) {
        return 'procedure_hira';
    }
    
    // 4. 수술 (나머지 surgery 카테고리)
    if (item.category === 'surgery') {
        return 'surgery';
    }
    
    return 'etc'; // 예외 방지 기본값
}

function anesthesiaProviderForClass(hospitalClass) {
    return hospitalClass === 'clinic' ? 'clinic' : 'hospital';
}

function getAnesthesiaEstimate(hospitalClass) {
    if (!window.MedicalEstimator) return { total: 0, episodes: [] };
    return window.MedicalEstimator.estimateAnesthesia(
        addedSurgeries,
        anesthesiaProviderForClass(hospitalClass)
    );
}

function updateAnesthesiaDialogStatus() {
    const status = document.getElementById('anesthesia-status');
    const type = document.getElementById('anesthesia-type')?.value;
    const ageGroup = document.getElementById('anesthesia-age-group')?.value;
    const sedation = document.getElementById('anesthesia-sedation')?.value === 'yes';
    if (!status) return;

    const messages = [];
    if (type === 'general') messages.push('전신마취 기본료와 1시간 초과 15분 단위 비용을 자동 반영합니다.');
    if (type === 'local') messages.push('단순 국소마취는 수술·처치료에 포함되어 별도 마취료를 더하지 않습니다.');
    if (type === 'unknown') messages.push('선택 가능한 공식 마취료의 중앙값으로 계산합니다.');
    if (sedation && ['general', 'spinal', 'nerve-block'].includes(type)) {
        messages.push('전신·부위마취와 진정관리료는 중복 산정하지 않습니다.');
    } else if (sedation) {
        messages.push('마취과 의료진이 계속 감시한 진정관리료를 별도로 반영합니다.');
    }
    if (ageGroup === 'child') messages.push('소아 추가 가산은 일부 입원 수술에만 적용되어 본 예상에는 자동 반영하지 않습니다.');
    status.textContent = messages.join(' ');
}

function syncAnesthesiaSessionMode() {
    const sameSession = document.querySelector('input[name="anesthesia_session_mode"]:checked')?.value === 'same';
    const hasExisting = addedSurgeries.length > 0;
    ['anesthesia-type', 'anesthesia-age-group', 'anesthesia-sedation'].forEach(id => {
        const field = document.getElementById(id);
        if (field) field.disabled = hasExisting && sameSession;
    });

    if (hasExisting && sameSession) {
        const plan = addedSurgeries[addedSurgeries.length - 1].anesthesia;
        if (plan) {
            document.getElementById('anesthesia-type').value = plan.type;
            document.getElementById('anesthesia-age-group').value = plan.ageGroup;
            document.getElementById('anesthesia-sedation').value = plan.sedationAnswer || (plan.sedation ? 'yes' : 'no');
            document.getElementById('anesthesia-duration').value = plan.durationMinutes;
        }
    }
    updateAnesthesiaDialogStatus();
}

function openAnesthesiaDialog(item) {
    const dialog = document.getElementById('anesthesia-dialog');
    const form = document.getElementById('anesthesia-form');
    if (!dialog || !form) return false;

    pendingSurgeryItem = item;
    form.reset();
    document.getElementById('anesthesia-surgery-name').textContent = item.name;
    const sessionFieldset = document.getElementById('anesthesia-session-fieldset');
    sessionFieldset.hidden = addedSurgeries.length === 0;
    document.querySelector('input[name="anesthesia_session_mode"][value="same"]').checked = true;
    document.getElementById('anesthesia-duration').value = '60';
    document.getElementById('anesthesia-age-group').value = 'adult';
    document.getElementById('anesthesia-sedation').value = 'unknown';
    syncAnesthesiaSessionMode();
    dialog.showModal();
    return true;
}

function bindAnesthesiaDialog() {
    const dialog = document.getElementById('anesthesia-dialog');
    const form = document.getElementById('anesthesia-form');
    if (!dialog || !form || form.dataset.bound === 'true') return;
    form.dataset.bound = 'true';

    document.getElementById('anesthesia-cancel')?.addEventListener('click', () => {
        pendingSurgeryItem = null;
        dialog.close();
    });
    dialog.addEventListener('cancel', () => { pendingSurgeryItem = null; });
    form.addEventListener('change', event => {
        if (event.target.name === 'anesthesia_session_mode') syncAnesthesiaSessionMode();
        else updateAnesthesiaDialogStatus();
    });
    form.addEventListener('submit', event => {
        event.preventDefault();
        if (!pendingSurgeryItem) return;

        const sameSession = addedSurgeries.length > 0
            && document.querySelector('input[name="anesthesia_session_mode"]:checked')?.value === 'same';
        const existingPlan = sameSession ? addedSurgeries[addedSurgeries.length - 1].anesthesia : null;
        const durationMinutes = Math.max(15, Number(document.getElementById('anesthesia-duration').value) || 60);
        const sedationAnswer = document.getElementById('anesthesia-sedation').value;
        const plan = existingPlan
            ? { ...existingPlan, durationMinutes }
            : {
                sessionId: `anesthesia-${++anesthesiaSessionCounter}`,
                type: document.getElementById('anesthesia-type').value,
                durationMinutes,
                ageGroup: document.getElementById('anesthesia-age-group').value,
                sedationAnswer,
                sedation: sedationAnswer === 'yes'
            };

        if (!plan.type) {
            document.getElementById('anesthesia-type').focus();
            return;
        }
        if (sameSession) {
            addedSurgeries.forEach(surgery => {
                if (surgery.anesthesia?.sessionId === plan.sessionId) surgery.anesthesia = { ...plan };
            });
        }

        const item = { ...pendingSurgeryItem, anesthesiaSelectionConfirmed: true, anesthesia: plan };
        pendingSurgeryItem = null;
        dialog.close();
        addHiraItem(item);
    });
}

onDocumentReady(bindAnesthesiaDialog);

/** 실시간 검색된 심평원 수가 아이템을 기존 계산기 데이터 구조에 분기 추가 */
function addHiraItem(item) {
    item = applyPublicStatsToItem(item);

    const categoryNames = {
        imaging: '영상검사',
        specimen: '검체검사',
        functional: '기능검사',
        endoscopy: '내시경',
        surgery: '수술/시술',
        procedure: '처치/치료'
    };

    // 1. 수술 분류에 속하는 행위
    if (item.category === 'surgery') {
        if (addedSurgeries.some(s => s.type === item.code || s.typeName === item.name)) {
            alert("이미 등록된 수술/시술 항목입니다.");
            return;
        }
        if (!item.anesthesiaSelectionConfirmed && openAnesthesiaDialog(item)) return;
        surgeryIdCounter++;
        addedSurgeries.push({
            id: surgeryIdCounter,
            category: 'hira_added',
            categoryName: '수술/시술',
            type: item.code,
            typeName: item.name,
            basePrice: resolveProviderPrice(item),
            publicStatsSource: item.publicStatsSource || '',
            publicFeeScheduleSource: item.publicFeeScheduleSource || '',
            alreadyPricedByProvider: Boolean(item.alreadyPricedByProvider),
            isBenefit: item.isBenefit,
            isDRG: item.isDRG || false,
            anesthesia: item.anesthesia,
            estimateKind: item.estimateKind || '',
            estimateBucket: item.estimateBucket || '',
            estimateRange: item.estimateRange || null,
            estimateSampleCount: item.estimateSampleCount || 0
        });
    } 
    // 2. 처치/치료/마취 분류에 속하는 행위
    else if (item.category === 'procedure') {
        if (addedSurgeries.length && (/^FEE_L(?:010[1-4]|12)/i.test(item.code) || /^PR_AN/.test(item.code))) {
            alert('수술에 선택한 마취료가 이미 자동 반영되어 별도 마취 항목은 추가하지 않습니다.');
            return;
        }
        const existing = addedProcedures.find(p => p.type === item.code || p.typeName === item.name);
        if (existing) {
            existing.count++; // 이미 존재하면 횟수 누적
        } else {
            procedureIdCounter++;
            addedProcedures.push({
                id: procedureIdCounter,
                category: 'hira_added',
                categoryName: '처치/치료',
                type: item.code,
                typeName: item.name,
                count: 1,
                basePrice: resolveProviderPrice(item),
                publicStatsSource: item.publicStatsSource || '',
                publicFeeScheduleSource: item.publicFeeScheduleSource || '',
                alreadyPricedByProvider: Boolean(item.alreadyPricedByProvider),
                isBenefit: item.isBenefit,
                estimateKind: item.estimateKind || '',
                estimateBucket: item.estimateBucket || '',
                estimateRange: item.estimateRange || null,
                estimateSampleCount: item.estimateSampleCount || 0
            });
        }
    } 
    // 3. 검사류 분류 (영상, 검체, 기능, 내시경)
    else {
        const existing = addedTests.find(t => t.type === item.code || t.typeName === item.name);
        if (existing) {
            existing.count++; // 이미 존재하면 횟수 누적
        } else {
            testIdCounter++;
            addedTests.push({
                id: testIdCounter,
                category: item.category,
                categoryName: categoryNames[item.category] || '검사',
                type: item.code,
                typeName: item.name,
                area: 'std',
                areaName: '정밀진단',
                count: 1,
                basePrice: resolveProviderPrice(item),
                publicStatsSource: item.publicStatsSource || '',
                publicFeeScheduleSource: item.publicFeeScheduleSource || '',
                alreadyPricedByProvider: Boolean(item.alreadyPricedByProvider),
                isBenefit: item.isBenefit,
                estimateKind: item.estimateKind || '',
                estimateBucket: item.estimateBucket || '',
                estimateRange: item.estimateRange || null,
                estimateSampleCount: item.estimateSampleCount || 0
            });
        }
    }

    renderAddedItems();
    updateEtcAddedBadge();
    markResultStale();
}


// =========================================================
// 6. 추가된 수가 항목 칩 통합 렌더링
// =========================================================

/** 추가된 모든 검사, 수술, 처치 항목을 #added_items_unified_list에 단일 칩 카드로 렌더링 */
function renderAddedItems() {
    const unifiedList = document.getElementById('added_items_unified_list');
    if (!unifiedList) return;

    unifiedList.innerHTML = '';

    const totalCount = addedTests.length + addedSurgeries.length + addedProcedures.length;

    if (totalCount === 0) {
        unifiedList.innerHTML = '<p class="empty-list-text">등록된 치료 및 검사 항목이 없습니다. 대분류를 선택하여 드롭다운으로 추가하거나 검색해 주세요.</p>';
        return;
    }

    // A. 검사 항목 칩 렌더링
    addedTests.forEach(item => {
        const div = document.createElement('div');
        div.className = 'added-item';
        const benefitTag = item.isBenefit 
            ? '<span class="badge badge-benefit">급여</span>' 
            : '<span class="badge badge-non-benefit">비급여</span>';
        
        div.innerHTML = `
            <div class="item-info">
                <span class="item-name">${item.typeName}</span>
                <span class="item-meta">${item.categoryName} · ${item.count}회 · ${benefitTag}${item.publicStatsSource ? ` · ${item.publicStatsSource}` : ''}${item.publicFeeScheduleSource ? ` · ${item.publicFeeScheduleSource}` : ''}</span>
            </div>
            <button type="button" class="btn-remove" onclick="removeTestItem(${item.id})" title="제거">
                <i data-lucide="x"></i>
            </button>
        `;
        unifiedList.appendChild(div);
    });

    // B. 수술 항목 칩 렌더링
    addedSurgeries.forEach(item => {
        const div = document.createElement('div');
        div.className = 'added-item';
        const benefitTag = item.isBenefit 
            ? '<span class="badge badge-benefit">급여</span>' 
            : '<span class="badge badge-non-benefit">비급여</span>';
        const drgBadge = item.isDRG ? ' <span class="badge badge-drg">DRG</span>' : '';
        
        // UI 표시용 분류 뱃지
        const dbItem = getMedicalItemDatabase().find(db => db.code === item.type);
        const groupName = dbItem && getItemTypeGroup(dbItem) === 'procedure_hira' ? '시술' : '수술';

        div.innerHTML = `
            <div class="item-info">
                <span class="item-name">${item.typeName}${drgBadge}</span>
                <span class="item-meta">${groupName} · ${benefitTag}${item.publicStatsSource ? ` · ${item.publicStatsSource}` : ''}${item.publicFeeScheduleSource ? ` · ${item.publicFeeScheduleSource}` : ''}</span>
            </div>
            <button type="button" class="btn-remove" onclick="removeSurgeryItem(${item.id})" title="제거">
                <i data-lucide="x"></i>
            </button>
        `;
        unifiedList.appendChild(div);
    });

    // C. 처치 항목 칩 렌더링
    addedProcedures.forEach(item => {
        const div = document.createElement('div');
        div.className = 'added-item';
        const benefitTag = item.isBenefit 
            ? '<span class="badge badge-benefit">급여</span>' 
            : '<span class="badge badge-non-benefit">비급여</span>';
        
        // UI 표시용 분류 뱃지
        const dbItem = getMedicalItemDatabase().find(db => db.code === item.type);
        let groupName = '처치/치료';
        if (dbItem) {
            const group = getItemTypeGroup(dbItem);
            if (group === 'procedure_hira') groupName = '시술';
            else if (group === 'etc') groupName = '기타 처치';
        }

        div.innerHTML = `
            <div class="item-info">
                <span class="item-name">${item.typeName}</span>
                <span class="item-meta">${groupName} · ${item.count}회 · ${benefitTag}${item.publicStatsSource ? ` · ${item.publicStatsSource}` : ''}${item.publicFeeScheduleSource ? ` · ${item.publicFeeScheduleSource}` : ''}</span>
            </div>
            <button type="button" class="btn-remove" onclick="removeProcedureItem(${item.id})" title="제거">
                <i data-lucide="x"></i>
            </button>
        `;
        unifiedList.appendChild(div);
    });

    if (typeof lucide !== 'undefined') lucide.createIcons();
}

/** 검사 제거 */
function removeTestItem(id) {
    addedTests = addedTests.filter(i => i.id !== id);
    renderAddedItems();
    updateEtcAddedBadge();
    markResultStale();
}

/** 수술 제거 */
function removeSurgeryItem(id) {
    addedSurgeries = addedSurgeries.filter(i => i.id !== id);
    renderAddedItems();
    updateEtcAddedBadge();
    markResultStale();
}

/** 처치 제거 */
function removeProcedureItem(id) {
    addedProcedures = addedProcedures.filter(i => i.id !== id);
    renderAddedItems();
    updateEtcAddedBadge();
    markResultStale();
}


// =========================================================
// 7. 종별 병원 규모 실시간 모의 계산 시뮬레이터 (동작 동일 보장)
// =========================================================

/**
 * 특정 병원 규모(targetClass)에 대한 최종 환자 예상 실부담금을 모의 계산(시뮬레이션)합니다.
 * 본 함수는 calculate() 내부의 실제 계산 공식과 100% 동일하게 움직이며, 비교 테이블 출력을 위해 사용됩니다.
 */
function simulateCostForClass(targetClass) {
    const hData = DB.HOSPITAL_CLASS[targetClass];
    const treatmentType = document.querySelector('input[name="treatment_type"]:checked').value;
    const isInpatient = (treatmentType === 'inpatient');

    const roomType = document.getElementById('room_type').value;
    const stayDays = isInpatient ? (parseInt(document.getElementById('stay_days').value, 10) || 1) : 0;

    const hasInsurance = document.getElementById('has_insurance').checked;
    const insuranceGen = document.getElementById('insurance_generation').value;

    const sanjeongInfo = getSanjeongSpecialInfo();

    let patientBenefitRate = isInpatient ? hData.inpatientRate : hData.outpatientRate;
    if (sanjeongInfo) patientBenefitRate = sanjeongInfo.rate;

    let patientTotalPay = 0;
    let refundEligibleBenefit = 0;
    let refundEligibleNonBenefit = 0;
    let premiumRoomCharge = 0;
    let gasanPatientPay = 0;

    // A. 진료 기본 비용
    let basePrice = hData.baseConsult;
    let erSeverityInfo = null;
    if (treatmentType === 'er') {
        erSeverityInfo = getEmergencySeverityInfo();
        basePrice = hData.baseConsult + erSeverityInfo.price;
    }
    const basePatientPay = basePrice * patientBenefitRate;
    patientTotalPay += basePatientPay;
    refundEligibleBenefit += basePatientPay;

    // B. 입원비 및 입원 부대 비용
    if (isInpatient && stayDays > 0) {
        const stdRoomCost = hData.roomStandard * stayDays;
        const stdRoomPay = stdRoomCost * patientBenefitRate;
        patientTotalPay += stdRoomPay;
        refundEligibleBenefit += stdRoomPay;

        if (roomType === 'premium') {
            premiumRoomCharge = DB.ROOM_PREMIUM_ADD * stayDays;
            patientTotalPay += premiumRoomCharge;
        }

        for (const key in DB.INPATIENT_DAILY_EXTRAS) {
            const extra = DB.INPATIENT_DAILY_EXTRAS[key];
            const extraPay = extra.price * stayDays * patientBenefitRate;
            patientTotalPay += extraPay;
            refundEligibleBenefit += extraPay;
        }
    }

    // C. 검사 항목 연산
    if (addedTests.length > 0) {
        const benefitTests = addedTests.filter(t => t.isBenefit);
        const nonBenefitTests = addedTests.filter(t => !t.isBenefit);

        const benefitTestsSorted = [...benefitTests].sort((a, b) => b.basePrice - a.basePrice);
        benefitTestsSorted.forEach((test, idx) => {
            const discountFactor = (idx === 0) ? 1.0 : 0.5;
            const finalPrice = getBenefitChargeBase(test, hData) * discountFactor;
            const patientPay = finalPrice * patientBenefitRate * test.count;
            gasanPatientPay += getBenefitGasanPatientPay(test, hData, patientBenefitRate, discountFactor, test.count);
            patientTotalPay += patientPay;
            refundEligibleBenefit += patientPay;
        });

        nonBenefitTests.forEach(test => {
            const priceInfo = getNonBenefitBasePrice(test);
            const patientPay = priceInfo.price * test.count;
            patientTotalPay += patientPay;
            refundEligibleNonBenefit += patientPay;
        });
    }

    // D. 수술 항목 연산
    if (addedSurgeries.length > 0) {
        const addedSurgeriesSorted = [...addedSurgeries].sort((a, b) => b.basePrice - a.basePrice);
        addedSurgeriesSorted.forEach((surg, idx) => {
            if (surg.isBenefit) {
                const discountFactor = (idx === 0) ? 1.0 : 0.5;
                const finalPrice = getBenefitChargeBase(surg, hData) * discountFactor;
                let rate = patientBenefitRate;
                if (surg.type === 'c_section' || surg.type === 'SU_OB01') rate = 0; // 제왕절개 0%
                const patientPay = finalPrice * rate;
                gasanPatientPay += getBenefitGasanPatientPay(surg, hData, rate, discountFactor, 1);
                patientTotalPay += patientPay;
                refundEligibleBenefit += patientPay;
            } else {
                const priceInfo = getNonBenefitBasePrice(surg);
                const patientPay = priceInfo.price;
                patientTotalPay += patientPay;
                refundEligibleNonBenefit += patientPay;
            }
        });

        const anesthesiaEstimate = getAnesthesiaEstimate(targetClass);
        const anesthPay = anesthesiaEstimate.total * patientBenefitRate;
        patientTotalPay += anesthPay;
        refundEligibleBenefit += anesthPay;

        const maxSurgPrice = addedSurgeriesSorted[0].basePrice;
        getSurgeryAutoSupportItems(maxSurgPrice).forEach(autoItem => {
            const autoPay = autoItem.price * hData.gasanRate * patientBenefitRate;
            gasanPatientPay += getAutoGasanPatientPay(autoItem.price, hData, patientBenefitRate);
            patientTotalPay += autoPay;
            refundEligibleBenefit += autoPay;
        });
    }

    // E. 추가 처치/치료 연산
    if (addedProcedures.length > 0) {
        addedProcedures.forEach(proc => {
            if (proc.isBenefit) {
                const finalPrice = getBenefitChargeBase(proc, hData);
                const patientPay = finalPrice * patientBenefitRate * proc.count;
                gasanPatientPay += getBenefitGasanPatientPay(proc, hData, patientBenefitRate, 1, proc.count);
                patientTotalPay += patientPay;
                refundEligibleBenefit += patientPay;
            } else {
                const priceInfo = getNonBenefitBasePrice(proc);
                const patientPay = priceInfo.price * proc.count;
                patientTotalPay += patientPay;
                refundEligibleNonBenefit += patientPay;
            }
        });
    }

    // F. 실비보험 환급액 산출
    let refundTotal = 0;
    if (hasInsurance) {
        const insData = DB.INSURANCE_RATES[insuranceGen];
        if (isInpatient) {
            const benefitRefund = refundEligibleBenefit * insData.benefitRate;
            const nonBenefitRefund = refundEligibleNonBenefit * insData.nonBenefitRate;
            const roomLimit = Math.min((DB.ROOM_PREMIUM_ADD * 0.5), 100000);
            const roomRefund = (roomType === 'premium') ? roomLimit * stayDays : 0;
            refundTotal = benefitRefund + nonBenefitRefund + roomRefund;
        } else {
            const eligibleSum = (refundEligibleBenefit * insData.benefitRate) + (refundEligibleNonBenefit * insData.nonBenefitRate);
            refundTotal = Math.min(eligibleSum, DB.OUTPATIENT_LIMIT);
        }
        if (refundTotal > patientTotalPay) refundTotal = patientTotalPay;
    }

    const finalPatientPay = patientTotalPay - refundTotal;
    const minRange = Math.round(finalPatientPay * 0.85);
    const maxRange = Math.round(finalPatientPay * 1.15);
    return {
        finalCost: finalPatientPay,
        minRange,
        maxRange,
        benefitRatePercentage: Math.round(patientBenefitRate * 100)
    };
}

/** 병원 규모별 실시간 실부담금 비교 테이블 렌더링 */
function renderComparisonTable(currentClass) {
    const tableBody = document.getElementById('comparison-table-body');
    if (!tableBody) return;
    
    tableBody.innerHTML = '';
    
    const classes = ['clinic', 'hospital', 'general_hospital', 'tertiary_hospital'];
    
    classes.forEach(cls => {
        const result = simulateCostForClass(cls);
        const tr = document.createElement('tr');
        if (cls === currentClass) {
            tr.className = 'active-class';
        }
        
        const name = DB.HOSPITAL_CLASS[cls].name;
        tr.innerHTML = `
            <td>${name} ${cls === currentClass ? ' (선택됨)' : ''}</td>
            <td>본인부담 ${result.benefitRatePercentage}%</td>
            <td class="text-right">${formatNumber(result.minRange)}원 ~ ${formatNumber(result.maxRange)}원</td>
        `;
        tableBody.appendChild(tr);
    });
}


// =========================================================
// 8. 핵심 계산 엔진 (종별가산, 본인부담금, 실비 환급 계산 및 명세서 렌더링)
// =========================================================
function calculate() {
    updateResultButtonState();
    if (!resultRequested || !isCalculationReady()) {
        resetResultView();
        return null;
    }

    // [1] 입력 폼 요소 값 획득 및 맵핑
    const hospitalClass = document.querySelector('input[name="hospital_class"]:checked').value;
    const treatmentType = document.querySelector('input[name="treatment_type"]:checked').value;
    const hData = DB.HOSPITAL_CLASS[hospitalClass];
    const isInpatient = (treatmentType === 'inpatient');

    const roomType = document.getElementById('room_type').value;
    const stayDays = isInpatient ? (parseInt(document.getElementById('stay_days').value, 10) || 1) : 0;

    const hasInsurance = document.getElementById('has_insurance').checked;
    const insuranceGen = document.getElementById('insurance_generation').value;

    // 산정특례 적용 여부 감지
    const sanjeongInfo = getSanjeongSpecialInfo();

    // 기본 건강보험 환자 본인부담 비율 적용
    let patientBenefitRate = isInpatient ? hData.inpatientRate : hData.outpatientRate;
    if (sanjeongInfo) patientBenefitRate = sanjeongInfo.rate;

    // 제왕절개 분만 수술 여부 감지 (2025년부터 법 개정으로 급여 본인부담금 0% 적용)
    const hasCsection = addedSurgeries.some(s => s.type === 'c_section' || s.type === 'SU_OB01');

    // 계산용 로컬 변수 초기화
    let patientTotalPay = 0;           // 환자가 최종 병원에 납부해야 할 수납 금액 총합
    let refundEligibleBenefit = 0;     // 실비보험 환급 대상 급여액
    let refundEligibleNonBenefit = 0;  // 실비보험 환급 대상 비급여액
    let premiumRoomCharge = 0;         // 상급병실 비급여 차액
    let gasanPatientPay = 0;           // hospital class add-on patient share
    const breakdown = [];              // detail rows
    let hasDRG = false;                // 포괄수가제 대상 여부 플래그

    // ──────────────────────────────────────────
    // A. 진료 기본 비용 (기본진찰료 or 응급의료 관리료)
    // ──────────────────────────────────────────
    let basePrice = hData.baseConsult;
    let baseLabel = "일반 진찰료 (기본 진료비)";
    let erSeverityInfo = null;
    if (treatmentType === 'er') {
        erSeverityInfo = getEmergencySeverityInfo();
        basePrice = hData.baseConsult + erSeverityInfo.price;
        baseLabel = `응급실 진료비 (${erSeverityInfo.name})`;
    }
    const basePatientPay = basePrice * patientBenefitRate;
    patientTotalPay += basePatientPay;
    refundEligibleBenefit += basePatientPay;
    breakdown.push({ name: `${hData.name} - ${baseLabel}`, type: "benefit", price: basePatientPay });

    const diseaseCodeInput = document.getElementById('disease_code_input')?.value || '';
    const diseaseStats = getDiseaseStatistics(diseaseCodeInput, treatmentType);
    const hasSpecificSelectedItems = addedTests.length + addedSurgeries.length + addedProcedures.length > 0;
    if (diseaseStats && !hasSpecificSelectedItems) {
        const diseaseAverageTotal = diseaseStats.stat.avgTotalPerCase || diseaseStats.stat.avgTotalPerPatient || 0;
        const diseasePatientPay = Math.max(0, (diseaseAverageTotal * patientBenefitRate) - basePatientPay);
        if (diseasePatientPay > 0) {
            patientTotalPay += diseasePatientPay;
            refundEligibleBenefit += diseasePatientPay;
            breakdown.push({
                name: `상병코드 ${diseaseStats.code} ${diseaseStats.visitType} 평균 진료비 반영(2024 공공데이터)`,
                type: "benefit",
                price: diseasePatientPay
            });
        }
    }

    // ──────────────────────────────────────────
    // B. 입원비 및 입원 부대 부대비용 자동 산정
    // ──────────────────────────────────────────
    if (isInpatient && stayDays > 0) {
        // B-1. 기본 입원실료 (급여 적용)
        const stdRoomCost = hData.roomStandard * stayDays;
        const stdRoomPay = stdRoomCost * patientBenefitRate;
        patientTotalPay += stdRoomPay;
        refundEligibleBenefit += stdRoomPay;
        breakdown.push({ name: `기본 입원실료 (${stayDays}박)`, type: "benefit", price: stdRoomPay });

        // B-2. 상급병실료 차액 (비급여 100% 본인 부담)
        if (roomType === 'premium') {
            premiumRoomCharge = DB.ROOM_PREMIUM_ADD * stayDays;
            patientTotalPay += premiumRoomCharge;
            breakdown.push({ name: `상급병실(1~2인실) 차액 비급여 (${stayDays}박)`, type: "non-benefit", price: premiumRoomCharge });
        }

        // B-3. 입원 시 주사/처치/식대 자동 추정 산정 (사용자 피로도 경감용 기본세팅)
        for (const key in DB.INPATIENT_DAILY_EXTRAS) {
            const extra = DB.INPATIENT_DAILY_EXTRAS[key];
            const extraPay = extra.price * stayDays * patientBenefitRate;
            patientTotalPay += extraPay;
            refundEligibleBenefit += extraPay;
            // 아코디언 명세서에만 렌더링하기 위한 플래그 추가
            breakdown.push({ name: `[자동산정] ${extra.name} (${stayDays}일)`, type: "benefit", price: extraPay, isAuto: true });
        }
    }

    // ──────────────────────────────────────────
    // C. 검사 항목 연산 (다부위 동시 촬영/검사 시 50% 감산 규칙 반영)
    // ──────────────────────────────────────────
    if (addedTests.length > 0) {
        const benefitTests = addedTests.filter(t => t.isBenefit);
        const nonBenefitTests = addedTests.filter(t => !t.isBenefit);

        // 급여 검사 항목은 단가 기준 내림차순 정렬 후, 두 번째 항목부터 50% 감산
        benefitTests.sort((a, b) => b.basePrice - a.basePrice);
        benefitTests.forEach((test, idx) => {
            const discountFactor = (idx === 0) ? 1.0 : 0.5; // 주검사 100%, 부검사 50%
            const finalPrice = getBenefitChargeBase(test, hData) * discountFactor;
            const patientPay = finalPrice * patientBenefitRate * test.count;
            gasanPatientPay += getBenefitGasanPatientPay(test, hData, patientBenefitRate, discountFactor, test.count);
            patientTotalPay += patientPay;
            refundEligibleBenefit += patientPay;
            let label = `${test.typeName} (${test.count}회)`;
            if (idx > 0) label += " [다부위 검사 감산 50%]";
            breakdown.push({ name: label, type: "benefit", price: patientPay });
        });

        // 비급여 검사는 수가 전액 환자 부담
        nonBenefitTests.forEach(test => {
            const priceInfo = getNonBenefitBasePrice(test);
            const patientPay = priceInfo.price * test.count;
            patientTotalPay += patientPay;
            refundEligibleNonBenefit += patientPay;
            breakdown.push({ name: `${test.typeName}${priceInfo.labelSuffix} (${test.count}회)`, type: "non-benefit", price: patientPay });
        });
    }

    // ──────────────────────────────────────────
    // D. 수술 항목 연산 (동시 수술 시 주수술 100%, 부수술 50% 감산 적용)
    // ──────────────────────────────────────────
    if (addedSurgeries.length > 0) {
        // 단가 기준 내림차순 정렬
        addedSurgeries.sort((a, b) => b.basePrice - a.basePrice);
        addedSurgeries.forEach((surg, idx) => {
            if (surg.isDRG) hasDRG = true; // 7대 질병군 포괄수가제 경고 활성화

            if (surg.isBenefit) {
                const discountFactor = (idx === 0) ? 1.0 : 0.5; // 주수술 100%, 부수술 50%
                const finalPrice = getBenefitChargeBase(surg, hData) * discountFactor;
                let rate = patientBenefitRate;
                
                // 제왕절개 분만 수술일 경우 본인부담금 면제 (0%)
                if (surg.type === 'c_section' || surg.type === 'SU_OB01') rate = 0;
                
                const patientPay = finalPrice * rate;
                gasanPatientPay += getBenefitGasanPatientPay(surg, hData, rate, discountFactor, 1);
                patientTotalPay += patientPay;
                refundEligibleBenefit += patientPay;
                let label = surg.typeName;
                if (idx > 0) label += " [동시 수술 감산 50%]";
                if (surg.type === 'c_section' || surg.type === 'SU_OB01') label += " [산모 본인부담 0% 면제]";
                breakdown.push({ name: label, type: "benefit", price: patientPay });
            } else {
                // 비급여 수술
                const priceInfo = getNonBenefitBasePrice(surg);
                const patientPay = priceInfo.price;
                patientTotalPay += patientPay;
                refundEligibleNonBenefit += patientPay;
                breakdown.push({ name: `${surg.typeName}${priceInfo.labelSuffix}`, type: "non-benefit", price: patientPay });
            }
        });

        const anesthesiaEstimate = getAnesthesiaEstimate(hospitalClass);
        anesthesiaEstimate.episodes.forEach(episode => {
            const anesthPay = episode.total * patientBenefitRate;
            patientTotalPay += anesthPay;
            refundEligibleBenefit += anesthPay;
            const notes = [
                `${episode.durationMinutes}분`,
                episode.ageMultiplier > 1 ? `연령 가산 ${Math.round((episode.ageMultiplier - 1) * 100)}%` : '',
                episode.sedationNote
            ].filter(Boolean).join(' · ');
            breakdown.push({
                name: `[자동산정] ${episode.label} (${notes})`,
                type: "benefit",
                price: anesthPay,
                isAuto: true
            });
        });

        const maxSurgPrice = addedSurgeries[0].basePrice;
        getSurgeryAutoSupportItems(maxSurgPrice).forEach(autoItem => {
            const autoPay = autoItem.price * hData.gasanRate * patientBenefitRate;
            gasanPatientPay += getAutoGasanPatientPay(autoItem.price, hData, patientBenefitRate);
            patientTotalPay += autoPay;
            refundEligibleBenefit += autoPay;
            breakdown.push({ name: `[자동산정] ${autoItem.name}`, type: "benefit", price: autoPay, isAuto: true });
        });
    }

    // ──────────────────────────────────────────
    // E. 추가 처치/치료 연산 (수동으로 직접 넣은 처치, 재활 등)
    // ──────────────────────────────────────────
    if (addedProcedures.length > 0) {
        addedProcedures.forEach(proc => {
            if (proc.isBenefit) {
                const finalPrice = getBenefitChargeBase(proc, hData);
                const patientPay = finalPrice * patientBenefitRate * proc.count;
                gasanPatientPay += getBenefitGasanPatientPay(proc, hData, patientBenefitRate, 1, proc.count);
                patientTotalPay += patientPay;
                refundEligibleBenefit += patientPay;
                breakdown.push({ name: `${proc.typeName} (${proc.count}회)`, type: "benefit", price: patientPay });
            } else {
                const priceInfo = getNonBenefitBasePrice(proc);
                const patientPay = priceInfo.price * proc.count;
                patientTotalPay += patientPay;
                refundEligibleNonBenefit += patientPay;
                breakdown.push({ name: `${proc.typeName}${priceInfo.labelSuffix} (${proc.count}회)`, type: "non-benefit", price: patientPay });
            }
        });
    }

    // ──────────────────────────────────────────
    // F. 실비보험(실손보험) 가입 세대별 환급액 산출
    // ──────────────────────────────────────────
    let refundTotal = 0;
    if (hasInsurance) {
        const insData = DB.INSURANCE_RATES[insuranceGen];
        
        // F-1. 입원 치료 실비 적용 (급여/비급여 각각 비례 환급 + 상급병실 차액 한도 보장)
        if (isInpatient) {
            const benefitRefund = refundEligibleBenefit * insData.benefitRate;
            const nonBenefitRefund = refundEligibleNonBenefit * insData.nonBenefitRate;
            // 상급병실 차액 보장: 차액의 50%를 일당 최대 10만 원 한도로 보장
            const roomLimit = Math.min((DB.ROOM_PREMIUM_ADD * 0.5), 100000);
            const roomRefund = (roomType === 'premium') ? roomLimit * stayDays : 0;
            refundTotal = benefitRefund + nonBenefitRefund + roomRefund;
        } 
        // F-2. 통원(외래) 치료 실비 적용 (하루 외래 한도 25만 원 상한 규정 적용)
        else {
            const eligibleSum = (refundEligibleBenefit * insData.benefitRate) + (refundEligibleNonBenefit * insData.nonBenefitRate);
            refundTotal = Math.min(eligibleSum, DB.OUTPATIENT_LIMIT);
        }
        // 환급액은 환자 실부담금을 초과할 수 없음
        if (refundTotal > patientTotalPay) refundTotal = patientTotalPay;
    }

    // 환자 실부담금 산정 및 예상 가격 변차 범위 (신뢰구간 ±15%)
    const finalPatientPay = patientTotalPay - refundTotal;
    const minRange = Math.round(finalPatientPay * 0.85);
    const maxRange = Math.round(finalPatientPay * 1.15);

    // ──────────────────────────────────────────
    // G. 화면(UI) 최종 값 매핑 렌더링
    // ──────────────────────────────────────────
    if (gasanPatientPay > 0) {
        const gasanInfo = getHospitalGasanInfo(hData);
        breakdown.unshift({
            name: `${gasanInfo.label} 자동 반영분(급여 항목에 이미 포함)`,
            type: "gasan",
            price: gasanPatientPay
        });
    }

    document.getElementById('display_total_cost').innerText = formatNumber(patientTotalPay);
    const gasanCostEl = document.getElementById('display_gasan_cost');
    const gasanLabelEl = document.getElementById('display_gasan_label');
    const gasanInfo = getHospitalGasanInfo(hData);
    if (gasanCostEl) gasanCostEl.innerText = formatNumber(gasanPatientPay);
    if (gasanLabelEl) gasanLabelEl.innerText = `${gasanInfo.label}를 급여 검사·시술·수술과 자동 산정 항목에 포함했습니다.`;
    document.getElementById('display_refund_cost').innerText = formatNumber(refundTotal);
    document.getElementById('display_final_cost').innerText = formatNumber(finalPatientPay);
    document.getElementById('display_cost_range').innerText = `${formatNumber(minRange)}원 ~ ${formatNumber(maxRange)}원`;
    document.getElementById('result_insurance_box')?.classList.toggle('hidden', !(hasInsurance && refundTotal > 0));
    renderResultInsights(breakdown, patientTotalPay, { hasInsurance, diseaseStats, hasSpecificSelectedItems });

    // 산정특례/상병코드 안내 토글
    const sanjeongNotice = document.getElementById('sanjeong-notice');
    if (sanjeongNotice) {
        const isSanjeongApplied = Boolean(sanjeongInfo);
        const isDiseaseAvgApplied = Boolean(diseaseStats && !hasSpecificSelectedItems);
        if (isSanjeongApplied || isDiseaseAvgApplied) {
            sanjeongNotice.classList.remove('hidden');
        } else {
            sanjeongNotice.classList.add('hidden');
        }
    }

    // DRG 포괄수가제 대상 수술 포함 시 경고 메시지 출력 토글
    const drgNotice = document.getElementById('drg-notice');
    if (drgNotice) {
        if (hasDRG) {
            drgNotice.classList.remove('hidden');
        } else {
            drgNotice.classList.add('hidden');
        }
    }

    // 세부 산출 내역 명세서 테이블 동적 빌드
    const tableBody = document.getElementById('cost-table-body');
    tableBody.innerHTML = '';
    
    if (breakdown.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="3" style="padding:1.5rem; color:var(--text-muted); text-align:center;">등록된 치료 및 검사 내역이 없습니다.</td></tr>';
    } else {
        breakdown.forEach(item => {
            const row = document.createElement('tr');
            const badge = item.type === "gasan"
                ? '<span class="badge badge-benefit">\uc885\ubcc4\uac00\uc0b0</span>'
                : item.type === "benefit"
                    ? '<span class="badge badge-benefit">\uae09\uc5ec</span>'
                    : '<span class="badge badge-non-benefit">\ube44\uae09\uc5ec</span>';
            row.innerHTML = `
                <td>${escapeHtml(item.name)}</td>
                <td>${badge}</td>
                <td class="text-right">${formatNumber(item.price)}원</td>`;
            tableBody.appendChild(row);
        });

        // 실비 환급을 받았을 경우 환급 차감 라인 추가
        if (hasInsurance && refundTotal > 0) {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td style="color:var(--success);font-weight:700;">실비보험 예상 환급 차감액</td>
                <td><span class="badge badge-benefit" style="background:rgba(16,185,129,0.1);color:var(--success);border-color:rgba(16,185,129,0.2);">환급</span></td>
                <td class="text-right" style="color:var(--success);font-weight:700;">-${formatNumber(refundTotal)}원</td>`;
            tableBody.appendChild(row);
        }
    }

    // 실시간 종별 병원 규모 비교 테이블 렌더링 호출
    renderComparisonTable(hospitalClass);
    updateResultButtonState();

    sendCalculationLog({
        hospitalClass,
        treatmentType,
        nonBenefitRegion: getSelectedNonBenefitRegion(),
        stayDaysBucket: stayDays > 7 ? '8_or_more' : String(Math.max(0, stayDays)),
        hasInsurance,
        finalCostBucket: finalPatientPay < 50000 ? 'under_50k' : finalPatientPay < 200000 ? '50k_to_199k' : '200k_or_more'
    });
    if (typeof window.trackGAEvent === 'function') {
        window.trackGAEvent('calculator_complete', {
            hospital_class: hospitalClass,
            treatment_type: treatmentType,
            has_insurance: hasInsurance ? 'yes' : 'no',
            final_cost_bucket: finalPatientPay < 50000 ? 'under_50k' : finalPatientPay < 200000 ? '50k_to_199k' : '200k_or_more',
            page_path: window.location.pathname
        });
    }
}

// =========================================================
// 8. 신규 추가: 주상병코드 토글 및 3단계 연쇄 직접 선택 제어
// =========================================================

function toggleDiseaseCodeSection() {
    const hasDisease = document.getElementById('has_disease_code').checked;
    const details = document.getElementById('disease_code_details');
    const input = document.getElementById('disease_code_input');
    
    if (hasDisease) {
        details.classList.remove('hidden');
    } else {
        details.classList.add('hidden');
        if (input) {
            input.value = '';
        }
        calculate();
    }
}

// 3단계 분류 매핑 데이터
const MAIN_CAT_LABELS = {
    test: "검사",
    procedure_hira: "시술",
    surgery: "수술",
    etc: "기타 처치"
};

const SUB_CAT_LABELS = {
    test: {
        imaging: "영상검사",
        specimen: "검체검사",
        functional: "기능검사",
        endoscopy: "내시경검사"
    },
    procedure_hira: {
        cardiovascular: "뇌/심혈관 시술",
        dental: "치과 시술",
        general_proc: "일반 시술/처치"
    },
    surgery: {
        neuro: "뇌/신경 수술",
        eye_ent: "안과/이비인후과 수술",
        chest: "흉부/심혈관 수술",
        abdomen: "복부/소화기 수술",
        urology_ob: "비뇨기/산부인과 수술",
        ortho: "정형외과 수술"
    },
    etc: {
        anesthesia: "마취료",
        injection: "수액/주사제",
        rehab: "물리/재활치료",
        korean: "한방치료",
        other: "기타 보조처치"
    }
};

const DETAIL_CAT_LABELS = {
    imaging: {
        xray: "일반 X-ray 촬영",
        ct: "전산화단층촬영 (CT)",
        mri: "자기공명영상 (MRI)",
        ultrasound: "초음파 검사",
        angio: "조영검사 (Angio)",
        special: "기타 특수/핵의학 검사"
    },
    specimen: {
        blood: "일반 혈액/혈액형 검사",
        chemistry: "생화학/간·신기능/지질 검사",
        tumor: "종양표지자 (암 수치)",
        urine: "요경검/소변 검사"
    },
    functional: {
        cardio: "심장기능 (심전도/홀터)",
        neuro: "뇌/신경/근전도 검사",
        sleep: "수면다원검사 (PSG)",
        respiratory: "폐기능 검사",
        sensory: "청력/안구 검사"
    },
    endoscopy: {
        gastro: "위내시경 검사",
        colono: "대장내시경 검사",
        etc: "내시경 처치/마취 추가"
    }
};





// 인기 검색어 동적 노출 기능
let popularSearches = [];

async function loadPopularSearches() {
    try {
        const res = await fetch('/api/top-searches');
        if (res.ok) {
            const data = await res.json();
            if (data && data.ok && Array.isArray(data.topSearches)) {
                popularSearches = data.topSearches;
            }
        }
    } catch (e) {
        console.error("인기 검색어 로드 실패", e);
    }
}

// =========================================================
// 9. 신규 통합 오버라이드: 3단계 계층 분류, 실시간 KCD/수가 통합 검색 및 탭 연동 엔진
// =========================================================

function switchTab(tabId) {
    activeTab = tabId;
    
    // 탭 버튼 active 클래스 전환 적용
    document.querySelectorAll('.category-tabs .tab-btn').forEach(btn => {
        if (btn.getAttribute('data-tab') === tabId) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
    
    // 3단계 직접 선택 드롭다운 연동
    const mainSelect = document.getElementById('main-category-select');
    if (mainSelect) {
        mainSelect.value = tabId;
        handleMainCategoryChange();
    }
    
    // 하단 추천 검색어 키워드 칩 목록 갱신
    renderRecommendChips(tabId);
    
    // 검색 입력값 및 검색 결과 목록 초기화
    const searchInput = document.getElementById('category-search-input');
    const btnClear = document.getElementById('btn-clear-category-search');
    const resultsList = document.getElementById('category-search-results');
    const btnRun = document.getElementById('btn-run-category-search');
    
    if (searchInput) searchInput.value = '';
    if (btnClear) btnClear.classList.add('hidden');
    if (btnRun) {
        btnRun.disabled = true;
        btnRun.classList.remove('active');
    }
    if (resultsList) {
        resultsList.innerHTML = '';
        resultsList.classList.add('hidden');
    }
}

function addKcdDisease(code, name) {
    const hasDiseaseCheck = document.getElementById('has_disease_code');
    const diseaseDetails = document.getElementById('disease_code_details');
    const diseaseInput = document.getElementById('disease_code_input');

    if (hasDiseaseCheck) {
        hasDiseaseCheck.checked = true;
    }
    if (diseaseDetails) {
        diseaseDetails.classList.remove('hidden');
    }
    if (diseaseInput) {
        diseaseInput.value = code;
    }
    handleCalculatorInputChange();
}

function initSearchEvents() {
    // A. 대분류 탭 검색창 리스너 바인딩
    const categorySearchInput = document.getElementById('category-search-input');
    const categoryResultsList = document.getElementById('category-search-results');
    const btnClearCategory = document.getElementById('btn-clear-category-search');
    const btnRunCategory = document.getElementById('btn-run-category-search');
    
    if (categorySearchInput && categoryResultsList) {
        categorySearchInput.addEventListener('input', (e) => {
            const query = e.target.value.trim();
            updateSearchControlState(categorySearchInput, btnClearCategory, btnRunCategory);
            if (query.length > 0) {
                performSearch(query, activeTab, { logSearch: false });
            } else {
                categoryResultsList.innerHTML = '';
                categoryResultsList.classList.add('hidden');
            }
        });

        categorySearchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                executeSearchFromInput(categorySearchInput, activeTab);
            }
        });
        
        if (btnClearCategory) {
            btnClearCategory.addEventListener('click', (e) => {
                e.stopPropagation();
                categorySearchInput.value = '';
                updateSearchControlState(categorySearchInput, btnClearCategory, btnRunCategory);
                categoryResultsList.innerHTML = '';
                categoryResultsList.classList.add('hidden');
                categorySearchInput.focus();
            });
        }

        if (btnRunCategory) {
            btnRunCategory.addEventListener('click', (e) => {
                e.stopPropagation();
                executeSearchFromInput(categorySearchInput, activeTab);
            });
        }
    }

    // B. 기타 처치 검색창 리스너 바인딩
    const etcSearchInput = document.getElementById('etc-search-input');
    const etcResultsList = document.getElementById('etc-search-results');
    const btnClearEtc = document.getElementById('btn-clear-etc-search');
    const btnRunEtc = document.getElementById('btn-run-etc-search');
    
    if (etcSearchInput && etcResultsList) {
        etcSearchInput.addEventListener('input', (e) => {
            const query = e.target.value.trim();
            updateSearchControlState(etcSearchInput, btnClearEtc, btnRunEtc);
            if (query.length > 0) {
                performSearch(query, 'etc', { logSearch: false });
            } else {
                etcResultsList.innerHTML = '';
                etcResultsList.classList.add('hidden');
            }
        });

        etcSearchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                executeSearchFromInput(etcSearchInput, 'etc');
            }
        });
        
        if (btnClearEtc) {
            btnClearEtc.addEventListener('click', (e) => {
                e.stopPropagation();
                etcSearchInput.value = '';
                updateSearchControlState(etcSearchInput, btnClearEtc, btnRunEtc);
                etcResultsList.innerHTML = '';
                etcResultsList.classList.add('hidden');
                etcSearchInput.focus();
            });
        }

        if (btnRunEtc) {
            btnRunEtc.addEventListener('click', (e) => {
                e.stopPropagation();
                executeSearchFromInput(etcSearchInput, 'etc');
            });
        }
    }

    // C. 주상병코드(KCD) 실시간 검색 및 자동완성
    const diseaseInput = document.getElementById('disease_code_input');
    const diseaseResultsList = document.getElementById('disease-search-results');
    
    if (diseaseInput && diseaseResultsList) {
        diseaseInput.addEventListener('input', (e) => {
            const query = e.target.value.trim().toLowerCase();
            if (query.length > 0) {
                const cleanQuery = query.replace(/\s+/g, '');
                
                // 1. 다빈도 혹은 로드된 KCD 데이터베이스 매칭
                const dbToSearch = (ALL_KCD_DATABASE && ALL_KCD_DATABASE.length > 0) ? ALL_KCD_DATABASE : KCD_DATABASE;
                let matched = dbToSearch.filter(item => {
                    if (item.code.toLowerCase().includes(cleanQuery)) return true;
                    if (item.name.toLowerCase().replace(/\s+/g, '').includes(cleanQuery)) return true;
                    if (item.name_en && item.name_en.toLowerCase().replace(/\s+/g, '').includes(cleanQuery)) return true;
                    if (item.keywords && item.keywords.some(k => k.toLowerCase().replace(/\s+/g, '').includes(cleanQuery))) return true;
                    return false;
                });
                
                // 2. KCD 상병코드 형태(예: I63, M51, A09 등 영문1자+숫자2~3자)를 직접 친 경우
                //    일치하는 질병 정보가 없다면 가상의 직접 지정 상병 아이템을 자동완성 처음에 생성
                const kcdPattern = /^[a-z][0-9]{2,3}$/i;
                if (kcdPattern.test(cleanQuery)) {
                    const exactMatch = matched.some(item => item.code.toLowerCase() === cleanQuery);
                    if (!exactMatch) {
                        matched.unshift({
                            code: query.toUpperCase(),
                            name: `상병코드 ${query.toUpperCase()} (직접 입력)`,
                            keywords: [query]
                        });
                    }
                }
                
                diseaseResultsList.innerHTML = '';
                if (matched.length === 0) {
                    diseaseResultsList.innerHTML = '<div style="padding: 8px; color: var(--text-muted); font-size: 12px; text-align: center;">매칭되는 질병명이 없습니다.</div>';
                } else {
                    // 상위 50개 항목 제한
                    const limitMatched = matched.slice(0, 50);
                    limitMatched.forEach(item => {
                        const btn = document.createElement('button');
                        btn.type = 'button';
                        btn.className = 'search-result-item';
                        btn.style.width = '100%';
                        btn.style.textAlign = 'left';
                        btn.style.padding = '8px 12px';
                        btn.style.border = 'none';
                        btn.style.background = 'none';
                        btn.style.cursor = 'pointer';
                        
                        const displayName = item.name_en ? `${item.name} (${item.name_en})` : item.name;
                        btn.innerHTML = `
                            <div style="display: flex; justify-content: space-between; font-size: 13px; width: 100%;">
                                <span><span class="badge" style="padding: 1px 4px; font-size: 10px; margin-right: 5px; background: #3b82f6; color: white;">질병</span><strong>${displayName}</strong></span>
                                <span style="color: var(--text-muted); font-weight: 600;">코드: ${item.code}</span>
                            </div>
                        `;
                        
                        btn.addEventListener('click', () => {
                            diseaseInput.value = item.code;
                            diseaseResultsList.innerHTML = '';
                            diseaseResultsList.classList.add('hidden');
                            handleCalculatorInputChange();
                        });
                        diseaseResultsList.appendChild(btn);
                    });
                }
                diseaseResultsList.classList.remove('hidden');
            } else {
                diseaseResultsList.innerHTML = '';
                diseaseResultsList.classList.add('hidden');
            }
        });
    }
    
    // D. 드롭다운 바깥 영역 클릭 시 검색창 드롭다운 레이어 닫기
    document.addEventListener('click', (e) => {
        if (categorySearchInput && categoryResultsList && !categorySearchInput.contains(e.target) && !categoryResultsList.contains(e.target)) {
            categoryResultsList.innerHTML = '';
            categoryResultsList.classList.add('hidden');
        }
        if (etcSearchInput && etcResultsList && !etcSearchInput.contains(e.target) && !etcResultsList.contains(e.target)) {
            etcResultsList.innerHTML = '';
            etcResultsList.classList.add('hidden');
        }
        if (diseaseInput && diseaseResultsList && !diseaseInput.contains(e.target) && !diseaseResultsList.contains(e.target)) {
            diseaseResultsList.innerHTML = '';
            diseaseResultsList.classList.add('hidden');
        }
    });
}

function performSearch(query, targetGroup, options = {}) {
    const resultsList = targetGroup === 'etc' 
        ? document.getElementById('etc-search-results')
        : document.getElementById('category-search-results');
        
    if (!resultsList) return;
    
    // 1단계: 전체 DB에서 수가 항목 매칭
    let matched = getMedicalItemDatabase().filter(item => isMatch(query, item) && !isEmergencyManagementItem(item));
    
    // 2단계: KCD 질환 매칭 데이터도 검색 결과에 통합하여 함께 렌더링 (통합검색 실현)
    let matchedKcd = KCD_DATABASE.filter(item => {
        const cleanQuery = query.replace(/\s+/g, '').toLowerCase();
        if (item.code.toLowerCase().includes(cleanQuery)) return true;
        if (item.name.toLowerCase().replace(/\s+/g, '').includes(cleanQuery)) return true;
        if (item.keywords && item.keywords.some(k => k.toLowerCase().replace(/\s+/g, '').includes(cleanQuery))) return true;
        return false;
    }).map(item => ({
        ...item,
        isKcd: true, // KCD 질병 객체임을 마킹
        price: 0,
        isBenefit: true
    }));
    
    // 3단계: KCD 질병과 수가 목록을 합친다 (KCD 질병 우선 노출)
    let combinedResults = [...matchedKcd, ...matched];

    if (options.logSearch) {
        sendSearchLog(query, matched.length);
    }
    
    resultsList.innerHTML = '';
    
    // 매칭 결과가 없을 때
    if (combinedResults.length === 0) {
        const emptyDiv = document.createElement('div');
        emptyDiv.className = 'empty-search-results';
        emptyDiv.innerHTML = `
            <i data-lucide="search"></i>
            <p>'<strong>${query}</strong>'에 매칭되는 항목이 없습니다.</p>
            <span style="font-size:0.75rem; color:var(--text-muted);">부위나 오타를 확인하거나, 다른 검색어로 시도해보세요.</span>
        `;
        resultsList.appendChild(emptyDiv);
    } 
    // 매칭 결과가 있을 때 최대 15개 렌더링
    else {
        const limitResults = combinedResults.slice(0, 15);
        limitResults.forEach(item => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'search-result-item';
            
            if (item.isKcd) {
                // KCD 상병코드 질병인 경우 렌더링 방식
                const categoryBadge = `<span class="badge" style="padding: 0.15rem 0.35rem; font-size: 0.68rem; margin-right: 0.4rem; background: #3b82f6; color: white;">질병</span>`;
                btn.innerHTML = `
                    <div class="search-result-info" style="text-align: left;">
                        <span class="search-result-name">${categoryBadge}${item.name}</span>
                        <span class="search-result-keywords">상병코드: ${item.code} (선택 시 평균 진료비 자동 연동)</span>
                    </div>
                    <div class="search-result-meta">
                        <span class="btn-result-add" style="color: #3b82f6;"><i data-lucide="check" style="width:12px; height:12px; display:inline-block; vertical-align:middle;"></i> 적용</span>
                    </div>
                `;
                
                btn.addEventListener('click', () => {
                    addKcdDisease(item.code, item.name);
                    
                    const searchInput = targetGroup === 'etc' 
                        ? document.getElementById('etc-search-input')
                        : document.getElementById('category-search-input');
                        
                    const btnClear = targetGroup === 'etc'
                        ? document.getElementById('btn-clear-etc-search')
                        : document.getElementById('btn-clear-category-search');

                    const btnRun = targetGroup === 'etc'
                        ? document.getElementById('btn-run-etc-search')
                        : document.getElementById('btn-run-category-search');
                        
                    if (searchInput) searchInput.value = '';
                    if (searchInput) updateSearchControlState(searchInput, btnClear, btnRun);
                    resultsList.innerHTML = '';
                    resultsList.classList.add('hidden');
                    if (searchInput) searchInput.focus();
                });
            } else {
                // 일반 수가 항목인 경우 렌더링 방식
                const groupLabels = {
                    test: '검사',
                    procedure_hira: '시술',
                    surgery: '수술',
                    etc: '기타'
                };
                const itemGroup = getItemTypeGroup(item);
                
                const categoryBadge = `<span class="badge badge-benefit" style="padding: 0.15rem 0.35rem; font-size: 0.68rem; margin-right: 0.4rem;">${groupLabels[itemGroup] || itemGroup}</span>`;
                const benefitBadge = item.isBenefit 
                    ? '<span class="badge badge-benefit" style="font-size: 0.65rem;">급여</span>' 
                    : '<span class="badge badge-non-benefit" style="font-size: 0.65rem;">비급여</span>';
                const drgBadge = item.isDRG ? '<span class="badge badge-drg">DRG</span>' : '';
                
                // 영어 동의어 표시 보강 (PICC, TFCA 등 영문 약어를 공식 명칭 옆에 자동 병기)
                let nameSuffix = '';
                if (item.keywords) {
                    const englishKeywords = item.keywords.filter(k => /^[a-z0-9\s\-]+$/i.test(k) && k.length >= 2 && k.length <= 15);
                    const nameLower = item.name.toLowerCase();
                    const missingEng = englishKeywords.filter(k => !nameLower.includes(k.toLowerCase()));
                    if (missingEng.length > 0) {
                        nameSuffix = ` (${missingEng[0].toUpperCase()})`;
                    }
                }
                const displayName = item.name + nameSuffix;
                const keywordSnippet = item.keywords ? item.keywords.slice(0, 4).join(', ') : '';
                
                btn.innerHTML = `
                    <div class="search-result-info">
                        <span class="search-result-name">${categoryBadge}${displayName}${drgBadge}</span>
                        <span class="search-result-keywords">동의어: ${keywordSnippet}</span>
                    </div>
                    <div class="search-result-meta">
                        <span class="search-result-price">${formatNumber(item.price)}원</span>
                        ${benefitBadge}
                        <span class="btn-result-add"><i data-lucide="plus" style="width:12px; height:12px;"></i> 추가</span>
                    </div>
                `;
                
                // 검색 결과 항목 선택(클릭) 이벤트
                btn.addEventListener('click', () => {
                    addHiraItem(item);
                    
                    // 입력창 및 결과 목록 클리어
                    const searchInput = targetGroup === 'etc' 
                        ? document.getElementById('etc-search-input')
                        : document.getElementById('category-search-input');
                        
                    const btnClear = targetGroup === 'etc'
                        ? document.getElementById('btn-clear-etc-search')
                        : document.getElementById('btn-clear-category-search');

                    const btnRun = targetGroup === 'etc'
                        ? document.getElementById('btn-run-etc-search')
                        : document.getElementById('btn-run-category-search');
                        
                    if (searchInput) searchInput.value = '';
                    if (searchInput) updateSearchControlState(searchInput, btnClear, btnRun);
                    resultsList.innerHTML = '';
                    resultsList.classList.add('hidden');
                    if (searchInput) searchInput.focus();
                });
            }
            
            resultsList.appendChild(btn);
        });
    }
    
    resultsList.classList.remove('hidden');
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

// 3단계 정밀 규칙 분류 헬퍼 함수 (심평원 고시 분류 EDI 코드 분석 포함 대폭 개편)
function getHierarchicalClassification(item) {
    let main = getItemTypeGroup(item);
    let sub = '';
    let detail = 'all';

    const name = item.name || '';
    const lowerName = name.toLowerCase();
    const code = (item.publicActionCode || item.actionCode || item.ediCode || item.code || '').toUpperCase();

    // 임상적 직관을 감안해 PICC, 케모포트 등 중심정맥관 관련 침습적 처치는 시술(procedure_hira)로 강제 분류
    if (
        lowerName.includes('picc') || 
        lowerName.includes('중심정맥') || 
        lowerName.includes('포트') || 
        lowerName.includes('히크만') || 
        lowerName.includes('카테터') || 
        lowerName.includes('chemoport') || 
        lowerName.includes('hickman') ||
        code.startsWith('O707')
    ) {
        main = 'procedure_hira';
    }

    if (main === 'test') {
        // 검사 대분류 (imaging, specimen, endoscopy, functional)
        if (item.category === 'imaging' || code.startsWith('G') || code.startsWith('F') || lowerName.includes('촬영') || lowerName.includes('초음파') || lowerName.includes('mri') || lowerName.includes('ct') || lowerName.includes('x-ray') || lowerName.includes('엑스레이')) {
            sub = 'imaging';
            if (lowerName.includes('mri') || lowerName.includes('자기공명') || code.startsWith('HE')) detail = 'mri';
            else if (lowerName.includes('ct') || lowerName.includes('전산화단층') || code.startsWith('HA')) detail = 'ct';
            else if (lowerName.includes('x-ray') || lowerName.includes('엑스레이') || lowerName.includes('단순촬영') || code.startsWith('F0') || code.startsWith('F1') || code.startsWith('F2')) detail = 'xray';
            else if (lowerName.includes('초음파') || code.startsWith('EB') || code.startsWith('EZ')) detail = 'ultrasound';
            else if (lowerName.includes('조영') || lowerName.includes('angio') || code.startsWith('HC')) detail = 'angio';
            else detail = 'special';
        } else if (item.category === 'specimen' || code.startsWith('D') || lowerName.includes('검사') && (lowerName.includes('혈액') || lowerName.includes('소변') || lowerName.includes('뇨') || lowerName.includes('검경') || lowerName.includes('체액'))) {
            sub = 'specimen';
            if (lowerName.includes('혈액형') || lowerName.includes('cbc') || lowerName.includes('적혈구') || lowerName.includes('백혈구') || lowerName.includes('혈소판') || lowerName.includes('헤모글로빈') || code.startsWith('D0') || code.startsWith('D1') || code.startsWith('D15')) {
                detail = 'blood';
            } else if (lowerName.includes('암') || lowerName.includes('종양') || lowerName.includes('psa') || lowerName.includes('afp') || lowerName.includes('cea') || code.startsWith('D8') || code.startsWith('D9')) {
                detail = 'tumor';
            } else if (lowerName.includes('뇨') || lowerName.includes('요') || lowerName.includes('소변') || lowerName.includes('urinalysis') || code.startsWith('D3')) {
                detail = 'urine';
            } else {
                detail = 'chemistry';
            }
        } else if (item.category === 'endoscopy' || lowerName.includes('내시경')) {
            sub = 'endoscopy';
            if (lowerName.includes('위') || lowerName.includes('상부위장')) detail = 'gastro';
            else if (lowerName.includes('대장') || lowerName.includes('결장') || lowerName.includes('직장')) detail = 'colono';
            else detail = 'etc';
        } else {
            sub = 'functional';
            if (lowerName.includes('심장') || lowerName.includes('심전도') || lowerName.includes('홀터') || lowerName.includes('ecg') || code.startsWith('E1')) detail = 'cardio';
            else if (lowerName.includes('뇌') || lowerName.includes('신경') || lowerName.includes('근전도') || code.startsWith('E2')) detail = 'neuro';
            else if (lowerName.includes('수면') || lowerName.includes('psg')) detail = 'sleep';
            else if (lowerName.includes('폐기능') || lowerName.includes('pft') || lowerName.includes('호흡')) detail = 'respiratory';
            else detail = 'sensory';
        }
    } else if (main === 'procedure_hira') {
        // 시술 대분류 (cardiovascular, dental, general_proc)
        if (code.startsWith('U') || lowerName.includes('치과') || lowerName.includes('치아') || lowerName.includes('발치') || lowerName.includes('치주') || lowerName.includes('잇몸') || lowerName.includes('치석') || lowerName.includes('스케일링') || lowerName.includes('임플란트')) {
            sub = 'dental';
        } else if (
            lowerName.includes('심장') || 
            lowerName.includes('혈관') || 
            lowerName.includes('색전술') || 
            lowerName.includes('스텐트') || 
            lowerName.includes('카테터') || 
            lowerName.includes('조영술') || 
            lowerName.includes('중심정맥') || 
            lowerName.includes('picc') || 
            lowerName.includes('정맥관') || 
            lowerName.includes('동맥관') ||
            lowerName.includes('포트') ||
            lowerName.includes('히크만') ||
            lowerName.includes('chemoport') ||
            lowerName.includes('hickman') ||
            code.startsWith('O707')
        ) {
            sub = 'cardiovascular';
        } else {
            sub = 'general_proc';
        }
    } else if (main === 'surgery') {
        // 수술 대분류 (neuro, eye_ent, chest, abdomen, urology_ob, ortho)
        // 1. 신경외과(neuro) : EDI 코드가 S4, S51, S52, O1, SY로 시작하거나 뇌/신경 한글 명칭 매칭
        if (code.startsWith('S4') || code.startsWith('S51') || code.startsWith('S52') || code.startsWith('O1') || code.startsWith('SY') || 
            lowerName.includes('뇌') || lowerName.includes('척추') || lowerName.includes('신경') || lowerName.includes('척수') || lowerName.includes('경막') || lowerName.includes('천공') || lowerName.includes('종양제거') || lowerName.includes('두개') || lowerName.includes('개두') || lowerName.includes('미세혈관')) {
            sub = 'neuro';
        } 
        // 2. 안과/이비인후과(eye_ent) : EDI 코드가 SZ로 시작하거나, S5로 시작하되 S51, S52가 아닌 경우 (S53~S58) 및 안과/이비인후과 한글 명칭 매칭
        else if (code.startsWith('SZ') || (code.startsWith('S5') && !code.startsWith('S51') && !code.startsWith('S52')) || 
                 lowerName.includes('안과') || lowerName.includes('이비인후과') || lowerName.includes('눈') || lowerName.includes('안구') || lowerName.includes('공막') || lowerName.includes('홍채') || lowerName.includes('각막') || lowerName.includes('백내장') || lowerName.includes('녹내장') || lowerName.includes('망막') || lowerName.includes('귀') || lowerName.includes('이개') || lowerName.includes('고막') || lowerName.includes('이소골') || lowerName.includes('보청기') || lowerName.includes('코') || lowerName.includes('비강') || lowerName.includes('부비동') || lowerName.includes('편도')) {
            sub = 'eye_ent';
        } 
        // 3. 흉부/심혈관(chest) : EDI 코드가 S61~S63, O3로 시작하거나 흉부/심혈관 한글 명칭 매칭
        else if (code.startsWith('S61') || code.startsWith('S62') || code.startsWith('S63') || code.startsWith('O3') || 
                 lowerName.includes('가슴') || lowerName.includes('폐') || lowerName.includes('심장') || lowerName.includes('식도') || lowerName.includes('흉부') || lowerName.includes('판막') || lowerName.includes('동맥') || lowerName.includes('정맥') || lowerName.includes('혈관') || lowerName.includes('우회술')) {
            sub = 'chest';
        } 
        // 4. 복부/소화기(abdomen) : EDI 코드가 S70~S77, O5로 시작하거나 복부/소화기 한글 명칭 매칭
        else if ((code.startsWith('S7') && !code.startsWith('S78') && !code.startsWith('S79')) || code.startsWith('O5') || 
                 lowerName.includes('위') || lowerName.includes('대장') || lowerName.includes('결장') || lowerName.includes('충수') || lowerName.includes('맹장') || lowerName.includes('담낭') || lowerName.includes('쓸개') || lowerName.includes('항문') || lowerName.includes('치핵') || lowerName.includes('치질') || lowerName.includes('췌장') || lowerName.includes('담도') || lowerName.includes('비장') || lowerName.includes('복부')) {
            sub = 'abdomen';
        } 
        // 5. 비뇨기/산부인과(urology_ob) : EDI 코드가 S80~S99, R2~R6, RA, RB, RY, RZ, O6로 시작하거나 비뇨기/산부인과 한글 명칭 매칭
        else if (code.startsWith('S8') || code.startsWith('S9') || code.startsWith('R2') || code.startsWith('R3') || code.startsWith('R4') || code.startsWith('R5') || code.startsWith('R6') || code.startsWith('RA') || code.startsWith('RB') || code.startsWith('RY') || code.startsWith('RZ') || code.startsWith('O6') || 
                 lowerName.includes('비뇨') || lowerName.includes('방광') || lowerName.includes('요관') || lowerName.includes('요도') || lowerName.includes('전립선') || lowerName.includes('신장') || lowerName.includes('신우') || lowerName.includes('음경') || lowerName.includes('고환') || lowerName.includes('자궁') || lowerName.includes('난소') || lowerName.includes('질') || lowerName.includes('난관') || lowerName.includes('태아') || lowerName.includes('임신') || lowerName.includes('분만') || lowerName.includes('유도분만') || lowerName.includes('제왕절개') || lowerName.includes('포경')) {
            sub = 'urology_ob';
        } 
        // 6. 정형외과(ortho) : EDI 코드가 S10~S39로 시작하거나 기본 fallback 처리
        else {
            sub = 'ortho';
        }
    } else if (main === 'etc') {
        // 기타 대분류 (anesthesia, injection, rehab, korean, other)
        if (code.startsWith('H') || lowerName.includes('마취')) sub = 'anesthesia';
        else if (lowerName.includes('주사') || lowerName.includes('수혈') || lowerName.includes('수액') || lowerName.includes('링거') || lowerName.includes('포도당') || lowerName.includes('식염수')) sub = 'injection';
        else if (code.startsWith('I') || lowerName.includes('물리치료') || lowerName.includes('재활') || lowerName.includes('도수') || lowerName.includes('운동치료') || lowerName.includes('온열') || lowerName.includes('한냉')) sub = 'rehab';
        else if (lowerName.includes('한방') || lowerName.includes('침') || lowerName.includes('뜸') || lowerName.includes('부항') || lowerName.includes('침술')) sub = 'korean';
        else sub = 'other';
    }

    return { main, sub, detail };
}

function initHierarchicalSelects() {
    const mainSelect = document.getElementById('main-category-select');
    if (mainSelect) {
        mainSelect.value = activeTab;
    }
    
    const subSelect = document.getElementById('sub-category-select');
    const detailSelect = document.getElementById('detail-item-select');
    const itemsList = document.getElementById('hierarchical-items-list');
    
    if (subSelect) {
        subSelect.innerHTML = '<option value="" disabled selected>-- 중분류 선택 --</option>';
        subSelect.disabled = true;
    }
    if (detailSelect) {
        detailSelect.innerHTML = '<option value="" disabled selected>-- 소분류 선택 --</option>';
        detailSelect.disabled = true;
    }
    if (itemsList) {
        itemsList.innerHTML = '';
        itemsList.classList.add('hidden');
    }

    // 현재 활성화된 탭 기준으로 중분류 목록 즉시 연동 채우기
    updateSubCategoriesForTab(activeTab);
}

function updateSubCategoriesForTab(tabId) {
    const subSelect = document.getElementById('sub-category-select');
    const detailSelect = document.getElementById('detail-item-select');
    const itemsList = document.getElementById('hierarchical-items-list');
    
    if (!subSelect) return;
    
    // 중분류 채우기
    subSelect.innerHTML = '<option value="" disabled selected>-- 중분류 선택 --</option>';
    const subs = SUB_CAT_LABELS[tabId] || {};
    Object.entries(subs).forEach(([code, label]) => {
        const opt = document.createElement('option');
        opt.value = code;
        opt.textContent = label;
        subSelect.appendChild(opt);
    });
    subSelect.disabled = false;
    
    // 소분류 및 리스트 초기화
    if (detailSelect) {
        detailSelect.innerHTML = '<option value="" disabled selected>-- 소분류 선택 --</option>';
        detailSelect.disabled = true;
    }
    if (itemsList) {
        itemsList.innerHTML = '';
        itemsList.classList.add('hidden');
    }
}

function handleMainCategoryChange() {
    const mainSelect = document.getElementById('main-category-select');
    if (!mainSelect) return;
    activeTab = mainSelect.value;
    updateSubCategoriesForTab(activeTab);
}

function handleSubCategoryChange() {
    const subSelect = document.getElementById('sub-category-select');
    const detailSelect = document.getElementById('detail-item-select');
    const itemsList = document.getElementById('hierarchical-items-list');
    
    if (!subSelect || !detailSelect) return;
    
    const mainVal = activeTab; // activeTab 전역 변수 직접 사용
    const subVal = subSelect.value;
    
    if (mainVal === 'test') {
        // 검사 대분류인 경우 소분류 필요
        detailSelect.innerHTML = '<option value="" disabled selected>-- 소분류 선택 --</option>';
        const details = DETAIL_CAT_LABELS[subVal] || {};
        Object.entries(details).forEach(([code, label]) => {
            const opt = document.createElement('option');
            opt.value = code;
            opt.textContent = label;
            detailSelect.appendChild(opt);
        });
        detailSelect.disabled = false;
        if (itemsList) {
            itemsList.innerHTML = '';
            itemsList.classList.add('hidden');
        }
    } else {
        // 시술/수술/기타는 소분류가 필요 없으므로 건너뛰고 아이템 리스트 렌더링
        detailSelect.innerHTML = '<option value="all" selected>해당 분야 전체 항목</option>';
        detailSelect.disabled = true;
        renderHierarchicalItemsList(mainVal, subVal, 'all');
    }
}

function handleDetailItemChange() {
    const subSelect = document.getElementById('sub-category-select');
    const detailSelect = document.getElementById('detail-item-select');
    
    if (!subSelect || !detailSelect) return;
    
    renderHierarchicalItemsList(activeTab, subSelect.value, detailSelect.value);
}

function renderHierarchicalItemsList(mainVal, subVal, detailVal) {
    const itemsList = document.getElementById('hierarchical-items-list');
    if (!itemsList) return;
    
    itemsList.innerHTML = '';
    
    // 조건 필터링
    const items = getMedicalItemDatabase().filter(item => {
        if (isEmergencyManagementItem(item)) return false;
        const classification = getHierarchicalClassification(item);
        if (classification.main !== mainVal) return false;
        if (classification.sub !== subVal) return false;
        if (detailVal !== 'all' && classification.detail !== detailVal) return false;
        return true;
    });
    
    // EDI 코드순 정렬 개편
    items.sort((a, b) => {
        const codeA = (a.publicActionCode || a.actionCode || a.ediCode || a.code || '').toString().toUpperCase();
        const codeB = (b.publicActionCode || b.actionCode || b.ediCode || b.code || '').toString().toUpperCase();
        return codeA.localeCompare(codeB);
    });
    
    if (items.length === 0) {
        itemsList.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:12px;">선택 조건에 해당하는 수가 항목이 없습니다.</p>';
    } else {
        items.forEach(item => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.style.display = 'flex';
            btn.style.justifyContent = 'space-between';
            btn.style.alignItems = 'center';
            btn.style.width = '100%';
            btn.style.padding = '8px 12px';
            btn.style.border = '1px solid #e2e8f0';
            btn.style.borderRadius = '6px';
            btn.style.background = '#ffffff';
            btn.style.cursor = 'pointer';
            btn.style.textAlign = 'left';
            btn.style.fontSize = '12px';
            btn.style.transition = 'all 0.2s';
            
            // 호버 및 클릭 액션 연동
            btn.onmouseover = () => { btn.style.background = '#f1f5f9'; btn.style.borderColor = '#cbd5e1'; };
            btn.onmouseout = () => { btn.style.background = '#ffffff'; btn.style.borderColor = '#e2e8f0'; };
            
            const benefitText = item.isBenefit ? '급여' : '비급여';
            const badgeClass = item.isBenefit ? 'badge-benefit' : 'badge-non-benefit';
            
            btn.innerHTML = '<div>' +
                '<span class="badge ' + badgeClass + '" style="font-size:10px;padding:1px 4px;margin-right:6px;">' + benefitText + '</span>' +
                '<strong style="color:#1e293b;">' + item.name + '</strong>' +
                '</div>' +
                '<div style="display:flex;align-items:center;gap:6px;">' +
                '<span style="color:#64748b;font-weight:600;">' + formatNumber(item.price) + '원</span>' +
                '<span style="color:var(--primary);font-weight:700;font-size:11px;"><i data-lucide="plus" style="width:10px;height:10px;display:inline-block;vertical-align:middle;"></i> 추가</span>' +
                '</div>';
            
            btn.addEventListener('click', () => {
                addHiraItem(item);
            });
            
            itemsList.appendChild(btn);
        });
    }
    
    itemsList.classList.remove('hidden');
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

function toggleDiseaseCodeSection() {
    const hasDisease = document.getElementById('has_disease_code').checked;
    const details = document.getElementById('disease_code_details');
    const input = document.getElementById('disease_code_input');
    
    if (hasDisease) {
        details.classList.remove('hidden');
    } else {
        details.classList.add('hidden');
        if (input) {
            input.value = '';
        }
        handleCalculatorInputChange();
    }
}

// =========================================================
// 9. 신규 오버라이드: 실시간 자동완성, 탭 연동 및 영어 약어 병기 검색 엔진
// =========================================================

function switchTab(tabId) {
    activeTab = tabId;
    
    // 탭 버튼 active 클래스 전환 적용
    document.querySelectorAll('.category-tabs .tab-btn').forEach(btn => {
        if (btn.getAttribute('data-tab') === tabId) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
    
    // 3단계 직접 선택 드롭다운 연동
    const mainSelect = document.getElementById('main-category-select');
    if (mainSelect) {
        mainSelect.value = tabId;
        handleMainCategoryChange();
    }
    
    // 하단 추천 검색어 키워드 칩 목록 갱신
    renderRecommendChips(tabId);
    
    // 검색 입력값 및 검색 결과 목록 초기화
    const searchInput = document.getElementById('category-search-input');
    const btnClear = document.getElementById('btn-clear-category-search');
    const resultsList = document.getElementById('category-search-results');
    const btnRun = document.getElementById('btn-run-category-search');
    
    if (searchInput) searchInput.value = '';
    if (btnClear) btnClear.classList.add('hidden');
    if (btnRun) {
        btnRun.disabled = true;
        btnRun.classList.remove('active');
    }
    if (resultsList) {
        resultsList.innerHTML = '';
        resultsList.classList.add('hidden');
    }
}

function initSearchEvents() {
    // A. 대분류 탭 검색창 리스너 바인딩
    const categorySearchInput = document.getElementById('category-search-input');
    const categoryResultsList = document.getElementById('category-search-results');
    const btnClearCategory = document.getElementById('btn-clear-category-search');
    const btnRunCategory = document.getElementById('btn-run-category-search');
    
    if (categorySearchInput && categoryResultsList) {
        categorySearchInput.addEventListener('input', (e) => {
            const query = e.target.value.trim();
            updateSearchControlState(categorySearchInput, btnClearCategory, btnRunCategory);
            if (query.length > 0) {
                performSearch(query, activeTab, { logSearch: false });
            } else {
                categoryResultsList.innerHTML = '';
                categoryResultsList.classList.add('hidden');
            }
        });

        categorySearchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                executeSearchFromInput(categorySearchInput, activeTab);
            }
        });
        
        if (btnClearCategory) {
            btnClearCategory.addEventListener('click', (e) => {
                e.stopPropagation();
                categorySearchInput.value = '';
                updateSearchControlState(categorySearchInput, btnClearCategory, btnRunCategory);
                categoryResultsList.innerHTML = '';
                categoryResultsList.classList.add('hidden');
                categorySearchInput.focus();
            });
        }

        if (btnRunCategory) {
            btnRunCategory.addEventListener('click', (e) => {
                e.stopPropagation();
                executeSearchFromInput(categorySearchInput, activeTab);
            });
        }
    }

    // B. 기타 처치 검색창 리스너 바인딩
    const etcSearchInput = document.getElementById('etc-search-input');
    const etcResultsList = document.getElementById('etc-search-results');
    const btnClearEtc = document.getElementById('btn-clear-etc-search');
    const btnRunEtc = document.getElementById('btn-run-etc-search');
    
    if (etcSearchInput && etcResultsList) {
        etcSearchInput.addEventListener('input', (e) => {
            const query = e.target.value.trim();
            updateSearchControlState(etcSearchInput, btnClearEtc, btnRunEtc);
            if (query.length > 0) {
                performSearch(query, 'etc', { logSearch: false });
            } else {
                etcResultsList.innerHTML = '';
                etcResultsList.classList.add('hidden');
            }
        });

        etcSearchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                executeSearchFromInput(etcSearchInput, 'etc');
            }
        });
        
        if (btnClearEtc) {
            btnClearEtc.addEventListener('click', (e) => {
                e.stopPropagation();
                etcSearchInput.value = '';
                updateSearchControlState(etcSearchInput, btnClearEtc, btnRunEtc);
                etcResultsList.innerHTML = '';
                etcResultsList.classList.add('hidden');
                etcSearchInput.focus();
            });
        }

        if (btnRunEtc) {
            btnRunEtc.addEventListener('click', (e) => {
                e.stopPropagation();
                executeSearchFromInput(etcSearchInput, 'etc');
            });
        }
    }
    
    // C. 드롭다운 바깥 영역 클릭 시 검색창 드롭다운 레이어 닫기
    document.addEventListener('click', (e) => {
        if (categorySearchInput && categoryResultsList && !categorySearchInput.contains(e.target) && !categoryResultsList.contains(e.target)) {
            categorySearchInput.blur();
        }
        if (etcSearchInput && etcResultsList && !etcSearchInput.contains(e.target) && !etcResultsList.contains(e.target)) {
            etcSearchInput.blur();
        }
    });
}

function performSearch(query, targetGroup, options = {}) {
    const resultsList = targetGroup === 'etc' 
        ? document.getElementById('etc-search-results')
        : document.getElementById('category-search-results');
        
    if (!resultsList) return;
    
    // 1단계: 전체 DB에서 수가 항목 매칭
    let matched = getMedicalItemDatabase().filter(item => isMatch(query, item) && !isEmergencyManagementItem(item));
    
    // 2단계: etc 탭에서는 etc 항목만 검색, 그 외 상단 카테고리 탭에서는 etc 항목 제외
    if (targetGroup === 'etc') {
        matched = matched.filter(item => getItemTypeGroup(item) === 'etc');
    } else {
        matched = matched.filter(item => getItemTypeGroup(item) !== 'etc');
        
        // 직접 선택 영역의 드롭다운 선택 상태에 따른 검색 제한
        const mainSelect = document.getElementById('main-category-select');
        const subSelect = document.getElementById('sub-category-select');
        
        // 중분류가 선택되어 있는 경우 해당 중분류만 매칭
        if (subSelect && subSelect.value && subSelect.value !== '') {
            matched = matched.filter(item => getHierarchicalClassification(item).sub === subSelect.value);
        }
        // 대분류가 선택되어 있고 대분류 드롭다운이 가려져 있지 않은 경우 (숨겨져 있으면 탭 자동 연동이므로 무시하고 전체 검색 유지)
        else if (mainSelect && mainSelect.value && mainSelect.value !== '' && mainSelect.style.display !== 'none') {
            matched = matched.filter(item => getHierarchicalClassification(item).main === mainSelect.value);
        }
    }
    
    // 3단계: KCD 질환 매칭 데이터도 검색 결과에 통합하여 함께 렌더링 (통합검색 실현 - etc 탭 제외)
    let matchedKcd = [];
    if (targetGroup !== 'etc') {
        const dbToSearch = (ALL_KCD_DATABASE && ALL_KCD_DATABASE.length > 0) ? ALL_KCD_DATABASE : KCD_DATABASE;
        matchedKcd = dbToSearch.filter(item => {
            const cleanQuery = query.replace(/\s+/g, '').toLowerCase();
            if (item.code.toLowerCase().includes(cleanQuery)) return true;
            if (item.name.toLowerCase().replace(/\s+/g, '').includes(cleanQuery)) return true;
            if (item.name_en && item.name_en.toLowerCase().replace(/\s+/g, '').includes(cleanQuery)) return true;
            if (item.keywords && item.keywords.some(k => k.toLowerCase().replace(/\s+/g, '').includes(cleanQuery))) return true;
            return false;
        }).slice(0, 30).map(item => ({
            ...item,
            isKcd: true, // KCD 질병 객체임을 마킹
            price: 0,
            isBenefit: true
        }));
    }
    
    // 4단계: KCD 질병과 수가 목록을 합친다 (KCD 질병 우선 노출)
    let combinedResults = [...matchedKcd, ...matched];

    if (options.logSearch) {
        sendSearchLog(query, matched.length);
    }
    
    resultsList.innerHTML = '';
    
    // 매칭 결과가 없을 때
    if (combinedResults.length === 0) {
        const emptyDiv = document.createElement('div');
        emptyDiv.className = 'empty-search-results';
        
        let helpText = '부위나 오타를 확인하거나, 다른 검색어로 시도해보세요.';
        if (targetGroup !== 'etc') {
            helpText = '검색이 되지 않는 내용(주사, 마취, 물리치료 등)은 하단의 <strong>\'기타 처치 주사 마취 등 추가\'</strong> 검색창에서 검색해 보세요.';
        }
        
        emptyDiv.innerHTML = `
            <i data-lucide="search"></i>
            <p>'<strong>${query}</strong>'에 매칭되는 항목이 없습니다.</p>
            <span style="font-size:0.75rem; color:var(--text-muted); line-height:1.4;">${helpText}</span>
        `;
        resultsList.appendChild(emptyDiv);
    } 
    // 매칭 결과가 있을 때 최대 15개 렌더링
    else {
        const limitResults = combinedResults.slice(0, 15);
        limitResults.forEach(item => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'search-result-item';
            
            if (item.isKcd) {
                // KCD 상병코드 질병인 경우 렌더링 방식
                const displayName = item.name_en ? `${item.name} (${item.name_en})` : item.name;
                const categoryBadge = `<span class="badge" style="padding: 0.15rem 0.35rem; font-size: 0.68rem; margin-right: 0.4rem; background: #3b82f6; color: white;">질병</span>`;
                btn.innerHTML = `
                    <div class="search-result-info" style="text-align: left;">
                        <span class="search-result-name">${categoryBadge}${displayName}</span>
                        <span class="search-result-keywords">상병코드: ${item.code} (선택 시 평균 진료비 자동 연동)</span>
                    </div>
                    <div class="search-result-meta">
                        <span class="btn-result-add" style="color: #3b82f6;"><i data-lucide="check" style="width:12px; height:12px; display:inline-block; vertical-align:middle;"></i> 적용</span>
                    </div>
                `;
                
                btn.addEventListener('click', () => {
                    addKcdDisease(item.code, item.name);
                    
                    const searchInput = targetGroup === 'etc' 
                        ? document.getElementById('etc-search-input')
                        : document.getElementById('category-search-input');
                        
                    const btnClear = targetGroup === 'etc'
                        ? document.getElementById('btn-clear-etc-search')
                        : document.getElementById('btn-clear-category-search');

                    const btnRun = targetGroup === 'etc'
                        ? document.getElementById('btn-run-etc-search')
                        : document.getElementById('btn-run-category-search');
                        
                    if (searchInput) searchInput.value = '';
                    if (searchInput) updateSearchControlState(searchInput, btnClear, btnRun);
                    resultsList.innerHTML = '';
                    resultsList.classList.add('hidden');
                    if (searchInput) searchInput.focus();
                });
            } else {
                // 일반 수가 항목인 경우 렌더링 방식
                const groupLabels = {
                    test: '검사',
                    procedure_hira: '시술',
                    surgery: '수술',
                    etc: '기타'
                };
                const itemGroup = getItemTypeGroup(item);
                
                const categoryBadge = `<span class="badge badge-benefit" style="padding: 0.15rem 0.35rem; font-size: 0.68rem; margin-right: 0.4rem;">${groupLabels[itemGroup] || itemGroup}</span>`;
                const benefitBadge = item.isBenefit 
                    ? '<span class="badge badge-benefit" style="font-size: 0.65rem;">급여</span>' 
                    : '<span class="badge badge-non-benefit" style="font-size: 0.65rem;">비급여</span>';
                const drgBadge = item.isDRG ? '<span class="badge badge-drg">DRG</span>' : '';
                
                // 영어 동의어 표시 보강 (PICC, TFCA 등 영문 약어를 공식 명칭 옆에 자동 병기)
                let nameSuffix = '';
                if (item.keywords) {
                    const englishKeywords = item.keywords.filter(k => /^[a-z0-9\s\-]+$/i.test(k) && k.length >= 2 && k.length <= 15);
                    const nameLower = item.name.toLowerCase();
                    const missingEng = englishKeywords.filter(k => !nameLower.includes(k.toLowerCase()));
                    if (missingEng.length > 0) {
                        nameSuffix = ` (${missingEng[0].toUpperCase()})`;
                    }
                }
                const displayName = item.name + nameSuffix;
                const keywordSnippet = item.keywords ? item.keywords.slice(0, 4).join(', ') : '';
                
                btn.innerHTML = `
                    <div class="search-result-info">
                        <span class="search-result-name">${categoryBadge}${displayName}${drgBadge}</span>
                        <span class="search-result-keywords">동의어: ${keywordSnippet}</span>
                    </div>
                    <div class="search-result-meta">
                        <span class="search-result-price">${formatNumber(item.price)}원</span>
                        ${benefitBadge}
                        <span class="btn-result-add"><i data-lucide="plus" style="width:12px; height:12px;"></i> 추가</span>
                    </div>
                `;
                
                btn.addEventListener('click', () => {
                    addHiraItem(item);
                    
                    const searchInput = targetGroup === 'etc' 
                        ? document.getElementById('etc-search-input')
                        : document.getElementById('category-search-input');
                        
                    const btnClear = targetGroup === 'etc'
                        ? document.getElementById('btn-clear-etc-search')
                        : document.getElementById('btn-clear-category-search');

                    const btnRun = targetGroup === 'etc'
                        ? document.getElementById('btn-run-etc-search')
                        : document.getElementById('btn-run-category-search');
                        
                    if (searchInput) searchInput.value = '';
                    if (searchInput) updateSearchControlState(searchInput, btnClear, btnRun);
                    resultsList.innerHTML = '';
                    resultsList.classList.add('hidden');
                    if (searchInput) searchInput.focus();
                });
            }
            resultsList.appendChild(btn);
        });
    }
    
    resultsList.classList.remove('hidden');
    if (typeof lucide !== 'undefined') lucide.createIcons();
}


// =========================================================
// 13. Absolute EOF search override
// This must be the final search override in this file.
// =========================================================

function eofSearchElements(targetGroup) {
    const global = targetGroup === 'global';
    return {
        input: document.getElementById(global ? 'global-search-input' : 'category-search-input'),
        results: document.getElementById(global ? 'global-search-results' : 'category-search-results'),
        clear: document.getElementById(global ? 'btn-clear-global-search' : 'btn-clear-category-search'),
        run: document.getElementById(global ? 'btn-run-global-search' : 'btn-run-category-search')
    };
}

function eofNormalize(value) {
    return String(value || '').toLowerCase().replace(/\s+/g, '');
}

const EOF_KCD_ALIASES = [
    { code: 'J00', name: '??', keywords: ['??', '???', '???', '?? ????', 'cold'] },
    { code: 'J10', name: '??', keywords: ['??', '?????', 'flu'] },
    { code: 'K35', name: '???', keywords: ['???', '???', 'appendicitis'] },
    { code: 'M54', name: '????', keywords: ['????', '??', '???', 'back pain'] },
    { code: 'M545', name: '??', keywords: ['??', '?? ??', 'low back pain'] },
    { code: 'M51', name: '?????', keywords: ['?????', '?????'] },
    { code: 'M50', name: '????', keywords: ['????', '?????'] },
    { code: 'I10', name: '???', keywords: ['???', '??'] },
    { code: 'E11', name: '???', keywords: ['??', '???'] },
    { code: 'R51', name: '??', keywords: ['??', '?? ??'] },
    { code: 'R42', name: '????', keywords: ['???', '????', '???'] },
    { code: 'O82', name: '???? ??', keywords: ['????', 'c-section'] }
];

function eofKcdCode(item) { return String(item.code || '').trim(); }
function eofKcdName(item) { return String(item.name || item.ko || item.name_ko || '').trim(); }
function eofKcdEnglish(item) { return String(item.name_en || item.en || '').trim(); }
function eofKcdKeywords(item) { return Array.isArray(item.keywords) ? item.keywords : []; }

function eofKcdDatabase() {
    const out = [];
    const seen = new Set();
    const full = Array.isArray(ALL_KCD_DATABASE) ? ALL_KCD_DATABASE : [];
    const fallback = Array.isArray(KCD_DATABASE) ? KCD_DATABASE : [];
    EOF_KCD_ALIASES.concat(fallback, full).forEach(item => {
        const code = eofKcdCode(item);
        const name = eofKcdName(item);
        const key = `${code}|${name}`;
        if (!code || seen.has(key)) return;
        seen.add(key);
        out.push(item);
    });
    return out;
}

function eofSearchKcd(query) {
    const q = eofNormalize(query);
    if (!q) return [];
    return eofKcdDatabase().filter(item => {
        const fields = [eofKcdCode(item), eofKcdName(item), eofKcdEnglish(item), ...eofKcdKeywords(item)];
        return fields.some(field => eofNormalize(field).includes(q));
    }).slice(0, 40);
}

function eofRenderDiseaseResults(query) {
    const input = document.getElementById('disease_code_input');
    const results = document.getElementById('disease-search-results');
    if (!input || !results) return;
    const matched = eofSearchKcd(query);
    results.innerHTML = '';
    if (!matched.length) {
        results.innerHTML = `<div class="empty-search-results"><p>'<strong>${escapeHtml(query)}</strong>' ???/???? ??? ????.</p></div>`;
    } else {
        matched.forEach(item => {
            const code = eofKcdCode(item);
            const name = eofKcdName(item) || eofKcdEnglish(item) || code;
            const en = eofKcdEnglish(item);
            const safeCode = escapeHtml(code);
            const safeName = escapeHtml(name);
            const safeEn = escapeHtml(en);
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'search-result-item';
            btn.innerHTML = `
                <div class="search-result-info">
                    <span class="search-result-name"><span class="badge badge-benefit" style="font-size:0.68rem;margin-right:0.4rem;">??</span>${safeName}</span>
                    <span class="search-result-keywords">KCD ${safeCode}${en ? ` ? ${safeEn}` : ''}</span>
                </div>
                <div class="search-result-meta"><span class="btn-result-add">??</span></div>
            `;
            btn.onclick = () => {
                addKcdDisease(code, name);
                input.value = `${code} ${name}`;
                results.innerHTML = '';
                results.classList.add('hidden');
                input.focus();
            };
            results.appendChild(btn);
        });
    }
    results.classList.remove('hidden');
}

function eofItemMatchesScope(item) {
    const scope = getScopedSearchFilters();
    if (!scope.main) return false;
    const c = getHierarchicalClassification(item);
    if (c.main !== scope.main) return false;
    if (scope.sub && c.sub !== scope.sub) return false;
    if (scope.detail && scope.detail !== 'all' && c.detail !== scope.detail) return false;
    return true;
}

function eofRenderItemResults(query, targetGroup, items) {
    const el = eofSearchElements(targetGroup);
    if (!el.results) return;
    el.results.innerHTML = '';
    if (!items.length) {
        el.results.innerHTML = `<div class="empty-search-results"><p>'<strong>${query}</strong>' ?? ??? ????.</p></div>`;
        el.results.classList.remove('hidden');
        return;
    }
    items.slice(0, 30).forEach(item => {
        const group = getItemTypeGroup(item);
        const labels = { test: '??', procedure_hira: '??', surgery: '??', etc: '??' };
        const c = getHierarchicalClassification(item);
        const sub = CONSUMER_SUB_LABELS[c.main]?.[c.sub] || labels[group] || '';
        const detail = CONSUMER_DETAIL_LABELS[c.sub]?.[c.detail] || '';
        const code = item.publicActionCode || item.actionCode || item.ediCode || item.code || '';
        const benefit = item.isBenefit ? '<span class="badge badge-benefit" style="font-size:0.65rem;">??</span>' : '<span class="badge badge-non-benefit" style="font-size:0.65rem;">???</span>';
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'search-result-item';
        btn.innerHTML = `
            <div class="search-result-info">
                <span class="search-result-name"><span class="badge badge-benefit" style="padding:0.15rem 0.35rem;font-size:0.68rem;margin-right:0.4rem;">${labels[group] || group}</span>${item.name}</span>
                <span class="search-result-keywords">${sub}${detail ? ` ? ${detail}` : ''}${code ? ` ? ?? ${code}` : ''}</span>
            </div>
            <div class="search-result-meta"><span class="search-result-price">${formatNumber(item.price)}?</span>${benefit}<span class="btn-result-add">??</span></div>
        `;
        btn.onclick = () => {
            if (typeof window.trackGAEvent === 'function') {
                window.trackGAEvent('search_result_click', {
                    item_group: targetGroup,
                    page_path: window.location.pathname
                });
            }
            addHiraItem(item);
            const searchEl = eofSearchElements(targetGroup);
            if (searchEl.input) searchEl.input.value = '';
            updateSearchControlState(searchEl.input, searchEl.clear, searchEl.run);
            if (searchEl.results) {
                searchEl.results.innerHTML = '';
                searchEl.results.classList.add('hidden');
            }
            if (searchEl.input) searchEl.input.focus();
        };
        el.results.appendChild(btn);
    });
    el.results.classList.remove('hidden');
}

function getExactApprovedAliasCodes(query) {
    const normalizedQuery = String(query || '').toLowerCase().replace(/\s+/g, '');
    if (!normalizedQuery) return new Set();
    return new Set([...approvedSearchAliases.entries()]
        .filter(([, aliases]) => aliases.some(alias => String(alias || '').toLowerCase().replace(/\s+/g, '') === normalizedQuery))
        .map(([code]) => code));
}

function performSearch(query, targetGroup = 'scoped', options = {}) {
    const clean = String(query || '').trim();
    if (!clean) return;
    const el = eofSearchElements(targetGroup);
    if (!el.results) return;
    let matched = getMedicalItemDatabase().filter(item => isMatch(clean, item) && !isEmergencyManagementItem(item));
    if (targetGroup !== 'global') {
        const scope = getScopedSearchFilters();
        if (!scope.main) {
            el.results.innerHTML = '<div class="empty-search-results"><p>?? ??, ??, ?? ? ??? ?????.</p></div>';
            el.results.classList.remove('hidden');
            return;
        }
        matched = matched.filter(eofItemMatchesScope);
    }
    if (options.logSearch) sendSearchLog(clean, matched.length);
    eofRenderItemResults(clean, targetGroup, matched);
}

function executeSearchFromInput(searchInput, targetGroup = 'scoped') {
    if (!searchInput) return;
    const query = searchInput.value.trim();
    if (!query) {
        searchInput.focus();
        return;
    }
    performSearch(query, targetGroup, { logSearch: true });
    searchInput.focus();
}

function eofBindSearchBox(targetGroup) {
    const el = eofSearchElements(targetGroup);
    if (!el.input || !el.results) return;
    el.input.oninput = () => updateSearchControlState(el.input, el.clear, el.run);
    el.input.onkeydown = event => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        executeSearchFromInput(el.input, targetGroup);
    };
    if (el.clear) {
        el.clear.onclick = event => {
            event.stopPropagation();
            el.input.value = '';
            updateSearchControlState(el.input, el.clear, el.run);
            el.results.innerHTML = '';
            el.results.classList.add('hidden');
            el.input.focus();
        };
    }
    if (el.run) {
        el.run.onclick = event => {
            event.stopPropagation();
            executeSearchFromInput(el.input, targetGroup);
        };
    }
}

function eofBindDiseaseSearchBox() {
    const input = document.getElementById('disease_code_input');
    const results = document.getElementById('disease-search-results');
    if (!input || !results) return;
    input.oninput = () => {
        const query = input.value.trim();
        if (!query) {
            results.innerHTML = '';
            results.classList.add('hidden');
            return;
        }
        eofRenderDiseaseResults(query);
    };
    input.onkeydown = event => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        const first = results.querySelector('button.search-result-item');
        if (first) first.click();
    };
}

function eofBindAllSearchControls() {
    eofBindSearchBox('global');
    eofBindSearchBox('scoped');
    eofBindDiseaseSearchBox();
}

onDocumentReady(eofBindAllSearchControls);
setTimeout(eofBindAllSearchControls, 0);

// 14. Final UI override: add feedback, hide empty detail select, fix broken labels.
const EOF2_TEXT = {
    selectSub: '-- \uc911\ubd84\ub958 \uc120\ud0dd --',
    selectDetail: '-- \uc18c\ubd84\ub958 \uc120\ud0dd --',
    noResult: '\uac80\uc0c9 \uacb0\uacfc\uac00 \uc5c6\uc2b5\ub2c8\ub2e4.',
    chooseMain: '\uba3c\uc800 \uac80\uc0ac, \uc2dc\uc220, \uc218\uc220 \uc911 \ud558\ub098\ub97c \uc120\ud0dd\ud558\uc138\uc694.',
    add: '+ \ucd94\uac00',
    added: '\ucd94\uac00\ub428',
    benefit: '\uae09\uc5ec',
    nonBenefit: '\ube44\uae09\uc5ec',
    code: '\ucf54\ub4dc',
    won: '\uc6d0'
};

const EOF2_GROUP_LABELS = {
    test: '\uac80\uc0ac',
    procedure_hira: '\uc2dc\uc220',
    surgery: '\uc218\uc220',
    etc: '\uae30\ud0c0'
};

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    })[ch]);
}

function eof2Option(value, label, selected = false, disabled = false) {
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = label;
    opt.selected = selected;
    opt.disabled = disabled;
    return opt;
}

function eof2SetDetailVisible(visible) {
    const detailSelect = document.getElementById('detail-item-select');
    if (!detailSelect) return;
    detailSelect.disabled = !visible;
    detailSelect.classList.toggle('is-hidden', !visible);
    detailSelect.style.display = visible ? '' : 'none';
    if (!visible) detailSelect.value = '';
}

function eof2GetActiveMain() {
    const activeButton = document.querySelector('.category-tab.active');
    return activeTab || activeButton?.dataset?.tab || '';
}

function eof2ShowAddedFeedback(button, after) {
    if (!button) {
        if (typeof after === 'function') after();
        return;
    }
    button.classList.add('is-added');
    const addLabel = button.querySelector('.btn-result-add');
    if (addLabel) addLabel.textContent = EOF2_TEXT.added;
    setTimeout(() => {
        if (typeof after === 'function') after();
    }, 220);
}

function updateSubCategoriesForTab(tabId) {
    const subSelect = document.getElementById('sub-category-select');
    const detailSelect = document.getElementById('detail-item-select');
    const itemsList = document.getElementById('hierarchical-items-list');
    if (!subSelect) return;

    subSelect.innerHTML = '';
    subSelect.appendChild(eof2Option('', EOF2_TEXT.selectSub, true, true));
    if (detailSelect) {
        detailSelect.innerHTML = '';
        detailSelect.appendChild(eof2Option('', EOF2_TEXT.selectDetail, true, true));
    }
    eof2SetDetailVisible(false);
    if (itemsList) itemsList.innerHTML = '';

    const labels = CONSUMER_SUB_LABELS?.[tabId] || {};
    if (!tabId || !Object.keys(labels).length) {
        subSelect.disabled = true;
        return;
    }

    subSelect.disabled = false;
    Object.entries(labels).forEach(([code, label]) => {
        subSelect.appendChild(eof2Option(code, label));
    });
}

function handleSubCategoryChange() {
    const subSelect = document.getElementById('sub-category-select');
    const detailSelect = document.getElementById('detail-item-select');
    const itemsList = document.getElementById('hierarchical-items-list');
    const mainVal = eof2GetActiveMain();
    const subVal = subSelect?.value || '';
    if (!detailSelect) return;

    detailSelect.innerHTML = '';
    detailSelect.appendChild(eof2Option('', EOF2_TEXT.selectDetail, true, true));

    if (!mainVal || !subVal) {
        eof2SetDetailVisible(false);
        if (itemsList) itemsList.innerHTML = '';
        return;
    }

    const details = CONSUMER_DETAIL_LABELS?.[subVal] || {};
    if (Object.keys(details).length) {
        Object.entries(details).forEach(([code, label]) => {
            detailSelect.appendChild(eof2Option(code, label));
        });
        eof2SetDetailVisible(true);
    } else {
        eof2SetDetailVisible(false);
        renderHierarchicalItemsList(mainVal, subVal, 'all');
    }
}

function handleDetailItemChange() {
    const subVal = document.getElementById('sub-category-select')?.value || '';
    const detailVal = document.getElementById('detail-item-select')?.value || 'all';
    const mainVal = eof2GetActiveMain();
    if (!mainVal || !subVal) return;
    renderHierarchicalItemsList(mainVal, subVal, detailVal || 'all');
}

function renderHierarchicalItemsList(mainVal, subVal, detailVal = 'all') {
    const itemsList = document.getElementById('hierarchical-items-list');
    if (!itemsList) return;
    itemsList.innerHTML = '';
    if (!mainVal || !subVal) return;

    const items = getMedicalItemDatabase()
        .filter(item => {
            if (isEmergencyManagementItem(item)) return false;
            const c = getHierarchicalClassification(item);
            if (c.main !== mainVal || c.sub !== subVal) return false;
            if (detailVal && detailVal !== 'all' && c.detail !== detailVal) return false;
            return true;
        })
        .slice(0, 80);

    if (!items.length) {
        itemsList.innerHTML = `<div class="empty-search-results"><p>${escapeHtml(EOF2_TEXT.noResult)}</p></div>`;
        return;
    }

    items.forEach(item => {
        const code = item.publicActionCode || item.actionCode || item.ediCode || item.code || '';
        const benefitLabel = item.isBenefit ? EOF2_TEXT.benefit : EOF2_TEXT.nonBenefit;
        const safeName = escapeHtml(item.name);
        const safeCode = escapeHtml(code);
        const safeBenefitLabel = escapeHtml(benefitLabel);
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'search-result-item hierarchical-result-item';
        btn.innerHTML = `
            <div class="search-result-info">
                <span class="search-result-name"><span class="badge badge-benefit" style="padding:0.15rem 0.35rem;font-size:0.68rem;margin-right:0.4rem;">${safeBenefitLabel}</span>${safeName}</span>
                <span class="search-result-keywords">${code ? `${escapeHtml(EOF2_TEXT.code)} ${safeCode}` : ''}</span>
            </div>
            <div class="search-result-meta"><span class="search-result-price">${escapeHtml(formatNumber(item.price))}${escapeHtml(EOF2_TEXT.won)}</span><span class="btn-result-add">${escapeHtml(EOF2_TEXT.add)}</span></div>
        `;
        btn.onclick = () => {
            addHiraItem(item);
            eof2ShowAddedFeedback(btn);
        };
        itemsList.appendChild(btn);
    });
}

function eofRenderDiseaseResults(query) {
    const input = document.getElementById('disease_code_input');
    const results = document.getElementById('disease-search-results');
    if (!input || !results) return;
    const matched = eofSearchKcd(query);
    results.innerHTML = '';
    if (!matched.length) {
        results.innerHTML = `<div class="empty-search-results"><p>'<strong>${escapeHtml(query)}</strong>' ${escapeHtml(EOF2_TEXT.noResult)}</p></div>`;
    } else {
        matched.forEach(item => {
            const code = eofKcdCode(item);
            const name = eofKcdName(item) || eofKcdEnglish(item) || code;
            const en = eofKcdEnglish(item);
            const safeCode = escapeHtml(code);
            const safeName = escapeHtml(name);
            const safeEn = escapeHtml(en);
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'search-result-item';
            btn.innerHTML = `
                <div class="search-result-info">
                    <span class="search-result-name"><span class="badge badge-benefit" style="font-size:0.68rem;margin-right:0.4rem;">KCD</span>${safeName}</span>
                    <span class="search-result-keywords">KCD ${safeCode}${en ? ` / ${safeEn}` : ''}</span>
                </div>
                <div class="search-result-meta"><span class="btn-result-add">${escapeHtml(EOF2_TEXT.add)}</span></div>
            `;
            btn.onclick = () => {
                addKcdDisease(code, name);
                input.value = `${code} ${name}`;
                eof2ShowAddedFeedback(btn, () => {
                    results.innerHTML = '';
                    results.classList.add('hidden');
                    input.focus();
                });
            };
            results.appendChild(btn);
        });
    }
    results.classList.remove('hidden');
}

function eofRenderItemResults(query, targetGroup, items) {
    const el = eofSearchElements(targetGroup);
    if (!el.results) return;
    el.results.innerHTML = '';
    if (!items.length) {
        el.results.innerHTML = `<div class="empty-search-results"><p>'<strong>${escapeHtml(query)}</strong>' ${escapeHtml(EOF2_TEXT.noResult)}</p></div>`;
        el.results.classList.remove('hidden');
        return;
    }
    items.slice(0, 30).forEach(item => {
        const group = getItemTypeGroup(item);
        const c = getHierarchicalClassification(item);
        const sub = CONSUMER_SUB_LABELS?.[c.main]?.[c.sub] || EOF2_GROUP_LABELS[group] || '';
        const detail = CONSUMER_DETAIL_LABELS?.[c.sub]?.[c.detail] || '';
        const code = item.publicActionCode || item.actionCode || item.ediCode || item.code || '';
        const benefitLabel = item.isBenefit ? EOF2_TEXT.benefit : EOF2_TEXT.nonBenefit;
        const benefitClass = item.isBenefit ? 'badge-benefit' : 'badge-non-benefit';
        const safeGroup = escapeHtml(EOF2_GROUP_LABELS[group] || group);
        const safeName = escapeHtml(item.name);
        const safeSub = escapeHtml(sub);
        const safeDetail = escapeHtml(detail);
        const safeCode = escapeHtml(code);
        const safePrice = item.estimateRange
            ? `${escapeHtml(formatNumber(item.estimateRange.min))}~${escapeHtml(formatNumber(item.estimateRange.max))}${escapeHtml(EOF2_TEXT.won)}`
            : `${escapeHtml(formatNumber(item.price))}${escapeHtml(EOF2_TEXT.won)}`;
        const estimateMeta = item.estimateKind
            ? ` / 공식 수가 ${escapeHtml(item.estimateSampleCount)}개 중앙값 ${escapeHtml(formatNumber(item.price))}${escapeHtml(EOF2_TEXT.won)}`
            : '';
        const safeBenefitLabel = escapeHtml(benefitLabel);
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'search-result-item';
        btn.innerHTML = `
            <div class="search-result-info">
                <span class="search-result-name"><span class="badge badge-benefit" style="padding:0.15rem 0.35rem;font-size:0.68rem;margin-right:0.4rem;">${safeGroup}</span>${safeName}</span>
                <span class="search-result-keywords">${safeSub}${detail ? ` / ${safeDetail}` : ''}${code ? ` / ${escapeHtml(EOF2_TEXT.code)} ${safeCode}` : ''}${estimateMeta}</span>
            </div>
            <div class="search-result-meta"><span class="search-result-price">${safePrice}</span><span class="badge ${benefitClass}" style="font-size:0.65rem;">${safeBenefitLabel}</span><span class="btn-result-add">${escapeHtml(EOF2_TEXT.add)}</span></div>
        `;
        btn.onclick = () => {
            addHiraItem(item);
            eof2ShowAddedFeedback(btn, () => {
                const searchEl = eofSearchElements(targetGroup);
                if (searchEl.input) searchEl.input.value = '';
                updateSearchControlState(searchEl.input, searchEl.clear, searchEl.run);
                if (searchEl.results) {
                    searchEl.results.innerHTML = '';
                    searchEl.results.classList.add('hidden');
                }
                if (searchEl.input) searchEl.input.focus();
            });
        };
        el.results.appendChild(btn);
    });
    el.results.classList.remove('hidden');
}

function performSearch(query, targetGroup = 'scoped', options = {}) {
    const clean = String(query || '').trim();
    if (!clean) return;
    const el = eofSearchElements(targetGroup);
    if (!el.results) return;
    const database = getMedicalItemDatabase();
    const hospitalClass = document.querySelector('input[name="hospital_class"]:checked')?.value || 'hospital';
    const estimates = window.MedicalEstimator
        ? window.MedicalEstimator.createConsumerEstimateItems(clean, database, anesthesiaProviderForClass(hospitalClass))
        : [];
    const estimateCodes = new Set(estimates.map(item => item.code));
    let matched = estimates.concat(database.filter(item =>
        !estimateCodes.has(item.code) && isMatch(clean, item) && !isEmergencyManagementItem(item)
    ));
    const exactApprovedCodes = getExactApprovedAliasCodes(clean);
    if (exactApprovedCodes.size) {
        matched = matched.filter(item => exactApprovedCodes.has(item.code));
    }
    if (targetGroup !== 'global') {
        const scope = getScopedSearchFilters();
        if (!scope.main) {
            el.results.innerHTML = `<div class="empty-search-results"><p>${EOF2_TEXT.chooseMain}</p></div>`;
            el.results.classList.remove('hidden');
            return;
        }
        matched = matched.filter(eofItemMatchesScope);
    }
    if (options.logSearch) sendSearchLog(clean, matched.length);
    if (typeof window.trackGAEvent === 'function') {
        window.trackGAEvent('search', {
            result_count: matched.length,
            search_scope: targetGroup,
            page_path: window.location.pathname
        });
        if (matched.length === 0) {
            window.trackGAEvent('search_no_result', {
                search_scope: targetGroup,
                page_path: window.location.pathname
            });
        }
    }
    eofRenderItemResults(clean, targetGroup, matched);
}

function eof2RebindFinalUi() {
    eofBindAllSearchControls();
    const subSelect = document.getElementById('sub-category-select');
    const detailSelect = document.getElementById('detail-item-select');
    if (subSelect) subSelect.onchange = handleSubCategoryChange;
    if (detailSelect) detailSelect.onchange = handleDetailItemChange;
    if (!detailSelect?.value) eof2SetDetailVisible(false);
}

onDocumentReady(eof2RebindFinalUi);
setTimeout(eof2RebindFinalUi, 0);

// 15. Final direct-select override: trust visible active tab and always show rendered list.
function eof3GetActiveMain() {
    const activeButton = document.querySelector('.tab-btn.active, .category-tab.active, [data-tab].active');
    const tab = activeButton?.dataset?.tab || '';
    return tab || activeTab || '';
}

function eof2GetActiveMain() {
    return eof3GetActiveMain();
}

function renderHierarchicalItemsList(mainVal, subVal, detailVal = 'all') {
    const itemsList = document.getElementById('hierarchical-items-list');
    if (!itemsList) return;
    itemsList.innerHTML = '';
    itemsList.classList.remove('hidden');
    if (!mainVal || !subVal) {
        itemsList.classList.add('hidden');
        return;
    }

    const items = getMedicalItemDatabase()
        .filter(item => {
            if (isEmergencyManagementItem(item)) return false;
            const c = getHierarchicalClassification(item);
            if (c.main !== mainVal || c.sub !== subVal) return false;
            if (detailVal && detailVal !== 'all' && c.detail !== detailVal) return false;
            return true;
        })
        .slice(0, 80);

    if (!items.length) {
        itemsList.innerHTML = `<div class="empty-search-results"><p>${escapeHtml(EOF2_TEXT.noResult)}</p></div>`;
        return;
    }

    items.forEach(item => {
        const code = item.publicActionCode || item.actionCode || item.ediCode || item.code || '';
        const benefitLabel = item.isBenefit ? EOF2_TEXT.benefit : EOF2_TEXT.nonBenefit;
        const safeName = escapeHtml(item.name);
        const safeCode = escapeHtml(code);
        const safeBenefitLabel = escapeHtml(benefitLabel);
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'search-result-item hierarchical-result-item';
        btn.innerHTML = `
            <div class="search-result-info">
                <span class="search-result-name"><span class="badge badge-benefit" style="padding:0.15rem 0.35rem;font-size:0.68rem;margin-right:0.4rem;">${safeBenefitLabel}</span>${safeName}</span>
                <span class="search-result-keywords">${code ? `${escapeHtml(EOF2_TEXT.code)} ${safeCode}` : ''}</span>
            </div>
            <div class="search-result-meta"><span class="search-result-price">${escapeHtml(formatNumber(item.price))}${escapeHtml(EOF2_TEXT.won)}</span><span class="btn-result-add">${escapeHtml(EOF2_TEXT.add)}</span></div>
        `;
        btn.onclick = () => {
            addHiraItem(item);
            eof2ShowAddedFeedback(btn);
        };
        itemsList.appendChild(btn);
    });
}

function handleSubCategoryChange() {
    const subSelect = document.getElementById('sub-category-select');
    const detailSelect = document.getElementById('detail-item-select');
    const itemsList = document.getElementById('hierarchical-items-list');
    const mainVal = eof3GetActiveMain();
    const subVal = subSelect?.value || '';
    if (!detailSelect) return;

    detailSelect.innerHTML = '';
    detailSelect.appendChild(eof2Option('', EOF2_TEXT.selectDetail, true, true));

    if (!mainVal || !subVal) {
        eof2SetDetailVisible(false);
        if (itemsList) {
            itemsList.innerHTML = '';
            itemsList.classList.add('hidden');
        }
        return;
    }

    const details = CONSUMER_DETAIL_LABELS?.[subVal] || {};
    if (Object.keys(details).length) {
        Object.entries(details).forEach(([code, label]) => {
            detailSelect.appendChild(eof2Option(code, label));
        });
        eof2SetDetailVisible(true);
        if (itemsList) {
            itemsList.innerHTML = '';
            itemsList.classList.add('hidden');
        }
    } else {
        eof2SetDetailVisible(false);
        renderHierarchicalItemsList(mainVal, subVal, 'all');
    }
}

function handleDetailItemChange() {
    const subVal = document.getElementById('sub-category-select')?.value || '';
    const detailVal = document.getElementById('detail-item-select')?.value || 'all';
    const mainVal = eof3GetActiveMain();
    if (!mainVal || !subVal) return;
    renderHierarchicalItemsList(mainVal, subVal, detailVal || 'all');
}

function eof3RebindDirectSelect() {
    const subSelect = document.getElementById('sub-category-select');
    const detailSelect = document.getElementById('detail-item-select');
    if (subSelect) subSelect.onchange = handleSubCategoryChange;
    if (detailSelect) detailSelect.onchange = handleDetailItemChange;
}

onDocumentReady(eof3RebindDirectSelect);
setTimeout(eof3RebindDirectSelect, 0);

function renderSearchResults(query, targetGroup, resultsList, items) {
    if (!resultsList) return;

    resultsList.innerHTML = '';
    if (!Array.isArray(items) || items.length === 0) {
        const emptyDiv = document.createElement('div');
        emptyDiv.className = 'empty-search-results';
        emptyDiv.innerHTML = `<i data-lucide="search"></i><p>'<strong>${escapeHtml(query)}</strong>' 에 대한 검색 결과가 없습니다.</p>`;
        resultsList.appendChild(emptyDiv);
        resultsList.classList.remove('hidden');
        if (typeof lucide !== 'undefined') lucide.createIcons();
        return;
    }

    const groupLabels = { test: '검사', procedure_hira: '시술', surgery: '수술', etc: '기타' };
    items.slice(0, 30).forEach(item => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'search-result-item';
        const itemGroup = getItemTypeGroup(item);
        const classification = getHierarchicalClassification(item);
        const subLabel = CONSUMER_SUB_LABELS[classification.main]?.[classification.sub] || groupLabels[itemGroup] || '';
        const detailLabel = CONSUMER_DETAIL_LABELS[classification.sub]?.[classification.detail] || '';
        const benefitBadge = item.isBenefit
            ? '<span class="badge badge-benefit" style="font-size: 0.65rem;">급여</span>'
            : '<span class="badge badge-non-benefit" style="font-size: 0.65rem;">비급여</span>';
        const code = item.publicActionCode || item.actionCode || item.ediCode || item.code || '';
        btn.innerHTML = `
            <div class="search-result-info">
                <span class="search-result-name"><span class="badge badge-benefit" style="padding:0.15rem 0.35rem;font-size:0.68rem;margin-right:0.4rem;">${escapeHtml(groupLabels[itemGroup] || itemGroup)}</span>${escapeHtml(item.name)}</span>
                <span class="search-result-keywords">${escapeHtml(subLabel)}${detailLabel ? ` / ${escapeHtml(detailLabel)}` : ''}${code ? ` / 코드 ${escapeHtml(code)}` : ''}</span>
            </div>
            <div class="search-result-meta">
                <span class="search-result-price">${escapeHtml(formatNumber(item.price))}원</span>
                ${benefitBadge}
                <span class="btn-result-add"><i data-lucide="plus" style="width:12px;height:12px;"></i> 추가</span>
            </div>
        `;
        btn.addEventListener('click', () => {
            addHiraItem(item);
            const el = getSearchElements(targetGroup);
            if (el.input) el.input.value = '';
            updateSearchControlState(el.input, el.clear, el.run);
            el.results.innerHTML = '';
            el.results.classList.add('hidden');
            if (el.input) el.input.focus();
        });
        resultsList.appendChild(btn);
    });

    resultsList.classList.remove('hidden');
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

function renderAddedItems() {
    const unifiedList = document.getElementById('added_items_unified_list');
    if (!unifiedList) return;

    unifiedList.innerHTML = '';
    const totalCount = addedTests.length + addedSurgeries.length + addedProcedures.length;
    if (totalCount === 0) {
        unifiedList.innerHTML = '<p class="empty-list-text">등록된 항목이 없습니다. 대분류를 선택해서 검색한 뒤 추가해 주세요.</p>';
        document.dispatchEvent(new Event('medicost:items-changed'));
        return;
    }

    const appendItem = (item, label, removeHandler, extraBadge = '') => {
        const div = document.createElement('div');
        div.className = 'added-item';
        const benefitTag = item.isBenefit
            ? '<span class="badge badge-benefit">급여</span>'
            : '<span class="badge badge-non-benefit">비급여</span>';
        const estimateText = item.estimateRange
            ? ` / 공식 수가 ${item.estimateSampleCount}개 중앙값 ${formatNumber(item.basePrice)}원 · 범위 ${formatNumber(item.estimateRange.min)}~${formatNumber(item.estimateRange.max)}원`
            : '';
        const anesthesiaLabels = {
            general: '전신마취', spinal: '척추마취', 'nerve-block': '신경차단마취',
            local: '국소마취', none: '마취 없음', unknown: '마취 중앙값'
        };
        const anesthesiaText = item.anesthesia
            ? ` / ${anesthesiaLabels[item.anesthesia.type] || item.anesthesia.type} · ${item.anesthesia.durationMinutes}분 · ${item.anesthesia.sessionId}`
            : '';
        div.innerHTML = `
            <div class="item-info">
                <span class="item-name">${escapeHtml(item.typeName || item.name || '')}${extraBadge}</span>
                <span class="item-meta">${escapeHtml(label)} / ${escapeHtml(item.count || 1)}건 / ${benefitTag}${item.publicStatsSource ? ` / ${escapeHtml(item.publicStatsSource)}` : ''}${item.publicFeeScheduleSource ? ` / ${escapeHtml(item.publicFeeScheduleSource)}` : ''}${escapeHtml(estimateText)}${escapeHtml(anesthesiaText)}</span>
            </div>
            <button type="button" class="btn-remove" onclick="${removeHandler}(${Number(item.id)})" title="삭제">
                <i data-lucide="x"></i>
            </button>
        `;
        unifiedList.appendChild(div);
    };

    addedTests.forEach(item => {
        appendItem(item, item.categoryName || '검사', 'removeTestItem');
    });

    addedSurgeries.forEach(item => {
        const dbItem = getMedicalItemDatabase().find(db => db.code === item.type);
        const groupName = dbItem && getItemTypeGroup(dbItem) === 'procedure_hira' ? '시술' : '수술';
        const drgBadge = item.isDRG ? ' <span class="badge badge-drg">DRG</span>' : '';
        appendItem(item, groupName, 'removeSurgeryItem', drgBadge);
    });

    addedProcedures.forEach(item => {
        appendItem(item, item.categoryName || '처치', 'removeProcedureItem');
    });

    if (typeof lucide !== 'undefined') lucide.createIcons();
    document.dispatchEvent(new Event('medicost:items-changed'));
}
