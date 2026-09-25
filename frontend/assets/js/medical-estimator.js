(function (root, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) root.MedicalEstimator = api;
}(typeof globalThis === 'undefined' ? this : globalThis, function () {
    const SOURCE_DATE = '2026-07-01';
    // 2026 행위 급여 상대가치점수 제1부 II: 제2~10장 행위의 요양기관 종별가산.
    const PROVIDER_ADD_ON_RATES = Object.freeze({
        clinic: 0,
        hospital: 0.05,
        general_hospital: 0.10,
        tertiary_hospital: 0.15
    });
    const NATURAL_DELIVERY_CODES = new Set([
        'FEE_R4351', 'FEE_R4353', 'FEE_R4356', 'FEE_R4358',
        'FEE_R4361', 'FEE_R4362', 'FEE_R4380'
    ]);
    // 2026 건강보험요양급여비용 제1편: 기본식사(일반식·산모식) 및 식사가산.
    const COVERED_MEAL_FEES = Object.freeze({
        Y2100: Object.freeze({ label: '일반식(상급종합병원)', unitPrice: 5660, kind: 'general', provider: 'tertiary_hospital' }),
        Y2200: Object.freeze({ label: '일반식(종합병원)', unitPrice: 5410, kind: 'general', provider: 'general_hospital' }),
        Y2300: Object.freeze({ label: '일반식(병원)', unitPrice: 5150, kind: 'general', provider: 'hospital' }),
        Y2400: Object.freeze({ label: '일반식(의원)', unitPrice: 4710, kind: 'general', provider: 'clinic' }),
        Y6100: Object.freeze({ label: '산모식(상급종합병원)', unitPrice: 7380, kind: 'maternal', provider: 'tertiary_hospital' }),
        Y6200: Object.freeze({ label: '산모식(종합병원)', unitPrice: 6940, kind: 'maternal', provider: 'general_hospital' }),
        Y6300: Object.freeze({ label: '산모식(병원)', unitPrice: 6540, kind: 'maternal', provider: 'hospital' }),
        Y6400: Object.freeze({ label: '산모식(의원)', unitPrice: 6540, kind: 'maternal', provider: 'clinic' })
    });
    const COVERED_MEAL_ADD_ONS = Object.freeze({
        Z0010: Object.freeze({ label: '영양사 가산', unitPrice: 650, bound: 'general' }),
        Z0011: Object.freeze({ label: '조리사 가산', unitPrice: 600, bound: 'general' }),
        Z0030: Object.freeze({ label: '직영 가산', unitPrice: 240, bound: 'total' })
    });
    const PROVIDER_ROOM_PREFIXES = Object.freeze({
        tertiary_hospital: 'AB1', general_hospital: 'AB2', hospital: 'AB3', clinic: 'AB4'
    });
    const ROOM_BED_LETTERS = Object.freeze({ 2: 'S', 3: 'N', 4: 'J', 5: 'E', 6: 'A' });
    // 2026-09-01 HIRA 급여 수가 XLSX의 2·3인실 기본코드만 허용한다.
    const COVERED_TWO_THREE_BED_ROOM_CODES = Object.freeze({
        2: new Set([
            'AB1S0', 'AB1S1', 'AB1S2', 'AB1S3', 'AB1S9', 'AB1SS',
            'AB2S0', 'AB2S1', 'AB2S2', 'AB2S3', 'AB2S4', 'AB2S9', 'AB2SA', 'AB2SS',
            'AB3S0', 'AB3S1', 'AB3S2', 'AB3S3', 'AB3S4', 'AB3S5', 'AB3S9', 'AB3SA',
            'AB2T5', 'AB2U5', 'AB2V5', 'AB3T6', 'AB3U6', 'AB3V6'
        ]),
        3: new Set([
            'AB1N0', 'AB1N1', 'AB1N2', 'AB1N3', 'AB1N9', 'AB1NS',
            'AB2N0', 'AB2N1', 'AB2N2', 'AB2N3', 'AB2N4', 'AB2N9', 'AB2NA', 'AB2NS',
            'AB3N0', 'AB3N1', 'AB3N2', 'AB3N3', 'AB3N4', 'AB3N5', 'AB3N9', 'AB3NA',
            'AB2P5', 'AB2Q5', 'AB2R5', 'AB3P6', 'AB3Q6', 'AB3R6'
        ])
    });
    const ANESTHESIA_FEES = Object.freeze({
        L0103: { clinic: 124350, hospital: 109000 },
        L0104: { clinic: 27980, hospital: 24520 },
        L1211: { clinic: 145420, hospital: 127470 },
        L1212: { clinic: 142280, hospital: 124720 },
        L1213: { clinic: 117170, hospital: 102710 },
        L1214: { clinic: 117660, hospital: 103140 },
        L1215: { clinic: 131920, hospital: 115630 },
        L1216: { clinic: 123600, hospital: 108340 },
        L1221: { clinic: 27980, hospital: 24520 },
        L1222: { clinic: 22440, hospital: 19670 },
        L1223: { clinic: 19360, hospital: 16970 },
        L1224: { clinic: 19360, hospital: 16970 },
        L1225: { clinic: 19360, hospital: 16970 },
        L1226: { clinic: 19360, hospital: 16970 }
    });
    const ANESTHESIA_TYPES = Object.freeze({
        general: { label: '완전히 잠드는 전신마취', base: 'L1211', extra: 'L1221' },
        mask: { label: '마스크 전신마취', base: 'L1212', extra: 'L1222' },
        spinal: { label: '하반신·척추마취', base: 'L1213', extra: 'L1223' },
        epidural: { label: '경막외마취', base: 'L1214', extra: 'L1224' },
        'nerve-block': { label: '팔·다리 신경차단마취', base: 'L1215', extra: 'L1225' },
        combined: { label: '척추·경막외 병용마취', base: 'L1216', extra: 'L1226' }
    });
    const BODY_RULES = Object.freeze([
        { key: 'finger', label: '손가락', query: /손가락|수지|finger/i, names: /수지|지골/ },
        { key: 'hand', label: '손·손목', query: /손목|손(?!가락)|수관절|수부|hand|wrist/i, names: /수관절|수부|수근골|중수골/ },
        { key: 'elbow', label: '팔꿈치', query: /팔꿈치|주관절|elbow/i, names: /주관절|주두/ },
        { key: 'shoulder', label: '어깨', query: /어깨|견관절|shoulder/i, names: /견관절|견갑골|쇄골/ },
        { key: 'arm', label: '팔', query: /팔|상지|상완|전완|arm/i, names: /상지|상완골|전완골|요골|척골/ },
        { key: 'toe', label: '발가락', query: /발가락|족지|toe/i, names: /족지|지골/ },
        { key: 'foot', label: '발', query: /발(?!목|가락)|족부|foot/i, names: /족부|족근골|중족골/ },
        { key: 'ankle', label: '발목', query: /발목|족관절|ankle/i, names: /발목|족관절|족근골/ },
        { key: 'knee', label: '무릎', query: /무릎|슬관절|슬개골|knee/i, names: /슬관절|슬개골/ },
        { key: 'lower-leg', label: '종아리', query: /종아리|하퇴|경골|비골|tibia|fibula/i, names: /하퇴|경골|비골/ },
        { key: 'thigh', label: '허벅지', query: /허벅지|대퇴|femur|thigh/i, names: /대퇴|대퇴골/ },
        { key: 'hip', label: '엉덩이·고관절', query: /엉덩이|고관절|hip/i, names: /고관절|대퇴골두|대퇴경부|대퇴골/ },
        { key: 'leg', label: '다리', query: /다리|하지|leg|lower limb/i, names: /하지|대퇴|하퇴|경골|비골|슬관절|슬개골|족관절|족부/ },
        { key: 'pelvis', label: '골반', query: /골반|천장골|pelvis/i, names: /골반|천장골|비구/ },
        { key: 'lumbar', label: '허리·요추', query: /허리|요추|요천추|lumbar|l-spine/i, names: /요추|요천추/ },
        { key: 'thoracic-spine', label: '등·흉추', query: /흉추|등뼈|thoracic spine|t-spine/i, names: /흉추/ },
        { key: 'cervical', label: '목·경추', query: /목뼈|경추|cervical|c-spine/i, names: /경추/ },
        { key: 'spine', label: '척추', query: /척추|spine/i, names: /척추|경추|흉추|요추|천추/ },
        { key: 'chest', label: '가슴·흉부', query: /가슴|흉부|흉곽|갈비뼈|늑골|chest|rib/i, names: /흉부|흉곽|늑골|흉골/ },
        { key: 'skull', label: '머리·두개골', query: /머리|두부|두개골|skull|head/i, names: /두부|두개골|안면골|하악|상악|관골/ }
    ]);

    function median(values) {
        const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
        if (!sorted.length) return 0;
        const middle = Math.floor(sorted.length / 2);
        return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
    }

    function providerKey(provider) {
        return provider === 'clinic' ? 'clinic' : 'hospital';
    }

    function isNaturalDeliveryCode(code) {
        return NATURAL_DELIVERY_CODES.has(String(code || '').toUpperCase());
    }

    function estimateNaturalDelivery(input) {
        if (!input || !isNaturalDeliveryCode(input.code)) throw new RangeError('지원되지 않는 자연분만 수가 코드');
        const providerAddOnRate = PROVIDER_ADD_ON_RATES[input.hospitalClass];
        if (providerAddOnRate === undefined) throw new RangeError('지원되지 않는 요양기관 종별');

        ['mealCount', 'mealUnitPrice', 'otherPatientPay'].forEach(field => {
            if (Object.prototype.hasOwnProperty.call(input, field)) {
                throw new RangeError(`${field} 임의 입력은 지원하지 않습니다`);
            }
        });

        const whole = (value, label, min = 0, max = Number.MAX_SAFE_INTEGER) => {
            if (value === null || value === undefined || value === '') throw new RangeError(label);
            const number = Number(value);
            if (!Number.isSafeInteger(number) || number < min || number > max) throw new RangeError(label);
            return number;
        };
        const safeMultiply = (left, right, label) => {
            const result = left * right;
            if (!Number.isSafeInteger(result)) throw new RangeError(label);
            return result;
        };
        const safeAdd = (left, right, label) => {
            const result = left + right;
            if (!Number.isSafeInteger(result)) throw new RangeError(label);
            return result;
        };
        const normalizeCode = (value, label) => {
            if (typeof value !== 'string' || !value.trim()) throw new RangeError(label);
            return value.trim().toUpperCase();
        };
        const normalizeLines = (value, feeMap, label) => {
            if (!Array.isArray(value)) throw new RangeError(`${label} 목록`);
            const seen = new Set();
            return value.map((line, index) => {
                if (!line || typeof line !== 'object' || Array.isArray(line)) throw new RangeError(`${label} ${index + 1}`);
                const code = normalizeCode(line.code, `${label} 수가 코드`);
                if (!feeMap[code]) throw new RangeError(`지원되는 급여 ${label} 수가 코드가 아닙니다: ${code}`);
                if (seen.has(code)) throw new RangeError(`중복 ${label} 수가 코드: ${code}`);
                seen.add(code);
                return { code, count: whole(line.count, `${code} 횟수`, 1), fee: feeMap[code] };
            });
        };

        const stayDays = whole(input.stayDays, '청구 입원일수', 1, 90);
        const roomBeds = whole(input.roomBeds, '병실 인원', 2, 6);
        if (!ROOM_BED_LETTERS[roomBeds]) throw new RangeError('지원되는 병실은 2~6인실입니다');
        if (input.hospitalClass === 'clinic' && roomBeds <= 3) {
            throw new RangeError('의원은 급여 2·3인실 AB 수가 코드를 지원하지 않습니다');
        }
        const clinicPrice = whole(input.clinicPrice, '공식 의원 분만 수가', 1);
        const hospitalPrice = whole(input.hospitalPrice, '공식 병원 분만 수가', 1);
        const unitPrice = input.hospitalClass === 'clinic' ? clinicPrice : hospitalPrice;

        const mealLines = normalizeLines(input.mealLines, COVERED_MEAL_FEES, '식대');
        const mealAddOns = normalizeLines(input.mealAddOns, COVERED_MEAL_ADD_ONS, '식대 가산');
        const allMealCodes = new Set();
        mealLines.concat(mealAddOns).forEach(line => {
            if (allMealCodes.has(line.code)) throw new RangeError(`중복 식대 수가 코드: ${line.code}`);
            allMealCodes.add(line.code);
        });

        mealLines.forEach(line => {
            if (line.fee.provider !== input.hospitalClass) {
                throw new RangeError(`${line.code}는 선택한 요양기관 종별과 일치하지 않습니다`);
            }
        });

        const generalMealCount = mealLines
            .filter(line => line.fee.kind === 'general')
            .reduce((sum, line) => safeAdd(sum, line.count, '일반식 횟수'), 0);
        const maternalMealCount = mealLines
            .filter(line => line.fee.kind === 'maternal')
            .reduce((sum, line) => safeAdd(sum, line.count, '산모식 횟수'), 0);
        const mealCount = safeAdd(generalMealCount, maternalMealCount, '전체 식사 횟수');
        const maxGeneralMealCount = safeMultiply(stayDays, 3, '일반식 허용 횟수');
        const maxMaternalMealCount = safeMultiply(stayDays, 4, '산모식 허용 횟수');
        const maxMealCount = safeMultiply(stayDays, 4, '전체 식사 허용 횟수');
        if (generalMealCount > maxGeneralMealCount) {
            throw new RangeError('일반식 횟수가 입원일수당 최대 3식을 초과합니다');
        }
        if (maternalMealCount > maxMaternalMealCount) {
            throw new RangeError('산모식 횟수가 입원일수당 최대 4식을 초과합니다');
        }
        if (mealCount > maxMealCount) {
            throw new RangeError('전체 식사 횟수가 입원일수당 최대 4식을 초과합니다');
        }
        mealAddOns.forEach(line => {
            const limit = line.fee.bound === 'general' ? generalMealCount : mealCount;
            if (line.count > limit) throw new RangeError(`${line.code} 횟수가 적용 가능한 식사 횟수를 초과합니다`);
        });

        const mealComponentsWithoutPatientPay = mealLines.concat(mealAddOns).map(line => {
            const grossFee = safeMultiply(line.fee.unitPrice, line.count, `${line.code} 총액`);
            return {
                code: line.code,
                label: line.fee.label,
                kind: line.fee.kind || 'add_on',
                count: line.count,
                unitPrice: line.fee.unitPrice,
                grossFee
            };
        });
        const mealGrossFee = mealComponentsWithoutPatientPay
            .reduce((sum, component) => safeAdd(sum, component.grossFee, '식대 총액'), 0);
        // 모든 기본식대·가산을 합한 뒤 50%를 적용하고 10원 미만을 한 번만 절사한다.
        const mealPatientPay = safeMultiply(Math.floor(mealGrossFee / 20), 10, '식대 본인부담액');
        // 행별 patientPay는 독립 산정액이 아니라 누적 총액 절사분의 결정적 배분이다.
        // 따라서 행 합계는 위에서 한 번 산정한 mealPatientPay와 항상 일치한다.
        let allocatedMealGross = 0;
        let allocatedMealPatientPay = 0;
        const mealComponents = mealComponentsWithoutPatientPay.map(component => {
            allocatedMealGross = safeAdd(allocatedMealGross, component.grossFee, '식대 누적 총액');
            const cumulativePatientPay = safeMultiply(Math.floor(allocatedMealGross / 20), 10, '식대 누적 본인부담액');
            const patientPay = cumulativePatientPay - allocatedMealPatientPay;
            allocatedMealPatientPay = cumulativePatientPay;
            return { ...component, patientPay };
        });

        let roomFeeCode = null;
        let roomPatientPay = 0;
        if (input.roomFeeCode !== undefined && input.roomFeeCode !== null && input.roomFeeCode !== '') {
            roomFeeCode = normalizeCode(input.roomFeeCode, '병실 수가 코드');
            if (!/^AB[1-4][0-9A-Z]{2}$/.test(roomFeeCode)) {
                throw new RangeError('지원되는 급여 병실 AB 수가 코드가 아닙니다');
            }
            if (!roomFeeCode.startsWith(PROVIDER_ROOM_PREFIXES[input.hospitalClass])) {
                throw new RangeError('병실 수가 코드가 선택한 요양기관 종별과 일치하지 않습니다');
            }
            if (roomBeds <= 3) {
                if (!COVERED_TWO_THREE_BED_ROOM_CODES[roomBeds].has(roomFeeCode)) {
                    const otherRoomBeds = roomBeds === 2 ? 3 : 2;
                    if (COVERED_TWO_THREE_BED_ROOM_CODES[otherRoomBeds].has(roomFeeCode)) {
                        throw new RangeError('병실 수가 코드가 선택한 병실 인원과 일치하지 않습니다');
                    }
                    throw new RangeError('공식 급여 2·3인실 기본 AB 수가 코드가 아닙니다');
                }
            } else {
                const roomMatch = /^AB[1-4]([AJE])([0-9A-Z])$/.exec(roomFeeCode);
                if (!roomMatch || roomMatch[1] !== ROOM_BED_LETTERS[roomBeds]) {
                    throw new RangeError('병실 수가 코드가 선택한 병실 인원과 일치하지 않습니다');
                }
            }
        }
        if (roomBeds <= 3) {
            if (!roomFeeCode) throw new RangeError('2·3인실은 병원이 확인한 급여 AB 병실 수가 코드가 필요합니다');
            if (!Object.prototype.hasOwnProperty.call(input, 'roomPatientPayTotal')) {
                throw new RangeError('2·3인실은 병원이 확인한 전체 입원기간 병실 본인부담 총액이 필요합니다');
            }
            roomPatientPay = whole(input.roomPatientPayTotal, '병원 확인 병실 본인부담 총액');
        } else if (Object.prototype.hasOwnProperty.call(input, 'roomPatientPayTotal')) {
            const submittedRoomPay = whole(input.roomPatientPayTotal, '병원 확인 병실 본인부담 총액');
            if (submittedRoomPay !== 0) throw new RangeError('자연분만 관련 4인실 이상 입원료 본인부담은 0원입니다');
        }

        // 공표 단가는 의원/병원 환산지수만 반영한 금액이다. R4(제9장)는 종별가산 대상.
        const providerAddOnAmount = Math.round(unitPrice * providerAddOnRate);
        if (!Number.isSafeInteger(providerAddOnAmount)) throw new RangeError('종별가산 금액');
        // 청구서 전체 요양급여비용총액1의 10원 미만 절사는 모든 청구행 합산 뒤 한 번만 한다.
        // 여기서는 다른 청구행을 알 수 없으므로 항목별 절사하지 않은 청구 합산 전 금액을 반환한다.
        const deliveryGrossFee = safeAdd(unitPrice, providerAddOnAmount, '분만 급여 총액');
        // 자연분만 급여 본인부담은 0원이고 식대만 50%다. 관련 입원 4인실 이상은
        // 장기입원 본인부담 인상 대상에서도 제외되므로 병실 본인부담을 더하지 않는다.
        const knownCoveredGrossFee = safeAdd(deliveryGrossFee, mealGrossFee, '확인된 급여 총액');
        const totalPatientPay = safeAdd(mealPatientPay, roomPatientPay, '환자부담 합계');
        const roomPatientShareRate = roomBeds >= 4
            ? 0
            : (input.hospitalClass === 'tertiary_hospital'
                ? (roomBeds === 2 ? 0.5 : 0.4)
                : (input.hospitalClass === 'clinic' ? null : (roomBeds === 2 ? 0.4 : 0.3)));
        return {
            providerAddOnRate, unitPrice, providerAddOnAmount, deliveryGrossFee,
            deliveryGrossFeeIsPreClaim: true,
            wholeClaimRoundingApplied: false,
            deliveryPatientShareRate: 0, deliveryPatientPay: 0,
            mealPatientShareRate: 0.5, mealCount, generalMealCount, maternalMealCount,
            mealComponents, mealGrossFee, mealPatientPay,
            stayDays, roomBeds, roomFeeCode, roomPatientShareRate, roomPatientPay,
            otherPatientPay: 0, knownCoveredGrossFee, knownCoveredGrossFeeIsPreClaim: true, totalPatientPay
        };
    }

    function itemPrice(item, provider) {
        const key = providerKey(provider);
        return Number(key === 'clinic'
            ? (item.clinicPrice ?? item.clinic_price ?? item.price)
            : (item.hospitalPrice ?? item.hospital_price ?? item.price)) || 0;
    }

    function feePrice(code, provider) {
        return ANESTHESIA_FEES[code][providerKey(provider)];
    }

    function durationPrice(type, durationMinutes, provider) {
        const rule = ANESTHESIA_TYPES[type];
        const extraUnits = Math.ceil(Math.max(0, Number(durationMinutes || 60) - 60) / 15);
        return feePrice(rule.base, provider) + (feePrice(rule.extra, provider) * extraUnits);
    }

    function ageMultiplier(ageGroup) {
        if (ageGroup === 'newborn') return 1.6;
        if (ageGroup === 'infant' || ageGroup === 'elderly') return 1.3;
        return 1;
    }

    function estimateEpisode(plan, provider) {
        const duration = Math.max(1, Number(plan.durationMinutes || 60));
        let mainCharge = 0;
        let range = null;
        let label = plan.type === 'local' ? '작은 부위 국소마취(별도 산정 없음)' : '마취 없음';
        let codes = [];

        if (ANESTHESIA_TYPES[plan.type]) {
            const rule = ANESTHESIA_TYPES[plan.type];
            mainCharge = durationPrice(plan.type, duration, provider);
            label = rule.label;
            codes = [rule.base, rule.extra];
        } else if (plan.type === 'unknown') {
            const candidates = Object.keys(ANESTHESIA_TYPES).map(type => durationPrice(type, duration, provider));
            mainCharge = median(candidates);
            range = { min: Math.min(...candidates), max: Math.max(...candidates) };
            label = '마취 방법을 잘 모름(공식 마취료 중앙값)';
        }

        let sedationCharge = 0;
        let sedationNote = '';
        if (plan.sedation && ['local', 'none'].includes(plan.type)) {
            const extraUnits = Math.ceil(Math.max(0, duration - 30) / 15);
            sedationCharge = feePrice('L0103', provider) + (feePrice('L0104', provider) * extraUnits);
            codes.push('L0103', 'L0104');
            sedationNote = '감시하 전신마취관리(MAC) 진정관리료 반영';
        } else if (plan.sedation) {
            sedationNote = '전신·부위마취와 진정관리료는 중복 산정하지 않음';
        }

        const multiplier = ageMultiplier(plan.ageGroup);
        const total = Math.round((mainCharge + sedationCharge) * multiplier);
        return { total, durationMinutes: duration, label, codes, range, sedationNote, ageMultiplier: multiplier };
    }

    function estimateAnesthesia(surgeries, provider) {
        const episodesById = new Map();
        (surgeries || []).forEach((surgery, index) => {
            const plan = surgery && surgery.anesthesia;
            if (!plan) return;
            const sessionId = plan.sessionId || `surgery-${surgery.id || index}`;
            episodesById.set(sessionId, { ...plan, sessionId });
        });
        const episodes = Array.from(episodesById.values()).map(plan => ({
            sessionId: plan.sessionId,
            ...estimateEpisode(plan, provider)
        }));
        return {
            total: episodes.reduce((sum, episode) => sum + episode.total, 0),
            episodes,
            sourceDate: SOURCE_DATE
        };
    }

    function resolveBody(query) {
        return BODY_RULES.find(rule => rule.query.test(String(query || ''))) || null;
    }

    function estimateItem(body, kind, bucket, rows, provider) {
        const prices = rows.map(item => itemPrice(item, provider)).filter(price => price > 0);
        if (!prices.length) return null;
        const bucketLabels = { surgery: '수술 치료', nonsurgery: '수술하지 않는 치료', unknown: '치료 방법 잘 모름' };
        const isFracture = kind === 'fracture';
        return {
            code: `ESTIMATE_${kind.toUpperCase()}_${body.key.toUpperCase()}_${bucket || 'MEDIAN'}`,
            category: isFracture && bucket === 'surgery' ? 'surgery' : (isFracture ? 'procedure' : 'imaging'),
            group: isFracture && bucket === 'surgery' ? 'surgery' : (isFracture ? 'procedure_hira' : 'test'),
            type: `${kind}_estimate`,
            name: isFracture
                ? `${body.label} 골절 · ${bucketLabels[bucket]} 대표 예상`
                : `${body.label} 엑스레이 대표 예상`,
            price: median(prices),
            clinicPrice: median(rows.map(item => itemPrice(item, 'clinic')).filter(price => price > 0)),
            hospitalPrice: median(rows.map(item => itemPrice(item, 'hospital')).filter(price => price > 0)),
            isBenefit: true,
            alreadyPricedByProvider: true,
            estimateKind: kind,
            estimateBucket: bucket || 'median',
            estimateRange: { min: Math.min(...prices), max: Math.max(...prices) },
            estimateSampleCount: prices.length,
            publicFeeScheduleSource: `심평원 ${SOURCE_DATE} 공식 수가 ${prices.length}개 중앙값`,
            keywords: [body.label, isFracture ? '골절' : '엑스레이']
        };
    }

    function createConsumerEstimateItems(query, items, provider) {
        const body = resolveBody(query);
        if (!body) return [];
        const clean = String(query || '').toLowerCase();

        if (/엑스레이|x\s*-?\s*(?:ray|lay)/i.test(clean)) {
            const rows = (items || []).filter(item =>
                /^FEE_G/i.test(String(item.code || ''))
                && body.names.test(String(item.name || ''))
                && !/C-Arm|투시|단층|조영|증폭|골밀도|파노라마|특수/i.test(String(item.name || ''))
                && /\d매|매 또는 그 이상/.test(String(item.name || ''))
            );
            return [estimateItem(body, 'xray', null, rows, provider)].filter(Boolean);
        }

        if (/골절/.test(clean)) {
            const rows = (items || []).filter(item =>
                /^FEE_N/i.test(String(item.code || ''))
                && /골절/.test(String(item.name || ''))
                && !/골절제|연골절|미세골절|골절술/.test(String(item.name || ''))
                && body.names.test(String(item.name || ''))
            );
            const surgeryRows = rows.filter(item => /관혈|수술|pinning|고정/i.test(String(item.name || '')));
            const nonSurgeryRows = rows.filter(item => /도수|비관혈/i.test(String(item.name || '')));
            return [
                estimateItem(body, 'fracture', 'surgery', surgeryRows, provider),
                estimateItem(body, 'fracture', 'nonsurgery', nonSurgeryRows, provider),
                estimateItem(body, 'fracture', 'unknown', rows, provider)
            ].filter(Boolean);
        }

        return [];
    }

    return Object.freeze({ ANESTHESIA_FEES, PROVIDER_ADD_ON_RATES, COVERED_MEAL_FEES, COVERED_MEAL_ADD_ONS, sourceDate: SOURCE_DATE,
        createConsumerEstimateItems, estimateAnesthesia, resolveBody,
        isNaturalDeliveryCode, estimateNaturalDelivery });
}));
