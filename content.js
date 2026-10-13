(() => {
  if (window.__SMARTSTORE_CONTENT_LOADED__) {
    console.log("SmartStore content already loaded");
    return;
  }
  window.__SMARTSTORE_CONTENT_LOADED__ = true;

  const EVENTS = {
    setNumber: "SMARTSTORE_SET_NUMBER",
    setNumberResult: "SMARTSTORE_SET_NUMBER_RESULT",
    setTags: "SMARTSTORE_SET_DEFAULT_TAGS",
    setTagsResult: "SMARTSTORE_SET_DEFAULT_TAGS_RESULT",
    setModel: "SMARTSTORE_SET_MODEL",
    setModelResult: "SMARTSTORE_SET_MODEL_RESULT",
    setOptions: "SMARTSTORE_SET_OPTIONS",
    setOptionsResult: "SMARTSTORE_SET_OPTIONS_RESULT"
  };

  const SELECTORS = {
    productName: 'input[name="product.name"]',
    channelProductName: 'input[name="singleChannelProductMap[STOREFARM].channelProductName"]',
    salePrice: 'input[name="product.salePrice"]',
    immediateDiscountRadio: 'input[name="sale2"][value="true"], #r3_1_total',
    immediateDiscountValue: 'input[name="product.customerBenefit.immediateDiscountPolicy.discountMethod.value"]',

    productInfoToggle:
      'div.title-line[server-field-errors^="product.detailAttribute.productInfoProvidedNotice"]',
    itemName: "#itemName",
    modelName: "#modelName",

    deliveryToggle:
      'div.title-line[server-field-errors^="product.deliveryInfo"]',
    deliveryFee: 'input[name="product.deliveryInfo.deliveryFee.baseFee"]',
    deliveryNo:
      'input[ng-model="vm.viewData.setting"][value="false"]',
    bundleDeliveryAvailable:
      'input[ng-model="vm.viewData.hasBundleGroup"][value="true"]',
    bundleDeliveryIndividual:
      'input[ng-model="vm.viewData.hasBundleGroup"][value="false"]',

    searchToggle:
      'div.title-line[server-field-errors^="product.detailAttribute.seoInfo"]',
    pageTitle: 'input[name="product.detailAttribute.seoInfo.pageTitle"]',
    metaDescription: 'input[name="product.detailAttribute.seoInfo.metaDescription"]',

    sellerTagItems: 'span.choice-label[ng-repeat*="sellerTags"]',
    sellerTagDeleteButton: 'a[ng-click*="deleteTag"]',

    optionToggle:
      'div.form-section[scroll-bookmark="option"] div.title-line[ng-click*="openItem"]',
    optionNameInput: 'input[ng-model="choiceOptionInput.groupName"]',

    productImageDeleteButton: 'a[ng-click*="vm.removeImages"]'
  };

  const DEFAULT_TAGS = [
    "일본정품굿즈",
    "일본정품가챠",
    "일본구매대행",
    "일본정품피규어",
    "캐릭터굿즈"
  ];

  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const query = selector => document.querySelector(selector);
  const queryAll = selector => [...document.querySelectorAll(selector)];

  function scrollTo(el) {
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  async function waitFor(selector, timeout = 5000) {
    const start = Date.now();

    while (Date.now() - start < timeout) {
      const el = query(selector);
      if (el) return el;
      await sleep(100);
    }

    return null;
  }

  async function openSection(toggleSelector, requiredSelector) {
    if (query(requiredSelector)) return true;

    const toggle = query(toggleSelector);
    if (!toggle) return false;

    scrollTo(toggle);
    toggle.click();

    return Boolean(await waitFor(requiredSelector, 5000));
  }

  function injectPageScript() {
    if (document.getElementById("smartstore-helper-inject")) return;

    const script = document.createElement("script");
    script.id = "smartstore-helper-inject";
    script.src = chrome.runtime.getURL("inject.js");
    document.documentElement.appendChild(script);
  }

  function setTextValue(selector, value) {
    const el = query(selector);
    if (!el) return false;

    scrollTo(el);
    el.focus();

    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value"
    ).set;

    setter.call(el, value);
    ["input", "change", "blur"].forEach(type => {
      el.dispatchEvent(new Event(type, { bubbles: true }));
    });

    return true;
  }

  function requestPageEvent({ eventName, resultEventName, detail = {}, timeout = 3000, validate }) {
    return new Promise(resolve => {
      const timer = setTimeout(() => {
        window.removeEventListener(resultEventName, handler);
        resolve({
          success: false,
          reason: "응답 시간 초과"
        });
      }, timeout);

      function handler(event) {
        if (validate && !validate(event.detail)) return;

        clearTimeout(timer);
        window.removeEventListener(resultEventName, handler);

        resolve({
          success: Boolean(event.detail?.success),
          reason: String(event.detail?.reason || "")
        });
      }

      window.addEventListener(resultEventName, handler);
      window.dispatchEvent(new CustomEvent(eventName, { detail }));
    });
  }

  async function setPageNumberValue(selector, value) {
    const result = await requestPageEvent({
      eventName: EVENTS.setNumber,
      resultEventName: EVENTS.setNumberResult,
      detail: { selector, value },
      timeout: 3000,
      validate: detail => detail?.selector === selector
    });

    return result.success;
  }

  async function setPageDefaultTags() {
    const result = await requestPageEvent({
      eventName: EVENTS.setTags,
      resultEventName: EVENTS.setTagsResult,
      timeout: 3000
    });

    return result.success;
  }

  function setPageOptions(options) {
    return requestPageEvent({
      eventName: EVENTS.setOptions,
      resultEventName: EVENTS.setOptionsResult,
      detail: { options },
      timeout: 20000
    });
  }

  async function setProductMainInfo(productName) {
    const result = await requestPageEvent({
      eventName: EVENTS.setModel,
      resultEventName: EVENTS.setModelResult,
      detail: { productName },
      timeout: 5000
    });

    return result.success;
  }

  async function clearSellerTags() {
    const tagItems = queryAll(SELECTORS.sellerTagItems);

    for (const item of tagItems) {
      const tagName = item.querySelector("strong")?.innerText.trim();
      if (DEFAULT_TAGS.includes(tagName)) continue;

      const deleteBtn = item.querySelector(SELECTORS.sellerTagDeleteButton);
      if (!deleteBtn) continue;

      deleteBtn.click();
      await sleep(200);
    }

    return true;
  }

  async function clearProductImages() {
    let deletedCount = 0;

    while (true) {
      const deleteBtn = query(SELECTORS.productImageDeleteButton);
      if (!deleteBtn) break;

      scrollTo(deleteBtn);
      deleteBtn.click();
      deletedCount++;
      await sleep(300);
    }

    return deletedCount > 0;
  }

  async function scrollToProductImageVideoSection() {
    await sleep(700);

    const imageSelectors = [
      'a.btn-add-img[ng-click*="openUploadModal"]',
      'a[ng-click*="vm.openUploadModal"]',
      'div.register-img a[ng-click*="openUploadModal"]',
      'div.register-img'
    ];

    let target = imageSelectors.map(query).find(Boolean);

    if (!target) {
      const imageText = queryAll("span.sr-only")
        .find(el => el.textContent.trim() === "이미지 등록");
      target = imageText?.closest("a, div.register-img");
    }

    if (!target) return false;

    scrollTo(target);
    return true;
  }

  function addResult(results, name, ok) {
    results.push({ name, ok });
  }

  async function enableImmediateDiscount() {
    const radio = query(SELECTORS.immediateDiscountRadio);
    if (!radio) return false;

    scrollTo(radio);

    if (!radio.checked) {
      const label = document.querySelector(`label[for="${radio.id}"]`);
      (label || radio).click();
      await sleep(500);
    }

    return Boolean(await waitFor(SELECTORS.immediateDiscountValue, 3000));
  }

  async function applyBasicDiscountIfNeeded(results, basicDiscount) {
    const discountValue = Number(String(basicDiscount || "").replace(/[^\d]/g, ""));
    if (!discountValue) return;

    const enabled = await enableImmediateDiscount();
    addResult(results, "즉시할인 설정", enabled);
    if (!enabled) return;

    addResult(results, "기본할인", await setPageNumberValue(SELECTORS.immediateDiscountValue, discountValue));
  }

  async function setNoDelivery() {
    const radio = query(SELECTORS.deliveryNo);

    if (!radio) {
      console.log("[DELIVERY] 배송없음 라디오 버튼 없음");
      return false;
    }

    scrollTo(radio);

    if (!radio.checked) {
      const label = document.querySelector(
        `label[for="${radio.id}"]`
      );

      (label || radio).click();

      await sleep(500);
    }

    console.log("[DELIVERY] 배송없음으로 변경");

    return radio.checked;
  }

  async function applyOptionsIfNeeded(results, useOptions, options) {
    if (!useOptions) return;

    const openedOption = await openSection(
      SELECTORS.optionToggle,
      SELECTORS.optionNameInput
    );

    addResult(results, "옵션 영역 열기", openedOption);
    if (!openedOption) return;

    const optionResult = await setPageOptions(options);

    results.push({
      name: optionResult.reason
        ? `옵션 (${optionResult.reason})`
        : "옵션",
      ok: optionResult.success
    });
  }

  async function setBundleDeliveryByFee(deliveryFee) {
    const fee = Number(
      String(deliveryFee || "").replace(/[^\d]/g, "")
    );

    const useBundleDelivery = fee <= 15000;

    const selector = useBundleDelivery
      ? SELECTORS.bundleDeliveryAvailable
      : SELECTORS.bundleDeliveryIndividual;

    const radio = query(selector);

    if (!radio) {
      console.log("[DELIVERY] 묶음배송 설정 라디오 없음");
      return false;
    }

    scrollTo(radio);

    if (!radio.checked) {
      const label = document.querySelector(`label[for="${radio.id}"]`);

      (label || radio).click();

      await sleep(400);
    }

    console.log(
      "[DELIVERY]",
      fee,
      useBundleDelivery
        ? "묶음배송 가능"
        : "묶음배송 불가(개별계산)"
    );

    return radio.checked;
  }

  async function applySmartStoreValues(payload) {
    console.log("[CONTENT] applySmartStoreValues 실행");

    injectPageScript();
    await sleep(300);

    const {
      productName,
      salePrice,
      deliveryFee,
      noDelivery,
      resetTags,
      useOptions,
      options = [],
      basicDiscount = 0
    } = payload;

    const results = [];

    addResult(results, "상품 이미지 삭제", await clearProductImages());
    addResult(results, "상품명", setTextValue(SELECTORS.productName, productName));
    addResult(results, "스마트스토어 상품명", setTextValue(SELECTORS.channelProductName, productName));
    addResult(results, "판매가", await setPageNumberValue(SELECTORS.salePrice, salePrice));
    await applyBasicDiscountIfNeeded(results, basicDiscount);

    await openSection(SELECTORS.productInfoToggle, SELECTORS.itemName);
    addResult(results, "상품 주요정보", await setProductMainInfo(productName));
    addResult(results, "품명", setTextValue(SELECTORS.itemName, productName));
    addResult(results, "모델명", setTextValue(SELECTORS.modelName, productName));

    await applyOptionsIfNeeded(results, useOptions, options);

    await openSection(
      SELECTORS.deliveryToggle,
      noDelivery
        ? SELECTORS.deliveryNo
        : SELECTORS.deliveryFee
    );

    if (noDelivery) {
      addResult(
        results,
        "배송없음",
        await setNoDelivery()
      );
    } else {
      addResult(
        results,
        "배송비",
        await setPageNumberValue(
          SELECTORS.deliveryFee,
          deliveryFee
        )
      );

      const deliveryFeeNumber = Number(
        String(deliveryFee || "").replace(/[^\d]/g, "")
      );

      const bundleDeliveryOk =
        await setBundleDeliveryByFee(deliveryFee);

      addResult(
        results,
        deliveryFeeNumber > 15000
          ? "묶음배송 불가(개별계산)"
          : "묶음배송 가능",
        bundleDeliveryOk
      );
    }

    await openSection(SELECTORS.searchToggle,SELECTORS.pageTitle);

    if (resetTags) {
      await clearSellerTags();
      await sleep(1500);
      await setPageDefaultTags();
    }

    addResult(results, "Page Title", setTextValue(SELECTORS.pageTitle, productName));
    addResult(results, "Meta Description", setTextValue(SELECTORS.metaDescription, productName));

    await sleep(500);
    await scrollToProductImageVideoSection();

    return results;
  }

  function makeResponse(results) {
    const failList = results
      .filter(result => !result.ok)
      .map(result => `실패: ${result.name}`);

    return {
      success: failList.length === 0,
      message: failList.length === 0 ? "이상없음" : failList.join("\n")
    };
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type !== "APPLY_SMARTSTORE_VALUES") return true;

    (async () => {
      try {
        const results = await applySmartStoreValues(message);
        sendResponse(makeResponse(results));
      } catch (error) {
        console.log("[CONTENT] 오류:", error);
        sendResponse({
          success: false,
          message: `오류: ${String(error)}`
        });
      }
    })();

    return true;
  });
})();
