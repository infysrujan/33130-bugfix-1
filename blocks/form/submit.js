import { DEFAULT_THANK_YOU_MESSAGE, getSubmitBaseUrl } from './constant.js';

// Strip _exclude fields from AEM forms submit payload (afb-runtime posts via fetch internally).
(function installExcludeFieldsInterceptor() {
  if (window.aemFormExcludeInterceptor) return;
  window.aemFormExcludeInterceptor = true;
  const nativeFetch = window.fetch;

  function filterExclude(obj) {
    return Object.fromEntries(Object.entries(obj).filter(([k]) => !k.includes('_exclude')));
  }

  window.fetch = async function fetchExcludeFilter(resource, init) {
    if (init?.method === 'POST') {
      // AEM forms: multipart/form-data, 'data' field = JSON { payload: {...}, 'payload-hash': ... }
      if (init.body instanceof FormData) {
        try {
          const dataStr = init.body.get('data');
          if (typeof dataStr === 'string') {
            const parsed = JSON.parse(dataStr);
            const { payload } = parsed;
            if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
              const filtered = filterExclude(payload);
              const newFormData = new FormData();
              init.body.forEach((value, key) => {
                const newVal = key === 'data'
                  ? JSON.stringify({ ...parsed, payload: filtered })
                  : value;
                newFormData.append(key, newVal);
              });
              return nativeFetch.call(this, resource, { ...init, body: newFormData });
            }
          }
        } catch { /* unexpected structure — pass through */ }
      }
      // Sheet-based forms: JSON string body with 'data' or 'payload' key
      if (typeof init.body === 'string') {
        try {
          const parsed = JSON.parse(init.body);
          const key = ['payload', 'data'].find(
            (k) => parsed?.[k] && typeof parsed[k] === 'object' && !Array.isArray(parsed[k]),
          );
          if (key) {
            const newBody = JSON.stringify({ ...parsed, [key]: filterExclude(parsed[key]) });
            return nativeFetch.call(this, resource, { ...init, body: newBody });
          }
        } catch { /* not filterable JSON — pass through */ }
      }
    }
    return nativeFetch.call(this, resource, init);
  };
}());

let formPlaceholders = {};

export function setFormPlaceholders(placeholders) {
  formPlaceholders = placeholders;
}

export function submitSuccess(e, form) {
  const { payload } = e;
  const authoredThankYouMsg = form.dataset.thankYouMsg;
  const redirectUrl = form.dataset.redirectUrl || payload?.body?.redirectUrl;
  const thankYouMsg = authoredThankYouMsg || payload?.body?.thankYouMessage;

  const thankyouPanel = form.querySelector('fieldset[name="thankyou_visible_panel"]');
  if (thankyouPanel) {
    thankyouPanel.dataset.visible = 'true';
    const reviewPanel = form.querySelector('fieldset[name="review_panel"]');
    if (reviewPanel) reviewPanel.dataset.visible = 'false';
    thankyouPanel.scrollIntoView?.({ behavior: 'smooth' });
  } else if (thankYouMsg || !redirectUrl) {
    let thankYouMessage = form.parentNode.querySelector('.form-message.success-message');
    if (!thankYouMessage) {
      thankYouMessage = document.createElement('div');
      thankYouMessage.className = 'form-message success-message';
    }
    thankYouMessage.innerHTML = thankYouMsg || DEFAULT_THANK_YOU_MESSAGE;
    // Hide the form and show only the success message
    form.style.display = 'none';
    form.parentNode.insertBefore(thankYouMessage, form);
    if (thankYouMessage.scrollIntoView) {
      thankYouMessage.scrollIntoView({ behavior: 'smooth' });
    }
  } else {
    window.location.assign(encodeURI(redirectUrl));
  }
  form.setAttribute('data-submitting', 'false');
  const submitBtn = form.querySelector('button[type="submit"]');
  if (submitBtn) submitBtn.disabled = false;
}

