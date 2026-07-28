(() => {
  "use strict";

  const config = window.PULO_ACCESS_CONFIG || {};
  const form = document.querySelector("#register-form");
  const countrySelect = document.querySelector("#country");
  const ddiInput = document.querySelector("#ddi");
  const areaInput = document.querySelector("#area-code");
  const numberInput = document.querySelector("#local-number");
  const areaLabel = document.querySelector("#area-label");
  const preview = document.querySelector("#phone-preview");
  const error = document.querySelector("#form-error");
  const submit = document.querySelector("#submit-button");

  const fallbackCountries = [
    { name: "Brasil", iso2: "br", dialCode: "55" },
    { name: "Argentina", iso2: "ar", dialCode: "54" },
    { name: "Uruguay", iso2: "uy", dialCode: "598" },
    { name: "Chile", iso2: "cl", dialCode: "56" },
    { name: "Paraguay", iso2: "py", dialCode: "595" },
    { name: "España", iso2: "es", dialCode: "34" },
    { name: "Portugal", iso2: "pt", dialCode: "351" },
    { name: "Estados Unidos", iso2: "us", dialCode: "1" }
  ];

  function countryData() {
    try {
      const data = window.intlTelInput && window.intlTelInput.getCountryData
        ? window.intlTelInput.getCountryData()
        : [];
      return data.length ? data : fallbackCountries;
    } catch (_) {
      return fallbackCountries;
    }
  }

  function populateCountries() {
    const countries = countryData().slice().sort((a, b) => {
      if (a.iso2 === "br") return -1;
      if (b.iso2 === "br") return 1;
      return String(a.name).localeCompare(String(b.name), "pt-BR");
    });
    const fragment = document.createDocumentFragment();
    countries.forEach((country) => {
      const option = document.createElement("option");
      option.value = country.iso2.toUpperCase();
      option.dataset.dialCode = country.dialCode;
      option.textContent = `${country.name} (+${country.dialCode})`;
      option.selected = country.iso2 === "br";
      fragment.appendChild(option);
    });
    countrySelect.replaceChildren(fragment);
    updateCountry();
  }

  function updateCountry() {
    const selected = countrySelect.selectedOptions[0];
    const iso2 = selected.value;
    ddiInput.value = `+${selected.dataset.dialCode}`;
    const brazil = iso2 === "BR";
    areaLabel.textContent = brazil ? "DDD" : "Código de área";
    areaInput.placeholder = brazil ? "22" : "Se houver";
    areaInput.required = brazil;
    numberInput.placeholder = brazil ? "99999-9999" : "Número local";
    validatePhone(false);
  }

  function digits(value) {
    return String(value || "").replace(/\D/g, "");
  }

  function selectedCountryName() {
    return countrySelect.selectedOptions[0].textContent.replace(/\s*\(\+\d+\)\s*$/, "");
  }

  function parsePhone() {
    const iso2 = countrySelect.value;
    const raw = `${ddiInput.value}${digits(areaInput.value)}${digits(numberInput.value)}`;
    if (!window.libphonenumber || !window.libphonenumber.parsePhoneNumberFromString) return null;
    return window.libphonenumber.parsePhoneNumberFromString(raw, iso2);
  }

  function validatePhone(showError = true) {
    const phone = parsePhone();
    const valid = Boolean(phone && phone.isValid());
    if (valid) {
      preview.textContent = `${phone.formatInternational()} • pronto para WhatsApp`;
      preview.classList.add("valid");
      return phone;
    }
    preview.textContent = "Será salvo no formato internacional para uso no WhatsApp.";
    preview.classList.remove("valid");
    if (showError) showMessage("Informe um celular válido para o país selecionado.");
    return null;
  }

  function showMessage(message) {
    error.textContent = message;
    error.hidden = false;
  }

  function clearMessage() {
    error.textContent = "";
    error.hidden = true;
  }

  async function api(payload) {
    if (!config.API_URL || config.API_URL.includes("COLE_AQUI")) {
      throw new Error("A URL do Apps Script ainda não foi configurada.");
    }
    const response = await fetch(config.API_URL, {
      method: "POST",
      redirect: "follow",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload)
    });
    if (!response.ok) throw new Error("Não foi possível conectar ao cadastro.");
    return response.json();
  }

  function numericInput(event) {
    event.target.value = digits(event.target.value);
  }

  countrySelect.addEventListener("change", updateCountry);
  areaInput.addEventListener("input", (event) => {
    numericInput(event);
    validatePhone(false);
  });
  numberInput.addEventListener("input", (event) => {
    numericInput(event);
    validatePhone(false);
  });
  document.querySelector("#pin").addEventListener("input", numericInput);
  document.querySelector("#pin-confirm").addEventListener("input", numericInput);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearMessage();
    const pin = document.querySelector("#pin").value;
    const pinConfirm = document.querySelector("#pin-confirm").value;
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }
    if (!/^\d{4}$/.test(pin) || pin !== pinConfirm) {
      showMessage("As duas chaves precisam ter os mesmos 4 números.");
      return;
    }
    const phone = validatePhone(true);
    if (!phone) return;

    submit.disabled = true;
    submit.textContent = "Enviando...";
    try {
      const result = await api({
        action: "register",
        name: document.querySelector("#name").value,
        email: document.querySelector("#email").value,
        countryIso2: countrySelect.value,
        country: selectedCountryName(),
        ddi: ddiInput.value,
        areaCode: areaInput.value,
        localNumber: numberInput.value,
        e164: phone.number,
        pin,
        userAgent: navigator.userAgent
      });
      if (!result.ok) throw new Error(result.message || "Não foi possível enviar o cadastro.");
      document.querySelector("#register-shell").hidden = true;
      document.querySelector("#success-card").hidden = false;
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (requestError) {
      showMessage(requestError.message);
    } finally {
      submit.disabled = false;
      submit.innerHTML = 'Enviar solicitação <span aria-hidden="true">→</span>';
    }
  });

  populateCountries();
})();
