/**
 * MEDICost v3.0 검증용 테스트 러너 (test_runner.js)
 * 
 * 브라우저 환경 객체(window, document 등)를 간이 모킹하여
 * script.js와 hira_codes.js의 핵심 비즈니스 로직을 Node.js 환경에서 직접 실행 및 검증합니다.
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

console.log("=== MEDICost v3.0 로직 정밀 검증 시작 ===");

// 1. 브라우저 환경 모킹
global.window = {};
global.document = {
    addEventListener: (event, callback) => {
        if (event === 'DOMContentLoaded') {
            // 테스트 시에는 수동으로 초기화 제어
            global.DOMContentLoadedCallback = callback;
        }
    },
    getElementById: (id) => {
        const values = {
            nonbenefit_region: '11',
            room_type: 'standard',
            stay_days: '1',
            insurance_generation: 'gen4',
            sanjeong_disease: 'cancer'
        };
        // 간이 모크 요소 반환
        return {
            value: values[id] || '',
            innerText: '',
            innerHTML: '',
            checked: false,
            addEventListener: () => {},
            classList: {
                add: () => {},
                remove: () => {},
                toggle: () => {}
            },
            replaceChildren: () => {},
            appendChild: () => {},
            children: []
        };
    },
    querySelectorAll: (selector) => {
        if (selector === 'input[name="hospital_class"]:checked') {
            return [{ value: 'tertiary_hospital' }]; // 기본값 상급종합병원
        }
        if (selector === 'input[name="treatment_type"]:checked') {
            return [{ value: 'outpatient' }]; // 기본값 외래
        }
        return [];
    },
    querySelector: (selector) => {
        if (selector === 'input[name="hospital_class"]:checked') {
            return { value: 'tertiary_hospital' };
        }
        if (selector === 'input[name="treatment_type"]:checked') {
            return { value: 'outpatient' };
        }
        return null;
    },
    createElement: () => ({
        innerHTML: '',
        className: '',
        append: () => {},
        appendChild: () => {},
        classList: { add: () => {}, remove: () => {}, toggle: () => {} }
    })
};
window.MedicalEstimator = require(path.join(__dirname, '..', 'frontend', 'assets', 'js', 'medical-estimator.js'));
eval(fs.readFileSync(path.join(__dirname, '..', 'frontend', 'assets', 'js', 'fee_schedule_items.js'), 'utf8'));
global.alert = (msg) => {
    console.log(`[ALERT 모크] ${msg}`);
};

// 2. hira_codes.js 로드 (eval을 통한 전역 스코프 로딩)
const hiraCodesPath = path.join(__dirname, '..', 'frontend', 'assets', 'js', 'hira_codes.js');
const hiraCodesCode = fs.readFileSync(hiraCodesPath, 'utf8')
    .replace('const HIRA_DATABASE =', 'global.HIRA_DATABASE =');
eval(hiraCodesCode); // HIRA_DATABASE가 전역으로 로드됨

if (Array.isArray(global.HIRA_DATABASE)) {
    console.log(`[성공] HIRA_DATABASE 로드 완료 (항목 수: ${global.HIRA_DATABASE.length}개)`);
} else {
    console.error("[실패] HIRA_DATABASE 로드 실패");
    process.exit(1);
}

// 3. script.js 로드 (eval)
const scriptPath = path.join(__dirname, '..', 'frontend', 'assets', 'js', 'script.js');
let scriptCode = fs.readFileSync(scriptPath, 'utf8');
scriptCode = `const HIRA_DATABASE = global.HIRA_DATABASE;\n${scriptCode}`;
scriptCode = scriptCode.replace('let resultRequested = false;', 'let resultRequested = true;');
scriptCode = scriptCode.replace('let addedTests = [];', 'var addedTests = [];');
scriptCode = scriptCode.replace('let addedSurgeries = [];', 'var addedSurgeries = [];');
scriptCode = scriptCode.replace('let addedProcedures = [];', 'var addedProcedures = [];');

// DOM 조작과 직접 충돌하는 일부 코드 세그먼트 보호 또는 eval 실행
eval(scriptCode);

// 로드된 함수들 확인
console.log(`[검증] convertToEnglishKeys 로드 확인: ${typeof convertToEnglishKeys === 'function'}`);
console.log(`[검증] getChosung 로드 확인: ${typeof getChosung === 'function'}`);
console.log(`[검증] isMatch 로드 확인: ${typeof isMatch === 'function'}`);
console.log(`[검증] calculate 로드 확인: ${typeof calculate === 'function'}`);

let passCount = 0;
let failCount = 0;

function assert(condition, message) {
    if (condition) {
        console.log(`  [PASS] ${message}`);
        passCount++;
    } else {
        console.error(`  [FAIL] ${message}`);
        failCount++;
    }
}

// ==========================================
// 테스트 시나리오 1: 오타 보정 (convertToEnglishKeys)
// ==========================================
console.log("\n--- 시나리오 1: 영타 오타 및 한글 자모 변환 검증 ---");
assert(convertToEnglishKeys("ㅅ 네ㅑㅜㄷ mri") === "t spine mri", "ㅅ 네ㅑㅜㄷ mri -> t spine mri");
assert(convertToEnglishKeys("ㅡ갸") === "mri", "ㅡ갸 -> mri");

// ==========================================
// 테스트 시나리오 2: 초성 추출 (getChosung)
// ==========================================
console.log("\n--- 시나리오 2: 한글 초성 추출 검증 ---");
assert(getChosung("허리") === "ㅎㄹ", "허리 -> ㅎㄹ");
assert(getChosung("경추 mri") === "ㄱㅊ mri", "경추 mri -> ㄱㅊ mri");
assert(getChosung("뇌 ct") === "ㄴ ct", "뇌 ct -> ㄴ ct");

// ==========================================
// 테스트 시나리오 3: 실시간 검색 매칭 (isMatch)
// ==========================================
console.log("\n--- 시나리오 3: 실시간 검색 필터링 매칭 검증 ---");

// MRI 항목 검색 매칭
const 요추MRI = HIRA_DATABASE.find(item => item.code === "IM_MR04"); // 요추 MRI (L-spine)
assert(isMatch("허리 mri", 요추MRI), "'허리 mri' 검색어로 요추 MRI 매칭 성공");
assert(isMatch("ㅎㄹ mri", 요추MRI), "'ㅎㄹ mri' (초성) 검색어로 요추 MRI 매칭 성공");
assert(isMatch("gjfl mri", 요추MRI), "'gjfl mri' (영타) 검색어로 요추 MRI 매칭 성공");
assert(isMatch("ㅅ 네ㅑㅜㄷ", HIRA_DATABASE.find(item => item.code === "IM_CT07")), "'ㅅ 네ㅑㅜㄷ' (t spine) 검색어로 척추 CT 매칭 성공");
assert(isMatch("x ray", HIRA_DATABASE.find(item => item.code === "IM_XR01")), "'x ray' 검색어로 흉부 X-ray 매칭 성공");
assert(isMatch("노 ct", HIRA_DATABASE.find(item => item.code === "IM_CT01")), "'노 ct' 오타 검색어로 뇌 CT 매칭 성공");
assert(isMatch("하반시마취", HIRA_DATABASE.find(item => item.code === "PR_AN04")), "'하반시마취' 오타 검색어로 척추마취 매칭 성공");
const naturalDeliveryResults = getMedicalItemDatabase()
    .filter(item => isMatch('자연분만', item) && /^FEE_R435[16]$/.test(item.code))
    .map(item => item.code).sort();
assert(JSON.stringify(naturalDeliveryResults) === JSON.stringify(['FEE_R4351', 'FEE_R4356']),
    '자연분만 검색에 초산·경산 제1태아 공식 코드 모두 표시');

// ==========================================
// 테스트 시나리오 4: 진료비 계산 (calculate) 로직 검증
// ==========================================
console.log("\n--- 시나리오 4: 예상 병원비 계산 로직 검증 ---");

// 상급종합병원 외래 기준:
// 1. 기본진찰료 = 23,000원
// 2. 검사 추가: 
//   - 뇌 MRI (비급여 500,000원) -> IM_MR01 (hira_codes.js 뇌 MRI 비조영 500,000원)
//   - 흉부 CT (비조영 150,000원) -> IM_CT03 (hira_codes.js 흉부 CT 비조영 150,000원)
//   - CBC (급여 5,000원) -> SP_BL01 (hira_codes.js 일반혈액검사 5,000원)
//   - 위내시경 (급여 50,000원) -> EN_GS01 (hira_codes.js 위내시경 50,000원)

// 뇌 MRI는 비급여이므로, 급여 검사는 흉부 CT(150,000원), 위내시경(50,000원), CBC(5,000원) 3개.
// 단가 내림차순: 흉부 CT (150,000) -> 위내시경 (50,000) -> CBC (5,000)
// 감산 적용: 흉부 CT(100% = 150,000원), 위내시경(50% = 25,000원), CBC(50% = 2,500원)
// 종별 가산(2026년 상급종합병원 = 15% 가산):
//   - 흉부 CT: 150,000 * 1.15 = 172,500원
//   - 위내시경: 25,000 * 1.15 = 28,750원
//   - CBC: 2,500 * 1.15 = 2,875원
//   - 기본진찰료: 23,000원 (종별 가산 없음)
// 급여 총액 = 23,000 + 172,500 + 28,750 + 2,875 = 227,125원.
// 외래 환자 본인부담 비율(상급종합병원 = 60%):
//   - 급여 본인부담금 = 227,125 * 0.6 = 136,275원.
// 비급여 총액 = 뇌 MRI 500,000원 (가산/감산 없음, 본인부담 100%).
// 환자 실부담 총액 (실비 제외) = 136,275 + 500,000 = 636,275원.

// addedTests 배열 초기화 및 모의 데이터 추가
addedTests = [
    { id: 1, category: "imaging", type: "IM_MR01", typeName: "뇌 MRI (비조영)", count: 1, basePrice: 500000, isBenefit: false },
    { id: 2, category: "imaging", type: "IM_CT03", typeName: "흉부 CT (비조영)", count: 1, basePrice: 150000, isBenefit: true },
    { id: 3, category: "specimen", type: "SP_BL01", typeName: "일반혈액검사 (CBC/전혈구)", count: 1, basePrice: 5000, isBenefit: true },
    { id: 4, category: "endoscopy", type: "EN_GS01", typeName: "위내시경 검사 (상부위장관)", count: 1, basePrice: 50000, isBenefit: true }
];
addedSurgeries = [];
addedProcedures = [];

// DOM 매핑을 위한 모의 결과 수집 객체
const domResults = {};
document.getElementById = (id) => {
    return {
        set textContent(val) { domResults[id] = val; },
        set innerText(val) { domResults[id] = val; },
        get checked() { 
            if (id === 'has_insurance') return false; // 실비 미적용 상태
            if (id === 'has_sanjeong') return false; // 산정특례 미적용 상태
            return false; 
        },
        get value() {
            if (id === 'nonbenefit_region') return '11';
            if (id === 'room_type') return 'standard';
            if (id === 'insurance_generation') return 'gen4';
            if (id === 'disease_code_input') return '';
            return '';
        },
        classList: { add: () => {}, remove: () => {}, toggle: () => {} },
        replaceChildren: () => {},
        appendChild: () => {},
        innerHTML: ''
    };
};

calculate();

// 결과 확인
console.log(`  [결과값] 예상 청구 총액: ${domResults['display_total_cost']}원`);
console.log(`  [결과값] 환자 최종부담: ${domResults['display_final_cost']}원`);

// 급여 본인부담(136,275) + 비급여(500,000) = 636,275원이어야 함.
assert(domResults['display_final_cost'] === "636,275", "상급종합병원 외래 검사 4종(감산/2026년 가산 포함) 계산 정합성 검증");


// ==========================================
// 테스트 시나리오 5: 제왕절개 산모 본인부담금 면제 (0%) 검증
// ==========================================
console.log("\n--- 시나리오 5: 제왕절개 수술 급여 본인부담금 0% 적용 검증 ---");

addedTests = [];
addedSurgeries = [
    {
        id: 1,
        category: "obstetrics",
        type: "SU_OB01",
        typeName: "제왕절개 분만 수술 (2025년 본인부담 0%)",
        basePrice: 1500000,
        isBenefit: true,
        isDRG: true,
        anesthesia: { sessionId: 'test-anesthesia', type: 'general', durationMinutes: 60, ageGroup: 'adult', sedation: false }
    }
];
addedProcedures = [];

calculate();

console.log(`  [결과값] 제왕절개 수술비 포함 최종부담: ${domResults['display_final_cost']}원`);
assert(domResults['display_final_cost'] === "186,882", "제왕절개 수술비 0%와 기존 추정 마취·주사·처치 포함 계산 회귀 검증");

// ==========================================
// 테스트 시나리오 6: 자연분만 입원 급여 수가코드만 계산
// ==========================================
console.log("\n--- 시나리오 6: 자연분만 종별가산·식대·청구 일수 검증 ---");
const deliveryInputs = {
    nonbenefit_region: '11', room_type: 'standard', stay_days: '3',
    delivery_room_beds: '4', delivery_fetus_count: '1',
    delivery_maternal_meal_count: '7', delivery_maternal_meal_code: 'Y6300',
    delivery_general_meal_count: '0', delivery_general_meal_code: '',
    delivery_direct_meal_addon_count: '0', delivery_nutritionist_addon_count: '0',
    delivery_cook_addon_count: '0', delivery_room_fee_code: '', delivery_room_total_patient_pay: ''
};
let deliveryHospitalClass = 'hospital';
let deliveryTreatmentType = 'inpatient';
document.querySelector = selector => {
    if (selector === 'input[name="hospital_class"]:checked') return { value: deliveryHospitalClass };
    if (selector === 'input[name="treatment_type"]:checked') return { value: deliveryTreatmentType };
    return null;
};
document.getElementById = id => ({
    get value() { return deliveryInputs[id] ?? ''; },
    set value(value) { deliveryInputs[id] = value; },
    set innerText(value) { domResults[id] = value; },
    set textContent(value) { domResults[id] = value; },
    get checked() { return false; },
    classList: { add: () => {}, remove: () => {}, toggle: () => {} },
    replaceChildren: () => {}, appendChild: () => {}, innerHTML: ''
});
addedTests = [];
addedProcedures = [];
addedSurgeries = [{
    id: 1, type: 'FEE_R4351', typeName: '정상분만(초산)-제1태아',
    clinicPrice: 818650, hospitalPrice: 717600, basePrice: 717600,
    isBenefit: true, alreadyPricedByProvider: true
}];
const deliveryThreeDays = calculate();
assert(deliveryThreeDays.finalCost === 22890, '분만 급여 0원 + Y6300 7식 식대 50% + 4인실 급여 입원료 부담 0원');
assert(deliveryThreeDays.providerAddOn === 35880, '병원 종별가산 5%는 진료비에 포함하지만 산모에게 청구하지 않음');
assert(deliveryThreeDays.knownCoveredGrossFee === 799260, '분만 및 식대 급여코드 공표액 합계');
assert(domResults['display_final_cost'] === '22,890', '자연분만 화면 합계와 계산 함수 일치');
deliveryInputs.delivery_fetus_count = '3';
const deliveryTriplets = calculate();
assert(deliveryTriplets.grossFee === 2265039 && deliveryTriplets.providerAddOn === 107859,
    '제2태아부터 1인당 R4353 두 건과 종별가산 소계 1회 반올림');
assert(deliveryTriplets.finalCost === 22890, '분만 태아 수 증가가 산모 식대 본인부담을 중복하지 않음');
deliveryInputs.delivery_fetus_count = '1';
deliveryInputs.stay_days = '1';
deliveryInputs.delivery_maternal_meal_count = '2';
const deliveryOneDay = calculate();
assert(deliveryOneDay.finalCost === 6540, '1일 입원 시 Y6300 2식만 급여 식대로 계산');
assert(deliveryThreeDays.finalCost - deliveryOneDay.finalCost === 16350, '입원기간별 실제 식사 횟수 변경 반영');
deliveryInputs.delivery_maternal_meal_count = '7';
assert(!isCalculationReady(), '1일 입원에 7식 입력 차단');
deliveryInputs.delivery_maternal_meal_count = '2';
deliveryHospitalClass = 'clinic';
deliveryInputs.delivery_maternal_meal_code = 'Y6400';
const deliveryClinic = calculate();
assert(deliveryClinic.grossFee === 818650 && deliveryClinic.providerAddOn === 0, '의원 수가와 가산 0% 적용');
addedSurgeries[0].clinicPrice = 717600;
assert(calculate().grossFee === 818650, '관리자 오버레이 가격 대신 공식 수가표 단가 사용');
addedSurgeries.push({ type: 'FEE_R4358', typeName: '정상분만(경산)-제2태아' });
assert(!isCalculationReady(), '초산 제1태아와 경산 제2태아의 잘못된 조합 차단');
addedSurgeries.pop();
addedSurgeries.push({ type: 'FEE_R4353', typeName: '정상분만(초산)-제2태아부터[1인당]' });
assert(!isCalculationReady(), '단태아에 제2태아 수가 수동 선택 시 차단');
deliveryInputs.delivery_fetus_count = '2';
assert(isCalculationReady(), '쌍태아에 일치하는 제2태아 수가 수동 선택 허용');
deliveryInputs.delivery_fetus_count = '1';
addedSurgeries.pop();
addedTests = [{ type: 'FEE_G1234', typeName: '추가 검사' }];
assert(!isCalculationReady(), '분만 외 선택 검사 누락 가능성을 차단');
addedTests = [];
deliveryHospitalClass = 'hospital';
deliveryInputs.delivery_maternal_meal_code = 'Y6300';
deliveryInputs.delivery_room_beds = '3';
deliveryInputs.delivery_room_fee_code = 'AB3N4';
deliveryInputs.delivery_room_total_patient_pay = '10000';
assert(calculate().finalCost === 16540, '3인실은 AB 코드와 병원 확인 전체 기간 부담액만 별도 합산');
deliveryInputs.delivery_room_total_patient_pay = '';
assert(!isCalculationReady(), '2·3인실은 병원 확인 전체 기간 부담액 없이는 확정하지 않음');
deliveryInputs.delivery_room_total_patient_pay = '0';
assert(calculate().finalCost === 6540, '2·3인실의 병원 확인 0원도 허용');
deliveryInputs.delivery_room_fee_code = '';
assert(!isCalculationReady(), '2·3인실 AB 코드 누락 차단');
deliveryInputs.delivery_room_fee_code = 'AB3N4';
deliveryTreatmentType = 'outpatient';
assert(!isCalculationReady(), '자연분만을 일반 외래 계산으로 처리하지 않음');
deliveryTreatmentType = 'inpatient';
deliveryInputs.delivery_maternal_meal_count = '';
assert(!isCalculationReady(), '병원 확인 식사 횟수 없이는 결과를 확정하지 않음');


console.log(`\n=== 테스트 종료: 성공 ${passCount}건, 실패 ${failCount}건 ===`);
assert(isMatch("고압산소치료", HIRA_DATABASE.find(item => item.code === "M0586")), "'고압산소치료' should match M0586");
assert(isMatch("무통", HIRA_DATABASE.find(item => item.code === "LA204")), "'무통' should match LA204");

console.log("\n--- XSS 회귀 테스트 실행 ---");
execFileSync(process.execPath, [path.join(__dirname, 'script_xss_regression.js')], {
    stdio: 'inherit'
});

if (failCount > 0) {
    process.exit(1);
} else {
    process.exit(0);
}
