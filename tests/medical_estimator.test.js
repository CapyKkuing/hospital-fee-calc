const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const estimator = require(path.join(root, 'frontend', 'assets', 'js', 'medical-estimator.js'));

const session = (sessionId, overrides = {}) => ({
    anesthesia: {
        sessionId,
        type: 'general',
        durationMinutes: 60,
        ageGroup: 'adult',
        sedation: false,
        ...overrides
    }
});

{
    const result = estimator.estimateAnesthesia([
        session('shared', { durationMinutes: 120 }),
        session('shared', { durationMinutes: 120 })
    ], 'hospital');
    assert.equal(result.total, 127470 + (24520 * 4), '같은 마취 회차는 기본료를 한 번만 산정해야 합니다.');
    assert.equal(result.episodes.length, 1);
}

{
    const result = estimator.estimateAnesthesia([session('first'), session('second')], 'hospital');
    assert.equal(result.total, 127470 * 2, '별도 마취 회차는 회차마다 기본료를 산정해야 합니다.');
    assert.equal(result.episodes.length, 2);
}

{
    const local = estimator.estimateAnesthesia([session('local', { type: 'local' })], 'hospital');
    assert.equal(local.total, 0, '단순 국소마취는 수술·처치료에 포함되어 별도 산정하지 않습니다.');

    const generalWithSedation = estimator.estimateAnesthesia([session('general', { sedation: true })], 'hospital');
    assert.equal(generalWithSedation.total, 127470, '전신마취와 MAC 진정관리료를 중복 산정하면 안 됩니다.');

    const mac = estimator.estimateAnesthesia([
        session('mac', { type: 'local', durationMinutes: 45, sedation: true })
    ], 'hospital');
    assert.equal(mac.total, 109000 + 24520, 'MAC은 기본 30분과 초과 15분 단위로 산정해야 합니다.');
}

{
    const newborn = estimator.estimateAnesthesia([
        session('newborn', { ageGroup: 'newborn' })
    ], 'hospital');
    assert.equal(newborn.total, Math.round(127470 * 1.6), '신생아 마취료 60% 가산을 반영해야 합니다.');
}

const fixtureItems = [
    { code: 'FEE_G1', name: '슬관절1매', category: 'imaging', hospitalPrice: 100, clinicPrice: 120, isBenefit: true },
    { code: 'FEE_G2', name: '슬관절2매', category: 'imaging', hospitalPrice: 200, clinicPrice: 220, isBenefit: true },
    { code: 'FEE_G3', name: '슬관절3매', category: 'imaging', hospitalPrice: 300, clinicPrice: 320, isBenefit: true },
    { code: 'FEE_G4', name: '슬관절 C-Arm형 영상증폭장치이용료', category: 'imaging', hospitalPrice: 999, clinicPrice: 999, isBenefit: true },
    { code: 'FEE_N1', name: '슬개골골절도수정복술', category: 'surgery', hospitalPrice: 100000, clinicPrice: 120000, isBenefit: true },
    { code: 'FEE_N2', name: '슬개골골절관혈적정복술', category: 'surgery', hospitalPrice: 400000, clinicPrice: 450000, isBenefit: true }
];

{
    const items = estimator.createConsumerEstimateItems('무릎 엑스레이', fixtureItems, 'hospital');
    assert.equal(items.length, 1);
    assert.equal(items[0].price, 200);
    assert.deepEqual(items[0].estimateRange, { min: 100, max: 300 });
    assert.equal(items[0].estimateSampleCount, 3, '특수촬영·C-Arm은 일반 엑스레이 중앙값에서 제외해야 합니다.');
}

{
    const items = estimator.createConsumerEstimateItems('무릎 골절', fixtureItems, 'hospital');
    assert.equal(items.length, 3, '골절은 수술·비수술·잘 모름 선택지를 제공해야 합니다.');
    assert.equal(items.find(item => item.estimateBucket === 'surgery').price, 400000);
    assert.equal(items.find(item => item.estimateBucket === 'nonsurgery').price, 100000);
    assert.equal(items.find(item => item.estimateBucket === 'unknown').price, 250000);
}