export function submitFailure(_e, form) {
  const thankyouPanel = form.querySelector('fieldset[name="thankyou_visible_panel"]');
  if (thankyouPanel) {
    thankyouPanel.dataset.visible = 'false';
    const reviewPanel = form.querySelector('fieldset[name="review_panel"]');
    if (reviewPanel) reviewPanel.dataset.visible = 'true';
  }
  const defaultErrorMsg = 'Some error occured while submitting the form';
  const errorMsg = formPlaceholders?.formSubmissionErrorMessage || defaultErrorMsg;
  let errorMessage = form.querySelector('.form-message.error-message');
  if (!errorMessage) {
    errorMessage = document.createElement('div');
    errorMessage.className = 'form-message error-message';
  }
  errorMessage.innerHTML = errorMsg;
  form.prepend(errorMessage);
  errorMessage.scrollIntoView({ behavior: 'smooth' });
  form.setAttribute('data-submitting', 'false');
  form.querySelector('button[type="submit"]').disabled = false;
}

function generateUnique() {
  return new Date().valueOf() + Math.random();
}

function getFieldValue(fe, payload) {
  if (fe.type === 'radio') {
    return fe.form.elements[fe.name].value;
  } if (fe.type === 'checkbox') {
    if (payload[fe.name]) {
      if (fe.checked) {
        return `${payload[fe.name]},${fe.value}`;
      }
      return payload[fe.name];
    } if (fe.checked) {
      return fe.value;
    }
  } else if (fe.type !== 'file') {
    // For date fields with a valueFormat, use the pre-formatted submitValue
    if (fe.dataset.submitValue !== undefined && fe.dataset.valueFormat) {
      return fe.dataset.submitValue;
    }
    return fe.value;
  }
  return null;
}

function constructPayload(form) {
  const payload = { __id__: generateUnique() };
  [...form.elements].forEach((fe) => {
    if (fe.name && !fe.matches('button') && !fe.disabled && fe.tagName !== 'FIELDSET' && !fe.name.includes('_exclude')) {
      const value = getFieldValue(fe, payload);
      if (fe.closest('.repeat-wrapper')) {
        payload[fe.name] = payload[fe.name] ? `${payload[fe.name]},${fe.value}` : value;
      } else {
        payload[fe.name] = value;
      }
    }
  });
  return { payload };
}

async function prepareRequest(form) {
  const { payload } = constructPayload(form);
  const headers = {
    'Content-Type': 'application/json',
    // eslint-disable-next-line comma-dangle
    'x-adobe-form-hostname': window?.location?.hostname
  };
  const body = { data: payload };
  let url;
  let baseUrl = getSubmitBaseUrl();
  if (!baseUrl) {
    // eslint-disable-next-line prefer-template
    baseUrl = 'https://forms.adobe.com/adobe/forms/af/submit/';
    url = baseUrl + btoa(`${form.dataset.action}.json`);
  } else {
    url = form.dataset.action;
  }
  return { headers, body, url };
}

async function submitDocBasedForm(form, captcha) {
  try {
    const { headers, body, url } = await prepareRequest(form, captcha);
    let token = null;
    if (captcha) {
      token = await captcha.getToken();
      body.data['g-recaptcha-response'] = token;
    }
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    if (response.ok) {
      submitSuccess(response, form);
    } else {
      const error = await response.text();
      throw new Error(error);
    }
  } catch (error) {
    submitFailure(error, form);
  }
}

export async function handleSubmit(e, form, captcha) {
  e.preventDefault();
  const valid = form.checkValidity();
  if (valid) {
    e.submitter?.setAttribute('disabled', '');
    if (form.getAttribute('data-submitting') !== 'true') {
      form.setAttribute('data-submitting', 'true');

      // hide error message in case it was shown before
      form.querySelectorAll('.form-message.show').forEach((el) => el.classList.remove('show'));

      if (form.dataset.source === 'sheet') {
        await submitDocBasedForm(form, captcha);
      }
    }
  } else {
    const firstInvalidEl = form.querySelector(':invalid:not(fieldset)');
    if (firstInvalidEl) {
      firstInvalidEl.focus();
      firstInvalidEl.scrollIntoView({ behavior: 'smooth' });
    }
  }
}
