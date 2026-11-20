import CMP from "./CMP.js";

export default class ConsentEngine {
    constructor(config, consentTypes, handledCallback) {
        let self = this;

        this.consentTypes = consentTypes;

        this.cmps = [];

        this.handledCallback = handledCallback;

        this.triedCMPs = new Set();

        this.numClicks = 0;
        this.pipEnabled = false;

        Object.keys(config).forEach((key) => {
            try {
                self.cmps.push(new CMP(key, config[key]));
            } catch (err) {
                console.groupCollapsed("Invalid CMP (" + key + ") detected, please update GDPR consent engine or fix the rule generating this error:");
                console.error(err);
                console.groupEnd();
            }
        });

        this.cmps.sort((cmp1, cmp2) => {
            if (cmp1.isUtility()) {
                return -1;
            } else if (cmp2.isUtility()) {
                return 1;
            } else {
                return 0;
            }
        })

        this.setupObserver();
        this.startObserver();

        this.startStopTimeout();

        window.addEventListener("DOMContentLoaded", ()=>{
            self.handleMutations([]);
        });
        this.domScannerIntervalID = setInterval(()=>{
            self.handleMutations([]);
        }, 500);
    }


    /**
     * Generates or removes a temporary custom stylesheet that enforces the currently stored scroll behaviours
     */
    static enforceScrollBehaviours(shouldEnforce) {
        //Make sure we enforce on parent if inside iframe
        let insideIframe = window !== window.parent;
    
        if(insideIframe) {
            //find top most window
            let top = window.parent;
            while(top !== top.parent){
                top = top.parent;
            }

            chrome.runtime.sendMessage("GetTabUrl", (url)=>{
                url = url.substring(0, url.indexOf("/", 8));
                top.postMessage({"enforceScrollBehaviours": shouldEnforce}, url);
            });
        }
    
        let stylesheetElement = document.querySelector("#consent-scrollbehaviour-override");
        if (stylesheetElement) {
            stylesheetElement.textContent = "";
        }

        document.querySelector("html").classList.remove("consent-scrollbehaviour-override");
        document.querySelector("body").classList.remove("consent-scrollbehaviour-override");

        if (!shouldEnforce) return;

        document.querySelector("html").classList.add("consent-scrollbehaviour-override");
        document.querySelector("body").classList.add("consent-scrollbehaviour-override");

        if (!stylesheetElement) {
            stylesheetElement = document.createElement("style");
            stylesheetElement.id = "consent-scrollbehaviour-override";
            document.documentElement.appendChild(stylesheetElement);
        }
        let content = Object.entries(window.consentScrollBehaviours).map(entry => {
            const [element, rules] = entry;
            return element + "{" + rules.map(rule => {
                let hasImportant = rule.value.includes("important");
                return rule.property + ":" + rule.value + (hasImportant ? "" : "!important");
            }).join(";") + "}";
        }).join("");
        if (ConsentEngine.debugValues.debugLog) {
            console.log(content);
        }
        stylesheetElement.textContent = content;
    }


    enablePip() {
        this.pipEnabled = true;
        if (this.modal != null) {
            this.modal.classList.add("ConsentOMatic-PIP")
        }
        ConsentEngine.enforceScrollBehaviours(true);
    }

    registerClick() {
        let clickFraction = 1 / this.currentMethodStepsTotal;

        this.numClicks++;

        if (this.currentMethodFraction == 0) {
            this.currentMethodFraction = clickFraction;
        } else {
            let rest = 1 - this.currentMethodFraction;

            this.currentMethodFraction += rest * (clickFraction / 2.0);
        }

        this.calculateProgress();
    }

    getClicksSoFar() {
        return this.numClicks;
    }

    currentMethodDone() {
        this.completedSteps += this.currentMethodStepsTotal;
        this.currentMethodFraction = 1;
        this.calculateProgress();
        this.currentMethodStepsTotal = 0;
        this.currentMethodFraction = 0;
    }

