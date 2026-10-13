const DEFAULT_OPTION = {
  name: "국제배송종류선택",
  value: "일반국제배송(약 7~9일),특급국제배송(약 3~5일)"
};

const MESSAGE_TYPE = "APPLY_SMARTSTORE_VALUES";

const $ = id => document.getElementById(id);

const elements = {
  productName: $("productName"),
  salePrice: $("salePrice"),
  deliveryFee: $("deliveryFee"),
  noDelivery: $("noDelivery"),
  resetTags: $("resetTags"),
  useOptions: $("useOptions"),
  optionArea: $("optionArea"),
  extraOptions: $("extraOptions"),
  applyBtn: $("applyBtn"),
  loadingOverlay: $("loadingOverlay"),
  result: $("result")
};

const originalButtonText = elements.applyBtn.textContent;

elements.useOptions.addEventListener("change", () => {
  elements.optionArea.style.display = elements.useOptions.checked ? "block" : "none";
});

elements.applyBtn.addEventListener("click", handleApplyClick);

function onlyDigits(value) {
  return String(value).replace(/[^\d]/g, "");
}

function parseExtraOptionLine(line) {
  const separatorIndex = line.indexOf("=");

  if (separatorIndex === -1) {
    return {
      name: "상품선택",
      value: line.trim()
    };
  }

  return {
    name: line.slice(0, separatorIndex).trim() || "상품선택",
    value: line.slice(separatorIndex + 1).trim()
  };
}

function parseExtraOptions(text) {
  return text
    .split("\n")
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      const option = parseExtraOptionLine(line);

      if (!option.value) {
        throw new Error(`옵션값이 비어있습니다: ${line}`);
      }

      return option;
    });
}

function buildOptions() {
  const extraOptions = parseExtraOptions(elements.extraOptions.value);

  // 화면을 건드리기 전에 최종 옵션 구성을 먼저 확정한다.
  // 기본 배송 옵션 하나의 길이:
  // 일반국제배송(약 7~9일) / 특급국제배송(약 3~5일) = 각각 14자
  const DELIVERY_OPTION_LENGTH = 14;
  const MAX_COMBINED_LENGTH = 30;

  const optionLengthDebug = [];

  const canUseDeliveryOption = extraOptions.every(option => {
    const values = String(option.value || "")
      .split(",")
      .map(value => value.trim())
      .filter(Boolean);

    return values.every(value => {
      const length = value.length;
      const combined = length + DELIVERY_OPTION_LENGTH;
      const passed = combined < MAX_COMBINED_LENGTH;

      optionLengthDebug.push({
        optionName: option.name,
        value,
        length,
        combined,
        passed
      });

      return passed;
    });
  });

  console.log("[OPTION LENGTH CHECK]", optionLengthDebug);
  console.log("[OPTION DELIVERY ALLOWED]", canUseDeliveryOption);

  let finalOptions;

  // 모든 사용자 옵션이 제한을 만족할 때만 배송 옵션을 최종 배열에 포함한다.
  if (canUseDeliveryOption) {
    finalOptions = [
      ...extraOptions,
      DEFAULT_OPTION
    ];
  } else {
    // 하나라도 제한을 넘으면 국제배송종류선택 자체를 만들지 않는다.
    finalOptions = extraOptions;
  }

  console.log("[OPTION FINAL OPTIONS]", finalOptions);

  return finalOptions;
}

function getMaxOptionAddPrice(options) {
  const prices = [];

  for (const option of options) {
    const matches = [...String(option.value || "").matchAll(/\+\s*([\d,]+)/g)];

    for (const match of matches) {
      prices.push(Number(match[1].replace(/,/g, "")));
    }
  }

  return prices.length ? Math.max(...prices) : 0;
}

function getFormValues() {
  return {
    productName: elements.productName.value.trim(),
    salePrice: onlyDigits(elements.salePrice.value),
    deliveryFee: onlyDigits(elements.deliveryFee.value),
    noDelivery: elements.noDelivery.checked,
    resetTags: elements.resetTags.checked,
    useOptions: elements.useOptions.checked,
    options: [],
    basicDiscount: 0
  };
}

function validateForm(values) {
  if (!values.productName) return "상품명을 입력하세요.";
  if (!values.salePrice) return "판매가를 입력하세요.";
  if (!values.deliveryFee) return "배송비를 입력하세요.";
  return "";
}

function setLoading(isLoading) {
  elements.loadingOverlay.style.display = isLoading ? "flex" : "none";
  elements.applyBtn.disabled = isLoading;
  elements.applyBtn.innerHTML = isLoading
    ? '<span class="btn-spinner"></span>입력 중...'
    : originalButtonText;
}

function setResult(message, isSuccess = true) {
  elements.result.style.color = isSuccess ? "green" : "red";
  elements.result.textContent = message;
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true
  });

  return tab;
}

async function injectContentScript(tabId) {
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["content.js"]
  });
}

function sendApplyMessage(tabId, payload) {
  return new Promise(resolve => {
    chrome.tabs.sendMessage(tabId, payload, response => {
      resolve({ response, lastError: chrome.runtime.lastError });
    });
  });
}

async function handleApplyClick() {
  const values = getFormValues();
  const validationMessage = validateForm(values);

  if (validationMessage) {
    alert(validationMessage);
    return;
  }

  if (values.useOptions) {
    try {
      values.options = buildOptions();

      const maxOptionAddPrice = getMaxOptionAddPrice(values.options);
      values.basicDiscount = maxOptionAddPrice * 2;

      if (values.basicDiscount > 0) {
        values.salePrice = String(Number(values.salePrice) + values.basicDiscount);
      }
    } catch (error) {
      alert(error.message);
      return;
    }
  }

  setLoading(true);
  setResult("", true);

  try {
    const tab = await getActiveTab();
    await injectContentScript(tab.id);

    const { response, lastError } = await sendApplyMessage(tab.id, {
      type: MESSAGE_TYPE,
      ...values
    });

    if (lastError) {
      setResult("오류: 스마트스토어 상품등록 페이지에서 실행해주세요.", false);
      return;
    }

    setResult(response?.message || "완료", Boolean(response?.success));
  } catch (error) {
    console.log("[POPUP] 오류:", error);
    setResult("오류: 스마트스토어 상품등록 페이지에서 실행해주세요.", false);
  } finally {
    setLoading(false);
  }
}
