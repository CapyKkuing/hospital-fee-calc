(function (root) {
    const CALCULATOR_SCRIPTS = Object.freeze([
        'assets/js/hira_codes.js',
        'assets/js/nonbenefit_data.js',
        'assets/js/fee_schedule_items.js',
        'assets/js/medical-estimator.js',
        'assets/js/search-telemetry.js',
        'assets/js/script.js'
    ]);
    const DEFERRED_CALCULATOR_SCRIPTS = Object.freeze([
        'assets/js/medical_statistics.js'
    ]);

    function getMissingRequiredSelections(selections) {
        const missing = [];
        if (!selections.hospitalClass) missing.push('병원 등급');
        if (!selections.treatmentType) missing.push('진료 형태');
        if (!selections.nonBenefitRegion) missing.push('비급여 기준 지역');
        return missing;
    }

    function shouldLoadForHash(hash) {
        return hash === '#calculator';
    }

    function getResultScrollBehavior(reducedMotion) {
        return reducedMotion?.matches ? 'auto' : 'smooth';
    }

    function initShell() {
        const section = root.document.getElementById('calculator');
        const runtime = section?.querySelector('.calculator-runtime');
        const loader = root.document.getElementById('calculator-loader');
        if (!section || !runtime || !loader) return;

        let loadPromise = null;
        let activeStep = 1;

        function hasEnhancedFeatureAccess() {
            return root.MEDICostConsent?.canUseEnhancedFeatures?.(
                root.MEDICostConsent.readConsent()
            ) === true;
        }

        function requestEnhancedFeatureAccess() {
            root.MEDICostConsent?.openDialog?.({
                message: '프로토타입 선택 조건과 추가 검색은 자체 방문·검색 통계 수집에 동의한 경우 사용할 수 있습니다. 동의하지 않아도 필수 조건 계산은 가능합니다.'
            });
        }

        function replaceIcons() {
            if (root.lucide) root.lucide.createIcons({ attrs: { 'stroke-width': 1.8 } });
        }

        function loadScript(src) {
            return new Promise((resolve, reject) => {
                const existing = root.document.querySelector(`script[data-calculator-src="${src}"]`);
                if (existing?.dataset.loaded === 'true') {
                    resolve();
                    return;
                }
                if (existing) {
                    existing.addEventListener('load', resolve, { once: true });
                    existing.addEventListener('error', reject, { once: true });
                    return;
                }
                const script = root.document.createElement('script');
                script.src = src;
                script.dataset.calculatorSrc = src;
                script.addEventListener('load', () => {
                    script.dataset.loaded = 'true';
                    resolve();
                }, { once: true });
                script.addEventListener('error', () => {
                    script.remove();
                    reject(new Error('calculator_asset_failed'));
                }, { once: true });
                root.document.body.appendChild(script);
            });
        }

        function setLoaderError() {
            loader.replaceChildren();
            const content = root.document.createElement('div');
            content.className = 'loader-content';
            const title = root.document.createElement('strong');
            title.textContent = '계산 데이터를 불러오지 못했습니다';
            const message = root.document.createElement('span');
            message.textContent = '네트워크 상태를 확인한 뒤 다시 시도해 주세요.';
            const retry = root.document.createElement('button');
            retry.type = 'button';
            retry.className = 'button-primary';
            retry.textContent = '다시 시도';
            retry.addEventListener('click', () => {
                loadPromise = null;
                loader.replaceChildren(content);
                loadCalculator();
            }, { once: true });
            content.append(title, message, retry);
            loader.append(content);
        }

        function updateDataDates() {
            const feeDate = root.MedicalEstimator?.sourceDate || root.PUBLIC_FEE_SCHEDULE_ITEMS?.sourceDate || '급여 수가 준비 중';
            const nonBenefitDate = root.NONBENEFIT_REGION_PRICES?.fetchedAt || '비급여 기준일 확인 불가';
            const label = `급여 ${feeDate} · 비급여 ${nonBenefitDate}`;
            const footerDate = root.document.getElementById('data-reference-date');
            const heroDate = root.document.getElementById('hero-data-date');
            if (footerDate) footerDate.textContent = label;
            if (heroDate) heroDate.textContent = label;
        }

        function loadCalculator() {
            if (loadPromise) return loadPromise;
            section.classList.add('is-loading');
            loadPromise = CALCULATOR_SCRIPTS.reduce(
                (chain, src) => chain.then(() => loadScript(src)),
                Promise.resolve()
            ).then(async () => {
                if (root.MEDICostCalculator) await root.MEDICostCalculator.init();
                runtime.inert = false;
                section.classList.remove('is-loading');
                section.classList.add('is-ready');
                updateDataDates();
                replaceIcons();
                Promise.all(DEFERRED_CALCULATOR_SCRIPTS.map(loadScript))
                    .then(() => {
                        updateDataDates();
                        replaceIcons();
                    })
                    .catch(() => undefined);
            }).catch(() => {
                section.classList.remove('is-loading');
                setLoaderError();
                throw new Error('calculator_load_failed');
            });
            return loadPromise;
        }

        function currentSelections() {
            return {
                hospitalClass: root.document.querySelector('input[name="hospital_class"]:checked')?.value || '',
                treatmentType: root.document.querySelector('input[name="treatment_type"]:checked')?.value || '',
                nonBenefitRegion: root.document.getElementById('nonbenefit_region')?.value || ''
            };
        }

        function updateSelectionSummary() {
            const labels = {
                hospitalClass: {
                    clinic: '동네 의원',
                    hospital: '일반 병원',
                    general_hospital: '종합병원',
                    tertiary_hospital: '대학병원'
                },
                treatmentType: { outpatient: '일반 외래', er: '응급실', inpatient: '입원 치료' }
            };
            const selections = currentSelections();
            const region = root.document.getElementById('nonbenefit_region');
            const regionLabel = region?.selectedOptions?.[0]?.textContent?.trim();
            const items = root.document.getElementById('selection-summary-items');
            const addedCount = root.document.querySelectorAll('#added_items_unified_list .added-item').length;
            const values = [
                labels.hospitalClass[selections.hospitalClass] || '병원 미선택',
                labels.treatmentType[selections.treatmentType] || '진료 형태 미선택',
                selections.nonBenefitRegion ? regionLabel : '비급여 지역 미선택',
                root.document.getElementById('has_sanjeong')?.checked ? '산정특례 적용' : '산정특례 미적용',
                root.document.getElementById('has_disease_code')?.checked ? '상병코드 적용' : '상병코드 미적용',
                `추가 ${addedCount}건`
            ];
            if (items) {
                items.replaceChildren(...values.map(value => {
                    const chip = root.document.createElement('span');
                    chip.className = 'selection-chip';
                    chip.textContent = value;
                    return chip;
                }));
            }
        }

        function updateInsuranceStatus() {
            const status = root.document.getElementById('result-insurance-status');
            if (!status) return;
            if (!hasEnhancedFeatureAccess()) {
                status.textContent = '기본 계산 모드입니다. 선택 조건과 실손보험은 반영하지 않습니다.';
                return;
            }
            status.textContent = root.document.getElementById('has_insurance')?.checked
                ? '실손보험 적용 상태입니다. 보험 세대를 바꾸면 예상 환급금이 바로 반영됩니다.'
                : '실손보험 미적용 상태입니다. 3단계에서 보험 적용 여부를 선택할 수 있습니다.';
        }

        function showStep(nextStep, focusHeading = true) {
            activeStep = nextStep;
            root.document.querySelectorAll('[data-step-panel]').forEach(panel => {
                panel.hidden = Number(panel.dataset.stepPanel) !== activeStep;
            });
            root.document.querySelectorAll('[data-step-target]').forEach(button => {
                const step = Number(button.dataset.stepTarget);
                if (step === activeStep) button.setAttribute('aria-current', 'step');
                else button.removeAttribute('aria-current');
                button.dataset.complete = String(step < activeStep);
            });
            const descriptions = {
                1: '1단계: 병원 등급, 진료 형태, 비급여 기준 지역을 선택하세요.',
                2: '2단계: 알고 있는 상병코드와 치료·검사 항목을 선택적으로 추가하세요.',
                3: hasEnhancedFeatureAccess()
                    ? '3단계: 실손보험 적용 여부와 현재 선택 조건을 확인하세요.'
                    : '기본 계산 결과: 필수 조건만 반영했습니다.'
            };
            root.document.getElementById('step-status').textContent = descriptions[activeStep];
            updateSelectionSummary();
            updateInsuranceStatus();
            if (focusHeading) {
                const heading = root.document.getElementById(`step-${activeStep}-title`);
                heading.tabIndex = -1;
                heading.focus();
            }
        }

        function validateStepOne() {
            const missing = getMissingRequiredSelections(currentSelections());
            const error = root.document.getElementById('step-1-error');
            if (missing.length === 0) {
                error.textContent = '';
                return true;
            }
            error.textContent = `${missing.join(', ')}을(를) 선택해 주세요.`;
            const focusTarget = !currentSelections().hospitalClass
                ? root.document.querySelector('input[name="hospital_class"]')
                : !currentSelections().treatmentType
                    ? root.document.querySelector('input[name="treatment_type"]')
                    : root.document.getElementById('nonbenefit_region');
            focusTarget?.focus();
            return false;
        }

        function goToStep(step) {
            if (step > 1 && !validateStepOne()) {
                showStep(1, false);
                return false;
            }
            if (step === 2 && !hasEnhancedFeatureAccess()) {
                requestEnhancedFeatureAccess();
                return false;
            }
            showStep(step);
            return true;
        }

        function updateFeatureGate() {
            const enabled = hasEnhancedFeatureAccess();
            const secondStepButton = root.document.querySelector('[data-step-target="2"]');
            const secondStepPanel = root.document.querySelector('[data-step-panel="2"]');
            const insuranceInput = root.document.getElementById('has_insurance');
            const insuranceGeneration = root.document.getElementById('insurance_generation');
            const gateNote = root.document.getElementById('feature-gate-note');
            const insuranceNote = root.document.getElementById('insurance-gate-note');
            const resultBackButton = root.document.getElementById('step-3-back');
            section.dataset.enhancedFeatures = String(enabled);
            if (secondStepButton) {
                secondStepButton.setAttribute('aria-disabled', String(!enabled));
                secondStepButton.title = enabled ? '' : '자체 방문·검색 통계 수집 동의 후 프로토타입 선택 조건과 추가 검색을 사용할 수 있습니다.';
            }
            if (secondStepPanel) secondStepPanel.inert = !enabled;
            if (insuranceInput) insuranceInput.disabled = !enabled;
            if (insuranceGeneration) insuranceGeneration.disabled = !enabled;
            if (gateNote) gateNote.hidden = enabled;
            if (insuranceNote) insuranceNote.hidden = enabled;
            if (resultBackButton) resultBackButton.textContent = enabled ? '선택 조건으로' : '필수 조건으로';
            updateInsuranceStatus();
        }

        const specialBox = root.document.querySelector('.sanjeong-toggle-box');
        const specialSlot = root.document.getElementById('sanjeong-step-slot');
        if (specialBox && specialSlot) specialSlot.appendChild(specialBox);
        const advancedPanel = root.document.getElementById('advanced-items-panel');
        const advancedDisease = root.document.querySelector('[data-advanced-disease]');
        if (advancedPanel && advancedDisease) advancedPanel.prepend(advancedDisease);

        function showResult(options = {}) {
            const basicOnly = options.basicOnly === true || !hasEnhancedFeatureAccess();
            if (!goToStep(3)) return;
            if (basicOnly) root.MEDICostCalculator?.prepareBasicCalculation?.();
            root.requestCalculation?.();
            updateFeatureGate();
            updateInsuranceStatus();
            root.document.querySelector('.result-card')?.scrollIntoView({
                behavior: getResultScrollBehavior(root.matchMedia?.('(prefers-reduced-motion: reduce)')),
                block: 'start'
            });
        }

        const advancedToggle = root.document.getElementById('advanced-items-toggle');
        advancedToggle?.addEventListener('click', () => {
            const open = advancedToggle.getAttribute('aria-expanded') !== 'true';
            advancedToggle.setAttribute('aria-expanded', String(open));
            advancedToggle.textContent = open ? '고급 항목 닫기' : '고급 항목 열기';
            if (advancedPanel) advancedPanel.hidden = !open;
        });

        root.document.querySelectorAll('[data-load-calculator]').forEach(link => {
            link.addEventListener('click', () => loadCalculator().catch(() => undefined));
        });
        root.document.querySelectorAll('[data-step-target]').forEach(button => button.addEventListener('click', () => {
            const step = Number(button.dataset.stepTarget);
            if (step === 3 && !hasEnhancedFeatureAccess()) showResult({ basicOnly: true });
            else goToStep(step);
        }));
        root.document.querySelectorAll('[data-step-next]').forEach(button => button.addEventListener('click', () => {
            const step = Number(button.dataset.stepNext);
            if (step === 3) showResult();
            else goToStep(step);
        }));
        root.document.querySelector('[data-step-basic-result]')?.addEventListener('click', () => showResult({ basicOnly: true }));
        root.document.querySelector('[data-step-quick-result]')?.addEventListener('click', showResult);
        root.document.querySelectorAll('[data-step-back]').forEach(button => button.addEventListener('click', () => {
            const step = Number(button.dataset.stepBack);
            showStep(step === 2 && !hasEnhancedFeatureAccess() ? 1 : step);
        }));
        root.document.querySelectorAll('[data-reset-calculator]').forEach(button => button.addEventListener('click', () => {
            root.resetCalculatorState?.();
            showStep(1, false);
            updateSelectionSummary();
            updateInsuranceStatus();
            const status = root.document.getElementById('calculator-reset-status');
            if (status) status.textContent = '계산 조건과 추가 항목을 초기화했습니다.';
            root.document.querySelector('input[name="hospital_class"]')?.focus();
        }));
        root.document.getElementById('calculator-form')?.addEventListener('change', () => {
            updateSelectionSummary();
            updateInsuranceStatus();
        });
        root.document.addEventListener('medicost:items-changed', updateSelectionSummary);
        root.addEventListener('medicost:consent-changed', () => {
            updateFeatureGate();
            if (!hasEnhancedFeatureAccess() && activeStep === 2) showStep(1, false);
            if (!hasEnhancedFeatureAccess() && activeStep === 3) {
                root.MEDICostCalculator?.prepareBasicCalculation?.();
                root.requestCalculation?.();
                updateSelectionSummary();
            }
        });

        const observer = new IntersectionObserver(entries => {
            if (entries.some(entry => entry.isIntersecting)) {
                loadCalculator().catch(() => undefined);
                observer.disconnect();
            }
        }, { rootMargin: '0px', threshold: 0.05 });
        observer.observe(section);

        replaceIcons();
        updateSelectionSummary();
        updateFeatureGate();
        updateInsuranceStatus();
        showStep(1, false);
        if (shouldLoadForHash(root.location.hash)) loadCalculator().catch(() => undefined);
    }

    const api = { CALCULATOR_SCRIPTS, DEFERRED_CALCULATOR_SCRIPTS, getMissingRequiredSelections, getResultScrollBehavior, shouldLoadForHash };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root.document) {
        if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', initShell, { once: true });
        else initShell();
    }
}(typeof window === 'undefined' ? globalThis : window));