    startStopTimeout() {
        const self = this;

        if (this.stopEngineId != null) {
            clearTimeout(this.stopEngineId);
        }

        this.stopEngineId = setTimeout(() => {
            // 창이 뜨는지 확인하는 중이면 "못 찾음"을 알리지 않고 다시 기다림
            // (알려 버리면 다른 엔진이 시작돼 같은 창을 둘이 처리할 수 있음)
            // 확인 도중 예외로 checkRunning이 true로 남는 경우에 대비해 6회(약 30초)까지만 미룸
            if (self.checkRunning && (self.stopRetries = (self.stopRetries || 0) + 1) <= 6) {
                self.startStopTimeout();
                return;
            }
            if (ConsentEngine.debugValues.debugLog) {
                console.log("No CMP detected in 5 seconds, stopping engine...");
            }

            if(self.queueId != null) {
                clearTimeout(self.queueId);
            }

            clearInterval(self.domScannerIntervalID);

            self.handledCallback({
                handled: false
            });
            this.stopObserver();
        }, 5000);
    }

    async handleMutations(mutations) {
        const self = this;

        if (this.queueId == null && !self.checkRunning) {
            this.queueId = setTimeout(async () => {
                self.queueId = null;
                try {
                    self.checkForCMPs();
                } catch (e) {
                    console.error(e);
                }
            }, 250);
        }
    }