{
    const admin = fs.readFileSync(path.join(root, 'frontend', 'admin-search.html'), 'utf8');
    const adminScript = fs.readFileSync(path.join(root, 'frontend', 'assets', 'js', 'admin-search.js'), 'utf8');
    const adminStyles = fs.readFileSync(path.join(root, 'frontend', 'assets', 'css', 'admin-search.css'), 'utf8');
    assert.match(admin, /결과가 없었던 검색어/);
    assert.match(admin, /추가 완료 이력/);
    assert.match(admin, /방문자가 검색한 전체 검색어/);
    assert.match(admin, /날짜별 방문 흐름/);
    assert.match(adminScript, /period:\s*'7'/);
    assert.match(adminStyles, /\.table-scroll\s*\{\s*overflow-x:\s*auto/);
}

{
    const context = { window: {} };
    vm.createContext(context);
    vm.runInContext(fs.readFileSync(path.join(root, 'frontend', 'assets', 'js', 'fee_schedule_items.js'), 'utf8'), context);
    const items = context.window.PUBLIC_FEE_SCHEDULE_ITEMS.items;
    const naturalDeliveryPrices = {
        FEE_R4351: [818650, 717600], FEE_R4353: [821140, 719790],
        FEE_R4356: [783420, 686730], FEE_R4358: [798370, 699830],
        FEE_R4361: [1442340, 1264310], FEE_R4362: [1340690, 1175210],
        FEE_R4380: [1287350, 1128450]
    };
    // 심평원 2026-09-01 전체판과 대조한 기본코드 단가만 고정한다(변형 청구코드는 별도).
    for (const [code, [clinic, hospital]] of Object.entries(naturalDeliveryPrices)) {
        const fee = items.find(item => item.code === code);
        assert.ok(fee, `${code} 공식 수가가 필요합니다.`);
        assert.equal(fee.clinicPrice, clinic, `${code} 의원 단가`);
        assert.equal(fee.hospitalPrice, hospital, `${code} 병원 단가`);
    }
    ['FEE_HE118', 'FEE_HE120', 'FEE_HE121', 'FEE_HE123'].forEach(code => {
        assert.ok(items.some(item => item.code === code), `${code} 하지 MRI 공식 수가가 필요합니다.`);
    });
    ['척추 엑스레이', '흉부 엑스레이', '두개골 엑스레이'].forEach(query => {
        assert.equal(estimator.createConsumerEstimateItems(query, items, 'hospital').length, 1, `${query} 중앙값이 필요합니다.`);
    });
    ['고관절 골절', '척추 골절', '흉부 골절', '두개골 골절'].forEach(query => {
        assert.ok(estimator.createConsumerEstimateItems(query, items, 'hospital').length >= 1, `${query} 중앙값이 필요합니다.`);
    });
}

const deliveryInput = (overrides = {}) => ({
    code: 'FEE_R4351',
    clinicPrice: 818650,
    hospitalPrice: 717600,
    hospitalClass: 'hospital',
    stayDays: 3,
    roomBeds: 4,
    mealLines: [],
    mealAddOns: [],
    ...overrides
});

// 2026 공식 일반식·산모식 수가를 임의 단가 없이 코드로 계산한다.
for (const [hospitalClass, code, unitPrice] of [
    ['tertiary_hospital', 'Y2100', 5660],
    ['general_hospital', 'Y2200', 5410],
    ['hospital', 'Y2300', 5150],
    ['clinic', 'Y2400', 4710],
    ['tertiary_hospital', 'Y6100', 7380],
    ['general_hospital', 'Y6200', 6940],
    ['hospital', 'Y6300', 6540],
    ['clinic', 'Y6400', 6540]
]) {
    const result = estimator.estimateNaturalDelivery(deliveryInput({
        hospitalClass,
        mealLines: [{ code, count: 2 }]
    }));
    assert.equal(result.mealGrossFee, unitPrice * 2, `${code} 공식 단가 총액`);
    assert.equal(result.mealPatientPay, unitPrice, `${code} 식대 본인부담 50%`);
    assert.deepEqual(result.mealComponents[0], {
        code,
        label: result.mealComponents[0].label,
        kind: code.startsWith('Y2') ? 'general' : 'maternal',
        count: 2,
        unitPrice,
        grossFee: unitPrice * 2,
        patientPay: unitPrice
    });
}

// 의원 기본코드는 의원에서만 사용할 수 있고 병원급 대체코드로 직접 사용할 수 없다.
{
    assert.throws(() => estimator.estimateNaturalDelivery(deliveryInput({
        hospitalClass: 'hospital', mealLines: [{ code: 'Y2400', count: 1 }]
    })), /요양기관 종별/);
    assert.throws(() => estimator.estimateNaturalDelivery(deliveryInput({
        hospitalClass: 'general_hospital', mealLines: [{ code: 'Y6400', count: 1 }]
    })), /요양기관 종별/);
}

// 식대 본인부담은 모든 Y/Z 총액의 50%를 구한 뒤 10원 미만을 한 번만 절사한다.
{
    const single = estimator.estimateNaturalDelivery(deliveryInput({
        hospitalClass: 'general_hospital', mealLines: [{ code: 'Y2200', count: 1 }]
    }));
    assert.equal(single.mealGrossFee, 5410);
    assert.equal(single.mealPatientPay, 2700);

    const combined = estimator.estimateNaturalDelivery(deliveryInput({
        mealLines: [{ code: 'Y2300', count: 1 }],
        mealAddOns: [{ code: 'Z0010', count: 1 }]
    }));
    assert.equal(combined.mealGrossFee, 5800);
    assert.equal(combined.mealPatientPay, 2900);
    assert.deepEqual(combined.mealComponents.map(component => component.patientPay), [2570, 330]);
    assert.equal(combined.mealComponents.reduce((sum, component) => sum + component.patientPay, 0), combined.mealPatientPay);
}

// 청구 입원일수별 식사 상한의 경계값을 허용하고 초과 입력은 차단한다.
{
    const combinedBoundary = estimator.estimateNaturalDelivery(deliveryInput({
        stayDays: 1,
        mealLines: [{ code: 'Y2300', count: 3 }, { code: 'Y6300', count: 1 }]
    }));
    assert.equal(combinedBoundary.generalMealCount, 3);
    assert.equal(combinedBoundary.maternalMealCount, 1);
    assert.equal(combinedBoundary.mealCount, 4);

    const maternalBoundary = estimator.estimateNaturalDelivery(deliveryInput({
        stayDays: 1,
        mealLines: [{ code: 'Y6300', count: 4 }]
    }));
    assert.equal(maternalBoundary.maternalMealCount, 4);

    assert.equal(estimator.estimateNaturalDelivery(deliveryInput({ stayDays: 90 })).stayDays, 90);
}

// 자연분만 관련 4인실 이상은 16일 이상 장기입원과 상급종합병원에서도 0원이다.
{
    const delivery = estimator.estimateNaturalDelivery(deliveryInput({
        hospitalClass: 'tertiary_hospital',
        stayDays: 90,
        roomBeds: 4,
        roomFeeCode: 'AB1J0',
        mealLines: [{ code: 'Y2100', count: 3 }, { code: 'Y6100', count: 4 }],
        mealAddOns: [
            { code: 'Z0010', count: 3 },
            { code: 'Z0011', count: 3 },
            { code: 'Z0030', count: 7 }
        ]
    }));
    const expectedMealGross = (5660 * 3) + (7380 * 4) + (650 * 3) + (600 * 3) + (240 * 7);
    assert.equal(delivery.providerAddOnRate, 0.15);
    assert.equal(delivery.deliveryGrossFee, 825240);
    assert.equal(delivery.deliveryPatientShareRate, 0);
    assert.equal(delivery.deliveryPatientPay, 0);
    assert.equal(delivery.mealPatientShareRate, 0.5);
    assert.equal(delivery.mealGrossFee, expectedMealGross);
    const expectedMealPatientPay = Math.floor(expectedMealGross / 20) * 10;
    assert.equal(delivery.mealPatientPay, expectedMealPatientPay);
    assert.equal(delivery.mealComponents.reduce((sum, component) => sum + component.patientPay, 0), expectedMealPatientPay);
    assert.equal(delivery.roomPatientShareRate, 0);
    assert.equal(delivery.roomPatientPay, 0);
    assert.equal(delivery.knownCoveredGrossFee, delivery.deliveryGrossFee + expectedMealGross);
    assert.equal(delivery.knownCoveredGrossFeeIsPreClaim, true);
    assert.equal(delivery.totalPatientPay, expectedMealPatientPay);
}

// 2·3인실은 병원이 확인한 전체 기간 본인부담액만 사용하며 AB 종별·인실을 검증한다.
{
    const twoBed = estimator.estimateNaturalDelivery(deliveryInput({
        roomBeds: 2,
        roomFeeCode: 'ab3s0',
        roomPatientPayTotal: 123450,
        mealLines: [{ code: 'Y6300', count: 1 }]
    }));
    assert.equal(twoBed.roomFeeCode, 'AB3S0');
    assert.equal(twoBed.roomPatientShareRate, 0.4);
    assert.equal(twoBed.roomPatientPay, 123450);
    assert.equal(twoBed.totalPatientPay, 123450 + (6540 / 2));

    const threeBed = estimator.estimateNaturalDelivery(deliveryInput({
        hospitalClass: 'tertiary_hospital',
        roomBeds: 3,
        roomFeeCode: 'AB1N1',
        roomPatientPayTotal: 90000,
        mealLines: [{ code: 'Y6100', count: 1 }]
    }));
    assert.equal(threeBed.roomPatientShareRate, 0.4);
    assert.equal(threeBed.roomPatientPay, 90000);

    for (const [hospitalClass, roomBeds, roomFeeCode] of [
        ['general_hospital', 3, 'AB2P5'],
        ['hospital', 3, 'AB3R6'],
        ['general_hospital', 2, 'AB2T5'],
        ['hospital', 2, 'AB3V6']
    ]) {
        const regional = estimator.estimateNaturalDelivery(deliveryInput({
            hospitalClass, roomBeds, roomFeeCode, roomPatientPayTotal: 1000
        }));
        assert.equal(regional.roomFeeCode, roomFeeCode, `${roomFeeCode} 공식 지역 기본코드`);
    }
}

for (const [hospitalClass, expectedAddOn, expectedRate] of [
    ['clinic', 0, 0],
    ['hospital', 35880, 0.05],
    ['general_hospital', 71760, 0.10],
    ['tertiary_hospital', 107640, 0.15]
]) {
    const result = estimator.estimateNaturalDelivery(deliveryInput({ hospitalClass }));
    assert.equal(result.providerAddOnRate, expectedRate);
    assert.equal(result.providerAddOnAmount, expectedAddOn);
    assert.equal(result.totalPatientPay, 0);
}

// 종별가산은 원 단위 반올림하고 항목별 10원 절사 없이 청구 합산 전 금액을 반환한다.
{
    const r4353General = estimator.estimateNaturalDelivery(deliveryInput({
        code: 'FEE_R4353', clinicPrice: 821140, hospitalPrice: 719790,
        hospitalClass: 'general_hospital'
    }));
    assert.equal(r4353General.providerAddOnAmount, 71979);
    assert.equal(r4353General.deliveryGrossFee, 791769);
    assert.equal(r4353General.deliveryGrossFeeIsPreClaim, true);
    assert.equal(r4353General.wholeClaimRoundingApplied, false);

    const r4361Hospital = estimator.estimateNaturalDelivery(deliveryInput({
        code: 'FEE_R4361', clinicPrice: 1442340, hospitalPrice: 1264310,
        hospitalClass: 'hospital'
    }));
    assert.equal(r4361Hospital.providerAddOnAmount, 63216, '.5원은 JS Math.round 규칙으로 올림');
    assert.equal(r4361Hospital.deliveryGrossFee, 1327526);
}

assert.equal(estimator.isNaturalDeliveryCode('FEE_R4351'), true);
assert.equal(estimator.isNaturalDeliveryCode('FEE_R4358'), true);
assert.equal(estimator.isNaturalDeliveryCode('FEE_N2072'), false);

for (const [overrides, message] of [
    [{ roomBeds: 1 }, /병실 인원|2~6인실/],
    [{ hospitalClass: 'clinic', roomBeds: 2, roomFeeCode: 'AB4S0', roomPatientPayTotal: 1 }, /의원.*2·3인실/],
    [{ hospitalClass: 'clinic', roomBeds: 3, roomFeeCode: 'AB4N0', roomPatientPayTotal: 1 }, /의원.*2·3인실/],
    [{ roomBeds: 2, roomFeeCode: 'AB3S0' }, /병실 본인부담 총액/],
    [{ roomBeds: 2, roomPatientPayTotal: 1 }, /AB 병실 수가 코드/],
    [{ roomBeds: 2, roomFeeCode: 'AB2S0', roomPatientPayTotal: 1 }, /요양기관 종별/],
    [{ roomBeds: 2, roomFeeCode: 'AB3N0', roomPatientPayTotal: 1 }, /병실 인원/],
    [{ hospitalClass: 'tertiary_hospital', roomBeds: 3, roomFeeCode: 'AB1N7', roomPatientPayTotal: 1 }, /공식 급여 2·3인실/],
    [{ hospitalClass: 'general_hospital', roomBeds: 3, roomFeeCode: 'AB2P0', roomPatientPayTotal: 1 }, /공식 급여 2·3인실/],
    [{ roomBeds: 2, roomFeeCode: 'AB3T0', roomPatientPayTotal: 1 }, /공식 급여 2·3인실/],
    [{ roomBeds: 4, roomPatientPayTotal: 1 }, /0원/],
    [{ hospitalClass: 'hospital', mealLines: [{ code: 'Y2100', count: 1 }] }, /요양기관 종별/],
    [{ mealLines: [{ code: 'EZ776', count: 1 }] }, /급여 식대 수가 코드/],
    [{ mealLines: [{ code: 'Y2300', count: 1 }, { code: 'y2300', count: 1 }] }, /중복/],
    [{ mealLines: [{ code: 'Y2300', count: 0 }] }, /Y2300 횟수/],
    [{ mealLines: [{ code: 'Y2300', count: 1.5 }] }, /Y2300 횟수/],
    [{ mealLines: [{ code: 'Y2300', count: Number.MAX_SAFE_INTEGER }] }, /일반식 횟수/],
    [{ stayDays: 1, mealLines: [{ code: 'Y2300', count: 4 }] }, /일반식 횟수.*최대 3식/],
    [{ stayDays: 1, mealLines: [{ code: 'Y6300', count: 5 }] }, /산모식 횟수.*최대 4식/],
    [{ stayDays: 1, mealLines: [{ code: 'Y2300', count: 3 }, { code: 'Y6300', count: 2 }] }, /전체 식사 횟수.*최대 4식/],
    [{ mealLines: [{ code: 'Y6300', count: 1 }], mealAddOns: [{ code: 'Z0010', count: 1 }] }, /Z0010 횟수/],
    [{ mealLines: [{ code: 'Y2300', count: 1 }], mealAddOns: [{ code: 'Z0011', count: 2 }] }, /Z0011 횟수/],
    [{ mealLines: [{ code: 'Y2300', count: 1 }], mealAddOns: [{ code: 'Z0030', count: 2 }] }, /Z0030 횟수/],
    [{ mealLines: [{ code: 'Y2300', count: 1 }], mealAddOns: [{ code: 'Z9999', count: 1 }] }, /급여 식대 가산 수가 코드/],
    [{ stayDays: 91 }, /청구 입원일수/],
    [{ stayDays: Number.MAX_SAFE_INTEGER + 1 }, /청구 입원일수/],
    [{ clinicPrice: Number.MAX_SAFE_INTEGER + 1 }, /공식 의원 분만 수가/],
    [{ mealCount: 1 }, /mealCount 임의 입력/],
    [{ mealUnitPrice: 5150 }, /mealUnitPrice 임의 입력/],
    [{ otherPatientPay: 1000 }, /otherPatientPay 임의 입력/]
]) {
    assert.throws(() => estimator.estimateNaturalDelivery(deliveryInput(overrides)), message);
}

console.log('PASS: 의료수가 중앙값·마취 회차·자연분만 계산 계약');
