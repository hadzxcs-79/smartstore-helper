(() => {
  if (window.__SMARTSTORE_HELPER_INJECTED__) {
    console.log("SmartStore Helper already injected");
    return;
  }
  window.__SMARTSTORE_HELPER_INJECTED__ = true;

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

  function emit(eventName, detail) {
    window.dispatchEvent(new CustomEvent(eventName, { detail }));
  }

  function emitResult(eventName, success, extra = {}) {
    emit(eventName, { success, ...extra });
  }

  function getRootScope() {
    return angular.element(document.body).injector().get("$rootScope");
  }

  function applyDigest(logPrefix = "[DIGEST]") {
    try {
      const $rootScope = getRootScope();
      if (!$rootScope.$$phase) $rootScope.$apply();
      else $rootScope.$evalAsync();
    } catch (error) {
      console.log(`${logPrefix} digest skip:`, error);
    }
  }

  function updateNgModel(input, value) {
    const ngModel = angular.element(input).controller("ngModel");
    if (!ngModel) return null;

    ngModel.$setViewValue(value);
    ngModel.$commitViewValue();
    ngModel.$validate();
    ngModel.$render();

    return ngModel;
  }

  function setNativeInputValue(input, value) {
    input.scrollIntoView({ behavior: "smooth", block: "center" });
    input.focus();

    try {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value"
      ).set;
      setter.call(input, value);
    } catch (error) {
      input.value = value;
    }
  }

  function dispatchInputEvents(input) {
    ["input", "change", "blur"].forEach(type => {
      input.dispatchEvent(new Event(type, { bubbles: true }));
    });
  }

  function setAngularInput(input, value, logPrefix = "[INPUT]") {
    if (!input) {
      console.log(`${logPrefix} input 없음`);
      return false;
    }

    setNativeInputValue(input, value);
    const ngModel = updateNgModel(input, value);
    dispatchInputEvents(input);
    applyDigest(logPrefix);

    return input.value === value ||
      ngModel?.$viewValue === value ||
      ngModel?.$modelValue === value;
  }

  function isActuallyVisible(el) {
    const rect = el.getBoundingClientRect();
    const style = window.getComputedStyle(el);

    return rect.width > 0 &&
      rect.height > 0 &&
      style.display !== "none" &&
      style.visibility !== "hidden";
  }

  window.addEventListener(EVENTS.setNumber, event => {
    const { selector, value } = event.detail;
    const numberValue = String(value).replace(/[^\d]/g, "");
    const el = query(selector);

    if (!el || !numberValue) {
      emit(EVENTS.setNumberResult, { selector, success: false });
      return;
    }

    try {
      updateNgModel(el, numberValue);
      getRootScope().$apply();
      emit(EVENTS.setNumberResult, { selector, success: true });
    } catch (error) {
      console.log("SmartStore number update failed:", error);
      emit(EVENTS.setNumberResult, { selector, success: false });
    }
  });

  window.addEventListener(EVENTS.setTags, () => {
    try {
      const input = query('input[type="text"][placeholder="태그를 입력해주세요."]');

      if (!input) {
        emitResult(EVENTS.setTagsResult, false, { reason: "input not found" });
        return;
      }

      const ctrl = angular.element(input).controller();
      const sellerTags = ctrl?.product?.detailAttribute?.seoInfo?.sellerTags;

      if (!sellerTags) {
        emitResult(EVENTS.setTagsResult, false, { reason: "sellerTags not found" });
        return;
      }

      for (const tag of DEFAULT_TAGS) {
        const exists = sellerTags.some(item => {
          if (typeof item === "string") return item === tag;
          return item.text === tag || item.name === tag || item.tagName === tag;
        });

        if (!exists) sellerTags.push({ text: tag });
      }

      getRootScope().$apply();
      emitResult(EVENTS.setTagsResult, true);
    } catch (error) {
      console.log("[TAG] 오류:", error);
      emitResult(EVENTS.setTagsResult, false, { reason: String(error) });
    }
  });

  window.addEventListener(EVENTS.setModel, async event => {
    console.log("[MODEL] 상품 주요정보 실행");

    const productName = event.detail.productName;
    const result = (success, reason = "") => {
      emitResult(EVENTS.setModelResult, success, { reason });
    };

    try {
      const releaseBtn = query('button[ng-click*="releaseModel"]');
      if (!releaseBtn) return result(false, "설정안함 버튼 없음");

      releaseBtn.click();
      await sleep(500);

      const findBtn = query('button[ng-click*="openModelSearchModal"]');
      if (!findBtn) return result(false, "찾기 버튼 없음");

      const openedModal = query(".catalog-product-modal.in, .catalog-based-registration.in");
      if (!openedModal) {
        findBtn.click();
        await sleep(700);
      }

      const directRadio = query('input[type="radio"][ng-model="vm.inputType"][value="TEXT"]');
      if (!directRadio) return result(false, "텍스트 직접입력 라디오 없음");

      directRadio.click();
      await sleep(300);

      const input = query('input[ng-model="vm.modelText"]');
      if (!input) return result(false, "모델명 입력칸 없음");

      updateNgModel(input, productName);
      getRootScope().$apply();
      await sleep(300);

      const saveBtn = query(
        '.catalog-product-modal.in button[ng-click*="save"], .catalog-based-registration.in button[ng-click*="save"]'
      );
      if (!saveBtn) return result(false, "저장 버튼 없음");

      saveBtn.click();
      await sleep(500);
      result(true);
    } catch (error) {
      console.log("[MODEL] 오류:", error);
      result(false, String(error));
    }
  });

  window.addEventListener(EVENTS.setOptions, async event => {
    console.log("[OPTION] 옵션 입력 실행 v5");

    const options = event.detail.options || [];
    const result = (success, reason = "") => {
      console.log("[OPTION] result", success, reason);
      emitResult(EVENTS.setOptionsResult, success, { reason });
    };

    const allNameInputs = () => uniqueElements(
      queryAll('input[ng-model="choiceOptionInput.groupName"], input[id^="choice_option_name"]')
    );

    const allValueInputs = () => uniqueElements(
      queryAll('input[ng-model="choiceOptionInput.name"], input[id^="choice_option_value"]')
    );

    const visibleNameInputs = () => visibleOrAll(allNameInputs());
    const visibleValueInputs = () => visibleOrAll(allValueInputs());

    function uniqueElements(elements) {
      return elements.filter((el, index, list) => list.indexOf(el) === index);
    }

    function visibleOrAll(elements) {
      const visible = elements.filter(isActuallyVisible);
      return visible.length ? visible : elements;
    }

    async function waitForInputs(count, timeout = 5000) {
      const start = Date.now();

      while (Date.now() - start < timeout) {
        const names = visibleNameInputs();
        const values = visibleValueInputs();

        if (names.length >= count && values.length >= count) {
          return { names, values };
        }

        await sleep(150);
      }

      return {
        names: visibleNameInputs(),
        values: visibleValueInputs()
      };
    }

    async function clearExtraRowsAndValues() {
      const optionSection = query('div.form-section[scroll-bookmark="option"]');

      if (!optionSection) {
        return { ok: false, reason: "옵션 영역 없음" };
      }

      // 추가 옵션 행의 X 버튼을 전부 제거해서 첫 번째 행만 남긴다.
      for (let safety = 0; safety < 20; safety++) {
        const clearBtns = [...optionSection.querySelectorAll("a.btn-clear")]
          .filter(isActuallyVisible);

        if (!clearBtns.length) break;

        const btn = clearBtns[clearBtns.length - 1];
        btn.scrollIntoView({ behavior: "smooth", block: "center" });
        btn.click();

        await sleep(400);
        applyDigest("[OPTION]");
      }

      // 첫 번째 행의 기존 값만 비운다.
      const names = uniqueElements([
        ...optionSection.querySelectorAll(
          'input[ng-model="choiceOptionInput.groupName"], input[id^="choice_option_name"]'
        )
      ]);

      const values = uniqueElements([
        ...optionSection.querySelectorAll(
          'input[ng-model="choiceOptionInput.name"], input[id^="choice_option_value"]'
        )
      ]);

      if (!names.length || !values.length) {
        return { ok: false, reason: "첫 번째 옵션 입력칸 없음" };
      }

      setAngularInput(names[0], "", "[OPTION]");
      setAngularInput(values[0], "", "[OPTION]");
      applyDigest("[OPTION]");

      await sleep(300);

      return { ok: true };
    }
    async function clickAddUntilEnough(count) {
      const optionSection = query('div.form-section[scroll-bookmark="option"]');

      if (!optionSection) {
        return { ok: false, reason: "옵션 영역 없음" };
      }

      const getNames = () => uniqueElements([
        ...optionSection.querySelectorAll(
          'input[ng-model="choiceOptionInput.groupName"], input[id^="choice_option_name"]'
        )
      ]);

      const getValues = () => uniqueElements([
        ...optionSection.querySelectorAll(
          'input[ng-model="choiceOptionInput.name"], input[id^="choice_option_value"]'
        )
      ]);

      let names = getNames();
      let values = getValues();

      if (!names.length || !values.length) {
        return { ok: false, reason: "기본 옵션 행 없음" };
      }

      // 최종 옵션이 1개면 첫 번째 행만 그대로 사용
      if (count === 1) {
        return {
          ok: true,
          names: names.slice(0, 1),
          values: values.slice(0, 1)
        };
      }

      const addBtn = optionSection.querySelector('a[ng-click*="addOptionInput"]')
        || query('a[ng-click*="addOptionInput"]');

      if (!addBtn) {
        return { ok: false, reason: "+ 버튼 없음" };
      }

      let safety = 0;
      while ((names.length < count || values.length < count) && safety < 20) {
        safety++;

        addBtn.scrollIntoView({ behavior: "smooth", block: "center" });
        addBtn.click();

        await sleep(500);
        applyDigest("[OPTION]");

        names = getNames();
        values = getValues();
      }

      if (names.length < count || values.length < count) {
        return {
          ok: false,
          reason: `옵션 입력칸 개수 부족: 이름 ${names.length}, 값 ${values.length}, 필요 ${count}`
        };
      }

      return {
        ok: true,
        names: names.slice(0, count),
        values: values.slice(0, count)
      };
    }
    function calculateOptionPrice(text) {
      let price = 0;

      if (text.includes("특급국제배송")) price += 7000;

      const match = text.match(/\(\+([\d,]+)\)/);
      if (match) price += Number(match[1].replace(/,/g, ""));

      return price;
    }

    function findAgGridComponent() {
      const agElements = queryAll(".seller-grid-area, .ag-root, .ag-root-wrapper, .ag-layout-normal");

      for (const el of agElements) {
        if (el.__agComponent?.api) return el.__agComponent;

        const keys = Object.keys(el).filter(key =>
          key.toLowerCase().includes("ag") || key.toLowerCase().includes("grid")
        );

        for (const key of keys) {
          const value = el[key];
          if (value?.api?.forEachNode) return value;
          if (value?.gridOptions?.api?.forEachNode) return value.gridOptions;
        }
      }

      console.log("[OPTION GRID] agElements", agElements.length);
      return null;
    }

    async function setOptionGridPriceAndStock() {
      await sleep(1500);

      const agComponent = findAgGridComponent();
      console.log("[OPTION GRID] agComponent", agComponent);

      if (!agComponent?.api) {
        console.log("[OPTION GRID] ag-grid api 없음");
        return false;
      }

      const api = agComponent.api;
      const rowNodes = [];
      api.forEachNode(node => rowNodes.push(node));

      if (!rowNodes.length) {
        console.log("[OPTION GRID] rowNode 없음");
        return false;
      }

      for (const node of rowNodes) {
        const data = node.data || {};
        const rowText = [
          data.optionName1,
          data.optionName2,
          data.groupName,
          data.name,
          data.optionName,
          data.optionValue,
          ...Object.values(data)
        ].filter(Boolean).join(" ");

        const price = calculateOptionPrice(rowText);
        console.log("[OPTION GRID] row data before", data);
        console.log("[OPTION GRID] calculated price", rowText, price);

        const priceKeys = ["price", "price_0", "price_1", "optionPrice", "salePrice"];
        const priceKey = priceKeys.find(key => Object.prototype.hasOwnProperty.call(data, key));

        if (priceKey) {
          console.log("[OPTION GRID] set price key", priceKey, price);
          node.setDataValue(priceKey, String(price));
          data[priceKey] = String(price);
        }

        node.setDataValue("stockQuantity", "55");
      }

      api.refreshCells({ force: true });
      api.redrawRows();
      await sleep(500);

      return true;
    }

    function validateOptionValues(optionCount) {
      const nameInputs = visibleNameInputs();
      const valueInputs = visibleValueInputs();
      const currentNames = nameInputs.slice(0, optionCount).map(el => el.value);
      const currentValues = valueInputs.slice(0, optionCount).map(el => el.value);

      console.log("[OPTION] after set names", currentNames);
      console.log("[OPTION] after set values", currentValues);

      for (let i = 0; i < optionCount; i++) {
        if (currentNames[i] !== options[i].name || currentValues[i] !== options[i].value) {
          return { ok: false, reason: `옵션 값 입력 실패: ${i + 1}번째` };
        }
      }

      return { ok: true };
    }

    try {
      if (!options.length) return result(false, "옵션 데이터 없음");

      console.log("[OPTION] requested options", options);
      console.log("[OPTION] before clear inputs", allNameInputs().length, allValueInputs().length);

      const cleared = await clearExtraRowsAndValues();
      if (!cleared.ok) return result(false, cleared.reason);

      const prepared = await clickAddUntilEnough(options.length);
      if (!prepared.ok) return result(false, prepared.reason);

      const nameInputs = prepared.names;
      const valueInputs = prepared.values;
      console.log("[OPTION] final input count", nameInputs.length, valueInputs.length);

      for (let i = 0; i < options.length; i++) {
        setAngularInput(nameInputs[i], options[i].name, "[OPTION]");
        await sleep(250);
        setAngularInput(valueInputs[i], options[i].value, "[OPTION]");
        await sleep(250);
        applyDigest("[OPTION]");
      }

      await sleep(700);

      const validation = validateOptionValues(options.length);
      if (!validation.ok) return result(false, validation.reason);

      const applyBtn = query('a[ng-click*="submitToGrid"]');
      if (!applyBtn) return result(false, "옵션목록으로 적용 버튼 없음");

      const disabledByClass = String(applyBtn.className || "").includes("disabled");
      const disabledByAttr = applyBtn.getAttribute("disabled") !== null;
      if (disabledByClass || disabledByAttr) {
        return result(false, "옵션목록으로 적용 버튼 비활성화");
      }

      applyBtn.scrollIntoView({ behavior: "smooth", block: "center" });
      applyBtn.click();
      await sleep(1500);

      const gridOk = await setOptionGridPriceAndStock();
      if (!gridOk) return result(false, "옵션목록 가격/재고 입력 실패");

      result(true);
    } catch (error) {
      console.log("[OPTION] 오류:", error);
      result(false, String(error));
    }
  });
})();