    async checkForCMPs() {
        const self = this;

        self.checkRunning = true;

        //Wait for a super small while, to make async
        await new Promise((resolve)=>{
            setTimeout(()=>{
                resolve();
            }, 0);
        });

        if (ConsentEngine.debugValues.debugLog) {
            console.groupCollapsed("findCMP");
        }
        let cmps = this.findCMP();
        if (ConsentEngine.debugValues.debugLog) {
            console.groupEnd();
        }

        cmps = cmps.filter((cmp) => {
            return !self.triedCMPs.has(cmp.name);
        });

        if (cmps.length > 0) {
            this.stopObserver();

            if (cmps.length > 1) {
                // 한 페이지에서 규칙이 여러 개 맞은 경우. 첫 번째 규칙으로 진행하므로 오류는 아님
                console.log("쿠키 도우미: 맞는 규칙 " + cmps.length + "개, 첫 번째로 진행:", cmps.map((c) => c.name).join(", "));
            }

            let cmp = cmps[0];

            if (ConsentEngine.debugValues.debugLog) {
                console.log("CMP Detected: ", cmp.name);
                console.groupCollapsed(cmp.name + " - isShowing?");
            }

            this.triedCMPs.add(cmp.name);

            //Check if popup shows, then do consent stuff
            let numberOfTries = 5;
            async function checkIsShowing() {
                if (cmp.isShowing()) {
                    self.currentCMP = cmp;
                    if (ConsentEngine.debugValues.debugLog) {
                        console.groupEnd();
                        console.log(cmp.name + " - Showing");
                    }
                    setTimeout(async () => {
                        if (cmp.isUtility()) {
                            if (ConsentEngine.debugValues.debugLog) {
                                console.groupCollapsed(cmp.name + " - UTILITY");
                            }
                            await cmp.runMethod("UTILITY", self.consentTypes);
                            if (ConsentEngine.debugValues.debugLog) {
                                console.groupEnd();
                            }
                            if (!ConsentEngine.debugValues.skipHideMethod) {
                                if (!ConsentEngine.debugValues.dontHideProgressDialog) {
                                    cmp.stopObservers();
                                }
                            }

                            self.checkRunning = false;

                            self.startObserver();
                            self.handleMutations([]);
                        } else {
                            try {
                                self.numClicks = 0;

                                // 처리 전 쿠키 상태를 먼저 기록하게 함 (최대 1.5초 대기)
                                await new Promise((resolve) => {
                                    const timer = setTimeout(resolve, 1500);
                                    try {
                                        chrome.runtime.sendMessage("CMPShowing", () => {
                                            void chrome.runtime.lastError;
                                            clearTimeout(timer);
                                            resolve();
                                        });
                                    } catch (e) {
                                        clearTimeout(timer);
                                        resolve();
                                    }
                                });

                                if (!ConsentEngine.debugValues.skipHideMethod) {
                                    self.showProgressDialog("쿠키 창 처리 중");
                                }

                                self.totalSteps = cmp.getNumSteps();
                                self.completedSteps = 0;
                                self.currentMethodStepsTotal = 0;
                                self.currentMethodFraction = 0;
                                self.updateProgress(0);

                                if (!ConsentEngine.debugValues.skipHideMethod) {
                                    if (ConsentEngine.debugValues.debugLog) {
                                        console.groupCollapsed(cmp.name + " - HIDE_CMP");
                                    }
                                    await cmp.runMethod("HIDE_CMP", self.consentTypes);
                                    // 사라지는 움직임이 끝난 뒤 버튼을 누름 (사이트가 창을 먼저 닫아 버리면 움직임이 끊김)
                                    if (cmp.hiddenTargets.length > 0) {
                                        await new Promise((resolve) => setTimeout(resolve, 820));
                                    }

                                    if (ConsentEngine.debugValues.debugLog) {
                                        console.groupEnd();
                                    }
                                }
                                if(!ConsentEngine.debugValues.skipOpenMethod) {
                                    if (ConsentEngine.debugValues.debugLog) {
                                        console.groupCollapsed(cmp.name + " - OPEN_OPTIONS");
                                    }
                                }
                                await cmp.runMethod("OPEN_OPTIONS", self.consentTypes);
                                if (ConsentEngine.debugValues.debugLog) {
                                    console.groupEnd();
                                }

                                if (!ConsentEngine.debugValues.skipHideMethod) {
                                    if (ConsentEngine.debugValues.debugLog) {
                                        console.groupCollapsed(cmp.name + " - HIDE_CMP");
                                    }
                                    await cmp.runMethod("HIDE_CMP", self.consentTypes);
                                    if (ConsentEngine.debugValues.debugLog) {
                                        console.groupEnd();
                                    }
                                }

                                if (ConsentEngine.debugValues.debugLog) {
                                    console.groupCollapsed(cmp.name + " - DO_CONSENT");
                                }
                                await cmp.runMethod("DO_CONSENT", self.consentTypes);
                                if (ConsentEngine.debugValues.debugLog) {
                                    console.groupEnd();
                                }

                                if (!ConsentEngine.debugValues.skipSubmit) {
                                    if (ConsentEngine.debugValues.debugLog) {
                                        console.groupCollapsed(cmp.name + " - SAVE_CONSENT");
                                    }
                                    await cmp.runMethod("SAVE_CONSENT", self.consentTypes);
                                    if (ConsentEngine.debugValues.debugLog) {
                                        console.groupEnd();
                                    }
                                }
                                if (!(self.numClicks > 0)) {
                                    if (ConsentEngine.debugValues.debugLog) {
                                        console.log("Consent-O-Matic click count was 0 for CMP:", self.numClicks, cmp.name);
                                    }
                                    self.numClicks = 0; // Catch-all for NaN, negative numbers etc.
                                }

                                self.updateProgress(1.0);

                                self.lastHandledOk = true;
                                self.handledCallback({
                                    handled: true,
                                    cmpName: cmp.name,
                                    clicks: self.numClicks
                                });
                            } catch (e) {
                                console.log("Error during consent handling:", e);
                                self.handledCallback({
                                    handled: false,
                                    error: true
                                });
                            }
                            if (!ConsentEngine.debugValues.skipHideMethod) {
                                if (!ConsentEngine.debugValues.dontHideProgressDialog) {
                                    self.currentCMP = null;
                                    self.hideProgressDialog();
                                    cmp.stopObservers();
                                    cmp.unHideAll();
                                }
                            }
                            clearTimeout(self.stopEngineId);
                            clearInterval(self.domScannerIntervalID);

                            self.checkRunning = false;

                            // Remove focus from anything inside the closed popups
                            window.focus();
                            if (document.activeElement) document.activeElement.blur();
                            document.body.focus();
                        }
                    }, 0);
                } else {
                    if (numberOfTries > 0) {
                        numberOfTries--;
                        setTimeout(checkIsShowing, 250);
                    } else {
                        if (ConsentEngine.debugValues.debugLog) {
                            console.groupEnd();
                            console.log(cmp.name + " - Not showing");
                        }
                        self.checkRunning = false;
                        self.startObserver();
                        self.startStopTimeout()
                        self.handleMutations([]);
                    }
                }
            }

            await checkIsShowing();
        } else {
            self.checkRunning = false;
        }
    }

    unHideAll() {
        if (this.currentCMP != null) {
            this.currentCMP.stopObservers();
            this.currentCMP.unHideAll();
        }
    }

    showProgressDialog(text) {
        const self = this;

        if (ConsentEngine.debugValues.debugLog) {
            console.log("Showing progress...");
        }
        if (this.dialogTimeoutId != null) {
            clearTimeout(this.dialogTimeoutId);
            this.dialogTimeoutId = null;
            if (this.dialog != null) {
                this.dialog.remove();
                this.dialog = null;
            }
            if (this.modal != null) {
                this.modal.remove();
                this.modal = null;
            }
        }

        this.modal = document.createElement("div");
        this.modal.classList.add("ConsentOMatic-Progress-Dialog-Modal");
        this.dialog = document.createElement("div");
        this.dialog.classList.add("ConsentOMatic-Progress-Dialog");

        this.preview = document.createElement("div");
        this.preview.classList.add("ConsentOMatic-Progres-Preview");
        this.modal.appendChild(this.preview);

        let contents = document.createElement("p");
        contents.innerText = text;
        this.dialog.appendChild(contents);
        document.body.appendChild(this.modal);
        this.modal.appendChild(this.dialog);

        this.dialog.addEventListener("click", () => {
            self.unHideAll();
        });

        setTimeout(() => {
            this.modal.classList.add("ConsentOMatic-Progress-Started");
        }, 0);
    }

    calculateProgress() {
        let fraction = (this.completedSteps + this.currentMethodStepsTotal * this.currentMethodFraction) / this.totalSteps;
        this.updateProgress(fraction);
    }

    updateProgress(fraction) {
        if (this.modal != null) {
            this.modal.style.setProperty("--progress", fraction);
        }
    }

    // 지금 설정된 허용 범위를 알림 문구로 변환
    allowText() {
        const v = this.consentTypes || {};
        if (v.D || v.E || v.F || v.X) return "전부 허용";
        if (v.B) return "통계까지 허용";
        if (v.A) return "기능까지 허용";
        return "필수만 허용";
    }

    hideProgressDialog() {
        if (ConsentEngine.debugValues.debugLog) {
            console.log("Hiding progress...");
        }
        const modal = this.modal;
        const dialog = this.dialog;
        const ok = this.lastHandledOk === true;
        this.lastHandledOk = false;
        ConsentEngine.enforceScrollBehaviours(false);
        if (modal == null) return;

        // 성공하면 결과 문구를 잠깐 보여 준 뒤 내려감
        if (ok && dialog != null) {
            const p = dialog.querySelector("p");
            if (p != null) p.innerText = "쿠키 창 닫음, " + this.allowText();
            modal.classList.add("CookieHelper-Done");
        }
        this.dialogTimeoutId = setTimeout(() => {
            modal.classList.add("ConsentOMatic-Progress-Complete");
            this.dialogTimeoutId = setTimeout(() => {
                modal.remove();
                if (this.dialog === dialog) this.dialog = null;
                if (this.modal === modal) this.modal = null;
            }, 500);
        }, ok ? 2200 : 0);
    }

    setupObserver() {
        let self = this;

        this.observer = new MutationObserver((mutations) => {
            this.handleMutations(mutations);
        });
    }

    startObserver() {
        if (document.body != null) {
            this.observer.observe(document.body, {
                childList: true,
                attributes: true,
                subtree: true
            });
        }
    }

    stopObserver() {
        this.observer.disconnect();
    }

    findCMP() {
        return this.cmps.filter((cmp) => {
            return cmp.detect();
        });
    }
}

ConsentEngine.singleton = null;