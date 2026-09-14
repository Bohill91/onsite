// ─── Auth Constants ────────────────────────────────────────
const AUTH_SESSION_KEY = 'onsite_auth_v1';
const AUTH_USERS_KEY   = 'onsite_users_v1';
const AUTHORITY_FIELDS = [
  'authUserId',
  'id',
  'workerId',
  'companyId',
  'type',
  'permissionRole',
  'companyRole',
  'membershipStatus',
  'foundingWorker',
  'serverAuthenticated',
];

const CERT_OPTIONS = window.OnSiteCredentials?.common?.() || [];

// ─── In-progress registration data ─────────────────────────
let workerRegData = {};
let companyRegData = {};
let workerRegPhotoDataUrl = '';
let workerRegPhotoPending = false;
let workerRegistrationPassword = '';
let companyRegistrationPassword = '';
let authenticatedPrincipal = null;

function resetWorkerRegistrationPhoto() {
  workerRegPhotoDataUrl = '';
  workerRegPhotoPending = false;
  const input = document.getElementById('regProfilePhoto');
  if (input) input.value = '';
  const preview = document.getElementById('regProfilePhotoPreview');
  if (preview) preview.removeAttribute('src');
  document.getElementById('regProfilePhotoControl')?.classList.remove('has-photo', 'is-loading');
  const action = document.getElementById('regProfilePhotoAction');
  if (action) action.textContent = 'Choose photo';
}

function startWorkerRegistration() {
  workerRegData = {};
  workerRegistrationPassword = '';
  document.getElementById('workerStep1Form')?.reset();
  document.getElementById('workerStep2Form')?.reset();
  resetWorkerRegistrationPhoto();
  initialiseWorkerReferralInput();
  initialiseWorkerTaxonomyFields();
  showScreen('worker-reg');
  setWorkerStep(1);
}

window.startWorkerRegistration = startWorkerRegistration;

function setAuthButtonLoading(button, isLoading, label = 'Working') {
  if (!(button instanceof HTMLButtonElement)) return;
  if (isLoading) {
    if (!button.dataset.loadingOriginalHtml) {
      button.dataset.loadingOriginalHtml = button.innerHTML;
      button.dataset.loadingOriginalMinWidth = button.style.minWidth || '';
      if (button.offsetWidth) button.style.minWidth = button.offsetWidth + 'px';
    }
    button.classList.add('is-loading');
    button.setAttribute('aria-busy', 'true');
    button.disabled = true;
    button.innerHTML = '<span class="btn-spinner" aria-hidden="true"></span><span>' + label + '</span>';
    return;
  }
  button.classList.remove('is-loading');
  button.removeAttribute('aria-busy');
  button.disabled = false;
  if (button.dataset.loadingOriginalHtml) {
    button.innerHTML = button.dataset.loadingOriginalHtml;
    button.style.minWidth = button.dataset.loadingOriginalMinWidth || '';
    delete button.dataset.loadingOriginalHtml;
    delete button.dataset.loadingOriginalMinWidth;
  }
}

document.addEventListener('submit', function(e) {
  const submitter = e.submitter;
  if (!(submitter instanceof HTMLButtonElement) || !submitter.closest('.auth-overlay')) return;
  setAuthButtonLoading(submitter, true, 'Saving');
  window.setTimeout(function() {
    if (document.body.contains(submitter)) setAuthButtonLoading(submitter, false);
  }, 450);
});

// ─── Server-authenticated principal compatibility ──────────
function withoutPassword(value) {
  if (!value || typeof value !== 'object') return value;
  const { password: _password, ...safe } = value;
  return safe;
}

function getUsers() {
  try {
    const users = JSON.parse(localStorage.getItem(AUTH_USERS_KEY)) || [];
    return users.map(withoutPassword);
  } catch (_) {
    return [];
  }
}
function saveUsers(users) {
  try {
    localStorage.setItem(AUTH_USERS_KEY, JSON.stringify((users || []).map(withoutPassword)));
  } catch (_) {}
}
function getCurrentUser() {
  return authenticatedPrincipal ? { ...authenticatedPrincipal } : null;
}
function setCurrentUser(user) {
  if (!user) {
    authenticatedPrincipal = null;
    return;
  }
  if (!authenticatedPrincipal) {
    if (user.serverAuthenticated) authenticatedPrincipal = withoutPassword(user);
    return;
  }
  const next = { ...authenticatedPrincipal, ...withoutPassword(user) };
  AUTHORITY_FIELDS.forEach(function(field) {
    next[field] = authenticatedPrincipal[field];
  });
  authenticatedPrincipal = next;
}
function clearCurrentUser() {
  authenticatedPrincipal = null;
  try { localStorage.removeItem(AUTH_SESSION_KEY); } catch (_) {}
}
function acceptServerPrincipal(principal) {
  if (!principal?.serverAuthenticated) {
    throw new Error('The server did not return an authenticated OnSite identity.');
  }
  authenticatedPrincipal = {
    ...(authenticatedPrincipal || {}),
    ...withoutPassword(principal),
  };
  try { localStorage.removeItem(AUTH_SESSION_KEY); } catch (_) {}
  return getCurrentUser();
}

async function authRequest(path, { method = 'GET', body } = {}) {
  const response = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let payload = {};
  try { payload = await response.json(); } catch (_) {}
  if (!response.ok) {
    const error = new Error(payload.error || 'Authentication request failed.');
    error.code = payload.code || 'AUTH_ERROR';
    error.status = response.status;
    throw error;
  }
  return payload;
}

async function updateServerWorkerProfile(changes) {
  const payload = await authRequest('/api/auth/worker-profile', {
    method: 'PATCH',
    body: changes,
  });
  return acceptServerPrincipal(payload.principal);
}

window.OnSiteAuth = {
  getCurrentUser,
  updateWorkerProfile: updateServerWorkerProfile,
};

// ─── Overlay & Screen Control ──────────────────────────────
const authOverlay = document.getElementById('auth-overlay');
const mainApp = document.getElementById('main-app');

function setMainAppAvailable(isAvailable) {
  if (!mainApp) return;
  if (isAvailable) {
    mainApp.removeAttribute('inert');
    mainApp.removeAttribute('aria-hidden');
    return;
  }
  mainApp.setAttribute('inert', '');
  mainApp.setAttribute('aria-hidden', 'true');
}

function showAuthOverlay() {
  setMainAppAvailable(false);
  document.body.classList.add('auth-is-open');
  authOverlay.style.display = 'flex';
  authOverlay.removeAttribute('inert');
  authOverlay.setAttribute('aria-hidden', 'false');
}
function hideAuthOverlay() {
  document.body.classList.remove('auth-is-open');
  authOverlay.style.display = 'none';
  authOverlay.setAttribute('inert', '');
  authOverlay.setAttribute('aria-hidden', 'true');
}

function showScreen(id) {
  document.querySelectorAll('.auth-screen').forEach(s => s.classList.remove('active'));
  const el = document.getElementById('screen-' + id);
  const forgotEmail = document.getElementById('forgotEmail');
  const forgotFormWrap = document.getElementById('forgotFormWrap');
  const forgotMsg = document.getElementById('forgotMsg');
  const forgotIsActive = id === 'forgot';
  if (forgotEmail) forgotEmail.disabled = !forgotIsActive;
  if (forgotIsActive) {
    if (forgotFormWrap) forgotFormWrap.style.display = '';
    if (forgotMsg) forgotMsg.style.display = 'none';
  }
  if (el) {
    el.classList.add('active');
    authOverlay.scrollTop = 0;
  }
}

function initialisePasswordToggles() {
  document.querySelectorAll('[data-password-toggle]').forEach(function(button) {
    button.addEventListener('click', function() {
      const input = document.getElementById(button.dataset.passwordToggle);
      if (!input) return;
      const shouldShow = input.type === 'password';
      input.type = shouldShow ? 'text' : 'password';
      button.setAttribute('aria-label', shouldShow ? 'Hide password' : 'Show password');
      button.setAttribute('aria-pressed', String(shouldShow));
    });
  });
}

// ─── Topbar User ───────────────────────────────────────────
function updateTopbarUser(user) {
  const userSection = document.getElementById('topbar-user');
  const resetBtn    = document.getElementById('resetDemoBtn');
  if (!user) return;
  setMainAppAvailable(true);

  const ini = user.name.trim().split(/\s+/).slice(0, 2).map(w => w[0].toUpperCase()).join('');
  const initialsEl = document.getElementById('topbar-user-initials');
  const nameEl = document.getElementById('topbar-user-name');
  const statusEl = document.getElementById('topbar-user-status');
  if (initialsEl) initialsEl.textContent = ini;
  if (nameEl) nameEl.textContent = user.type === 'company' ? user.companyName : user.name;

  if (statusEl) {
    if (user.type === 'worker') {
      const map = { incomplete: 'Unverified', pending: 'Pending Review', verified: 'Verified' };
      statusEl.textContent = map[user.verificationStatus || 'incomplete'];
      statusEl.className   = 'user-status-badge status-' + (user.verificationStatus || 'incomplete');
    } else {
      statusEl.textContent = 'Hiring company';
      statusEl.className   = 'user-status-badge status-company';
    }
  }
  if (userSection) userSection.style.display = 'flex';
  if (resetBtn) resetBtn.style.display = 'none';

  if (user.type === 'worker' && typeof ensureWorkerProfileForUser === 'function') {
    ensureWorkerProfileForUser(user);
  }

  // Apply role-specific UI
  if (typeof applyRoleView === 'function') applyRoleView(user);
}

// ─── Login ─────────────────────────────────────────────────
function showLoginNotice(message) {
  const notice = document.getElementById('loginNotice');
  if (!notice) return;
  notice.textContent = message || '';
  notice.style.display = message ? 'flex' : 'none';
}

document.getElementById('loginForm').addEventListener('submit', async function(e) {
  e.preventDefault();
  const email = document.getElementById('loginEmail').value.trim().toLowerCase();
  const pass  = document.getElementById('loginPassword').value;
  const err   = document.getElementById('loginError');
  const submitter = e.submitter;
  showLoginNotice('');
  setAuthButtonLoading(submitter, true, 'Signing in');
  try {
    const payload = await authRequest('/api/auth/login', {
      method: 'POST',
      body: { email, password: pass },
    });
    const user = acceptServerPrincipal(payload.principal);
    err.style.display = 'none';
    document.getElementById('loginPassword').value = '';
    hideAuthOverlay();
    updateTopbarUser(user);
  } catch (error) {
    err.textContent = error.message || 'Incorrect email or password.';
    err.style.display = 'block';
  } finally {
    setAuthButtonLoading(submitter, false);
  }
});

// ─── Forgot Password ───────────────────────────────────────
document.getElementById('forgotForm').addEventListener('submit', async function(e) {
  e.preventDefault();
  const email = document.getElementById('forgotEmail').value.trim().toLowerCase();
  const submitter = e.submitter;
  setAuthButtonLoading(submitter, true, 'Sending');
  try {
    await authRequest('/api/auth/password/recovery', {
      method: 'POST',
      body: { email },
    });
    document.getElementById('forgotFormWrap').style.display = 'none';
    document.getElementById('forgotMsg').style.display = 'block';
    document.getElementById('forgotEmail').disabled = true;
  } catch (error) {
    const errorElement = document.getElementById('forgotError');
    if (errorElement) {
      errorElement.textContent = error.message || 'Password recovery could not be started.';
      errorElement.style.display = 'block';
    }
  } finally {
    setAuthButtonLoading(submitter, false);
  }
});

// ─── Worker Reg — Step 1 ───────────────────────────────────
document.getElementById('workerStep1Form').addEventListener('submit', function(e) {
  e.preventDefault();
  const email = document.getElementById('regEmail').value.trim().toLowerCase();
  const referralInput = document.getElementById('regReferralCode');
  const referralCode = referralInput?.value.trim().toUpperCase() || '';
  const pass  = document.getElementById('regPassword').value;
  const pass2 = document.getElementById('regPassword2').value;
  const err   = document.getElementById('step1Error');

  if (workerRegPhotoPending) {
    err.textContent = 'Your profile photo is still being prepared. Please wait a moment.';
    err.style.display = 'block';
    return;
  }
  if (!workerRegPhotoDataUrl) {
    err.textContent = 'Add a profile photo before continuing.';
    err.style.display = 'block';
    document.getElementById('regProfilePhoto')?.focus();
    return;
  }

  if (pass !== pass2) {
    err.textContent = 'Passwords do not match.';
    err.style.display = 'block';
    return;
  }
  if (referralCode && typeof validateWorkerReferralCode === 'function') {
    const validation = validateWorkerReferralCode(referralCode);
    if (!validation.ok) {
      err.textContent = validation.reason || 'Referral code not recognised.';
      err.style.display = 'block';
      referralInput?.focus();
      return;
    }
  }
  err.style.display = 'none';
  workerRegData = {
    name:     document.getElementById('regName').value.trim(),
    email,
    phone:    document.getElementById('regPhone').value.trim(),
    profilePhotoDataUrl: workerRegPhotoDataUrl,
    referralCode,
  };
  workerRegistrationPassword = pass;
  setWorkerStep(2);
});

document.getElementById('regProfilePhoto')?.addEventListener('change', async function(e) {
  const input = e.currentTarget;
  const file = input.files && input.files[0];
  const err = document.getElementById('step1Error');
  if (!file) return;
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    workerRegPhotoDataUrl = '';
    input.value = '';
    err.textContent = 'Choose a JPG, PNG or WebP profile photo.';
    err.style.display = 'block';
    return;
  }

  workerRegPhotoPending = true;
  document.getElementById('regProfilePhotoControl')?.classList.add('is-loading');
  try {
    workerRegPhotoDataUrl = typeof compressImage === 'function'
      ? await compressImage(file)
      : await new Promise(function(resolve, reject) {
          const reader = new FileReader();
          reader.onerror = reject;
          reader.onload = function(event) { resolve(event.target.result); };
          reader.readAsDataURL(file);
        });
    const preview = document.getElementById('regProfilePhotoPreview');
    if (preview) preview.src = workerRegPhotoDataUrl;
    document.getElementById('regProfilePhotoControl')?.classList.add('has-photo');
    const action = document.getElementById('regProfilePhotoAction');
    if (action) action.textContent = 'Change photo';
    if (err) err.style.display = 'none';
  } catch (_) {
    workerRegPhotoDataUrl = '';
    input.value = '';
    if (err) {
      err.textContent = 'That photo could not be prepared. Try another image.';
      err.style.display = 'block';
    }
  } finally {
    workerRegPhotoPending = false;
    document.getElementById('regProfilePhotoControl')?.classList.remove('is-loading');
  }
});

// ─── Worker Reg — Step 2: create the account ───────────────
document.getElementById('workerStep2Form').addEventListener('submit', async function(e) {
  e.preventDefault();
  const minRateInput = document.getElementById('regMinRate');
  const minRateResult = window.OnSiteWorkerRatePreferences?.applyMinimumDayRate(
    workerRegData,
    minRateInput?.value,
  );
  if (!minRateResult?.ok) {
    minRateInput?.setCustomValidity(minRateResult?.reason || 'Enter a valid minimum day rate');
    minRateInput?.reportValidity();
    return;
  }
  minRateInput.setCustomValidity('');
  workerRegData.trade = document.getElementById('regTrade').value;
  workerRegData.tradeKey = window.OnSiteTaxonomy?.tradeKeyFor(workerRegData.trade) || '';
  workerRegData.specialism = document.getElementById('regRole').value;
  workerRegData.roleKey = window.OnSiteTaxonomy?.roleKeyFor(workerRegData.trade, workerRegData.specialism) || '';
  workerRegData.yearsExp = document.getElementById('regYearsExp').value;
  workerRegData.location = document.getElementById('regLocation').value.trim();
  workerRegData.locationData = window.workerLocationSelection || null;
  workerRegData.minRate = minRateResult.minimumDayRate;
  workerRegData.travelRadiusMiles = Number(document.getElementById('regTravelRadius').value) || 15;
  workerRegData.travelFurtherWithAccommodation =
    document.querySelector('input[name="regTravelFurther"]:checked')?.value === 'yes';
  workerRegData.weekendPreferences = {
    saturday: document.getElementById('regWeekendSaturday')?.value === 'yes',
    sunday: document.getElementById('regWeekendSunday')?.value === 'yes',
    weekendOnly: document.getElementById('regWeekendOnly')?.value === 'yes',
  };

  const submitter = e.submitter;
  const errorElement = document.getElementById('workerStep2Error');
  setAuthButtonLoading(submitter, true, 'Creating account');
  try {
    const payload = await authRequest('/api/auth/register/worker', {
      method: 'POST',
      body: {
        name: workerRegData.name,
        email: workerRegData.email,
        phone: workerRegData.phone,
        password: workerRegistrationPassword,
        referralCode: workerRegData.referralCode,
        trade: workerRegData.trade,
        tradeKey: workerRegData.tradeKey,
        specialism: workerRegData.specialism,
        roleKey: workerRegData.roleKey,
        grade: workerRegData.specialism,
        yearsExperience: workerRegData.yearsExp,
        location: workerRegData.location,
        locationData: workerRegData.locationData,
        minimumDayRate: workerRegData.minRate,
        travelRadiusMiles: workerRegData.travelRadiusMiles,
        travelFurtherWithAccommodation: workerRegData.travelFurtherWithAccommodation,
        weekendPreferences: workerRegData.weekendPreferences,
      },
    });
    workerRegistrationPassword = '';
    if (payload.requiresEmailConfirmation) {
      showScreen('login');
      showLoginNotice('Check your email to confirm your account, then sign in.');
      return;
    }
    const user = acceptServerPrincipal({
      ...payload.principal,
      profilePhotoDataUrl: workerRegData.profilePhotoDataUrl || '',
    });

    let dupeResult = null;
    if (typeof registerWorkerIdentity === 'function') {
      dupeResult = registerWorkerIdentity(user);
      if (dupeResult?.identity) user.identityId = dupeResult.identity.workerIdentityId;
    }
    if (typeof ensureWorkerProfileForUser === 'function') ensureWorkerProfileForUser(user);
    const referralResult = workerRegData.referralCode && typeof registerWorkerReferral === 'function'
      ? registerWorkerReferral(user, workerRegData.referralCode)
      : null;
    setCurrentUser(user);
    if (errorElement) errorElement.style.display = 'none';
    showWorkerSuccess(getCurrentUser(), dupeResult, referralResult);
  } catch (error) {
    if (errorElement) {
      errorElement.textContent = error.message || 'Worker account creation failed.';
      errorElement.style.display = 'block';
    }
  } finally {
    setAuthButtonLoading(submitter, false);
  }
});

function setWorkerStep(step) {
  document.querySelectorAll('.reg-step').forEach(s => s.classList.remove('active'));
  const target = document.querySelector('.reg-step[data-step="' + step + '"]');
  if (target) target.classList.add('active');

  document.querySelectorAll('#workerStepper .stepper-dot').forEach(function(dot, i) {
    if (i + 1 < step)  { dot.classList.add('done');   dot.classList.remove('active'); }
    if (i + 1 === step){ dot.classList.add('active');  dot.classList.remove('done');  }
    if (i + 1 > step)  { dot.classList.remove('done'); dot.classList.remove('active');}
  });

  document.querySelectorAll('#workerStepper .stepper-line').forEach(function(line, i) {
    line.classList.toggle('done', i + 1 < step);
  });

  document.getElementById('workerStepLabel').innerHTML =
    'Step <strong>' + step + '</strong> of 2 — ' + ['Account', 'Work profile'][step - 1];
  authOverlay.scrollTop = 0;
}

function showWorkerSuccess(user, dupeResult, referralResult) {
  const assessment = typeof assessWorkerProfile === 'function'
    ? assessWorkerProfile(user)
    : { percentage: calcCompletion(user), workReady: false, missingMandatoryItems: [] };
  const completion = Number(assessment.percentage ?? 0);
  document.getElementById('workerSuccessName').textContent = user.name.split(' ')[0];
  document.getElementById('workerCompletionPct').textContent = completion + '%';
  document.getElementById('workerCompletionBar').style.width = completion + '%';
  renderCompletionChecklist(user);
  const status = document.getElementById('workerWorkStatus');
  if (status) status.textContent = (assessment.workReady ?? assessment.isWorkReady) ? 'Work ready' : 'Not work ready';
  const missing = assessment.missingMandatoryItems || [];
  const missingEl = document.getElementById('completionMissing');
  if (missingEl) missingEl.textContent = missing.length
    ? missing.length + ' required ' + (missing.length === 1 ? 'item' : 'items') + ' remaining before you can apply or be matched: ' +
      missing.map(function(item) { return item.label; }).join(', ') + '.'
    : 'Your required profile items are complete.';
  const note = document.getElementById('returningWorkerNote');
  if (note) {
    if (dupeResult && dupeResult.isDuplicate) {
      note.style.display = 'block';
      note.innerHTML =
        '<strong>Welcome back.</strong> We matched this sign-up to an existing sub-contractor profile, ' +
        'so your reliability record (' + (dupeResult.restoredScore != null ? dupeResult.restoredScore + '%' : 'previous score') +
        ') and history have been restored. Our team may review the match.';
    } else {
      note.style.display = 'none';
    }
  }
  const referralNote = document.getElementById('workerReferralJoinNote');
  if (referralNote) {
    if (referralResult?.ok && referralResult.referral?.foundingWorker) {
      referralNote.style.display = 'block';
      referralNote.innerHTML = '<strong>Founding Worker status added.</strong> Your referral has been linked. Rewards remain conditional on paid work milestones after launch.';
    } else if (workerRegData.referralCode && referralResult && !referralResult.ok) {
      referralNote.style.display = 'block';
      referralNote.textContent = referralResult.reason || 'The referral could not be linked.';
    } else {
      referralNote.style.display = 'none';
      referralNote.textContent = '';
    }
  }
  showScreen('worker-success');
}

// ── Worker account deletion (keeps permanent identity record) ──
function deleteWorkerAccount() {
  const user = getCurrentUser();
  if (!user || user.type !== 'worker') return;
  if (user.serverAuthenticated) {
    alert('Contact OnSite support to request secure account deletion.');
    return;
  }
  const ok = confirm(
    'Delete your account?\n\n' +
    'Your login will be removed, but OnSite keeps a limited identity and ' +
    'reliability record for fraud prevention and dispute handling. ' +
    'You cannot create a fresh reliability profile by signing up again.'
  );
  if (!ok) return;

  if (typeof markIdentityDeleted === 'function') markIdentityDeleted(user.id);

  // Remove the login account (disable access) but retain the identity record.
  saveUsers(getUsers().filter(function (u) { return u.id !== user.id; }));
  clearCurrentUser();
  workerRegData = {};
  companyRegData = {};
  resetWorkerRegistrationPhoto();

  const userSection = document.getElementById('topbar-user');
  const resetBtn    = document.getElementById('resetDemoBtn');
  if (userSection) userSection.style.display = 'none';
  if (resetBtn)    resetBtn.style.display = '';
  if (typeof applyRoleView === 'function') applyRoleView(null);

  showAuthOverlay();
  showScreen('welcome');
}

function calcCompletion(user) {
  const items = [
    !!(user.name && user.email && user.phone),
    !!(user.trade && (user.specialism || user.grade)),
    !!user.location,
    !!user.utr,
    !!user.rightToWork,
    !!user.cscsCard,
    !!(user.certifications && user.certifications.length),
    !!(user.profilePhotoDataUrl || user.profilePhoto),
  ];
  return Math.round(items.filter(Boolean).length / items.length * 100);
}

function renderCompletionChecklist(user) {
  const items = [
    { label: 'Account details', done: !!(user.name && user.email && user.phone) },
    { label: 'Trade profile', done: !!(user.trade && (user.specialism || user.grade)) },
    { label: 'Home location', done: !!user.location },
    { label: 'CIS / UTR details', done: !!(user.utr && user.cisStatus) },
    { label: 'Identity information', done: !!(user.dateOfBirth && user.photoId) },
    { label: 'Right to Work', done: !!user.rightToWork },
    { label: 'Trade card details', done: !!user.cscsCard },
    { label: 'Qualifications and certificates', done: !!(user.certifications && user.certifications.length) },
    { label: 'Profile photo', done: !!(user.profilePhotoDataUrl || user.profilePhoto) },
  ];
  const list = document.getElementById('completionChecklist');
  list.innerHTML = items.map(function(item) {
    return '<li class="completion-item ' + (item.done ? 'done' : 'pending') + '">' +
      '<div class="ci-dot">' +
        (item.done
          ? '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>'
          : '<svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/></svg>') +
      '</div>' +
      item.label +
      (item.done ? '' : ' <span style="color:var(--ink-3);font-weight:400;">— not yet added</span>') +
    '</li>';
  }).join('');
}

function initialiseWorkerReferralInput() {
  const input = document.getElementById('regReferralCode');
  if (!input) return;
  const queryCode = new URLSearchParams(window.location.search).get('ref') || '';
  if (queryCode && !input.value) input.value = queryCode.trim().toUpperCase();
  if (input.dataset.referralInitialised === 'true') return;
  input.dataset.referralInitialised = 'true';
  input.addEventListener('blur', function() {
    input.value = input.value.trim().toUpperCase();
  });
}

// ─── Canonical Trade → Role classification ────────────────
function initialiseWorkerTaxonomyFields() {
  const trade = document.getElementById('regTrade');
  const role = document.getElementById('regRole');
  if (!trade || !role || !window.OnSiteTaxonomy) return;
  window.OnSiteTaxonomy.populateTradeSelect(trade, {
    selectedValue: trade.value,
    preserveUnknown: true,
  });
  window.OnSiteTaxonomy.populateRoleSelect(role, trade.value, {
    selectedValue: role.value,
    preserveUnknown: true,
  });
}

document.getElementById('regTrade').addEventListener('change', function() {
  window.OnSiteTaxonomy?.populateRoleSelect(
    document.getElementById('regRole'),
    this.value,
  );
});

// ─── Company Reg — Step 1 ──────────────────────────────────
document.getElementById('companyStep1Form').addEventListener('submit', function(e) {
  e.preventDefault();
  const email = document.getElementById('companyEmail').value.trim().toLowerCase();
  const pass  = document.getElementById('companyPassword').value;
  const pass2 = document.getElementById('companyPassword2').value;
  const err   = document.getElementById('companyStep1Error');

  if (pass !== pass2) {
    err.textContent = 'Passwords do not match.';
    err.style.display = 'block';
    return;
  }
  err.style.display = 'none';
  companyRegData = {
    companyName: document.getElementById('companyName').value.trim(),
    name:        document.getElementById('companyContactName').value.trim(),
    email,
    phone:       document.getElementById('companyPhone').value.trim(),
  };
  companyRegistrationPassword = pass;
  setCompanyStep(2);
});

// ─── Company Reg — Step 2 ──────────────────────────────────
document.getElementById('companyStep2Form').addEventListener('submit', async function(e) {
  e.preventDefault();

  const accountsEmail = document.getElementById('companyAccountsEmail')?.value.trim().toLowerCase() || '';
  const err = document.getElementById('companyStep2Error');
  if (accountsEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(accountsEmail)) {
    err.textContent = 'Enter a valid accounts email address.';
    err.style.display = 'block';
    return;
  }
  err.style.display = 'none';

  const companyNumber = document.getElementById('companyRegNumber').value.trim();

  const submitter = e.submitter;
  const errorElement = document.getElementById('companyStep2Error');
  setAuthButtonLoading(submitter, true, 'Creating account');
  try {
    const payload = await authRequest('/api/auth/register/company', {
      method: 'POST',
      body: {
        name: companyRegData.name,
        companyName: companyRegData.companyName,
        email: companyRegData.email,
        phone: companyRegData.phone,
        password: companyRegistrationPassword,
        address: document.getElementById('companyAddress').value.trim(),
        companyNumber,
        vatNumber: document.getElementById('companyVAT').value.trim(),
        vatRegistered: document.getElementById('companyVatRegistered')?.value === 'yes',
        paymentContact: document.getElementById('companyPaymentContact')?.value.trim() || '',
        accountsEmail,
      },
    });
    companyRegistrationPassword = '';
    if (payload.requiresEmailConfirmation) {
      showScreen('login');
      showLoginNotice('Check your email to confirm your account, then sign in.');
      return;
    }
    const user = acceptServerPrincipal(payload.principal);
    if (errorElement) errorElement.style.display = 'none';
    document.getElementById('companySuccessName').textContent = user.companyName;
    showScreen('company-success');
  } catch (error) {
    if (errorElement) {
      errorElement.textContent = error.message || 'Company account creation failed.';
      errorElement.style.display = 'block';
    }
  } finally {
    setAuthButtonLoading(submitter, false);
  }
});

function setCompanyStep(step) {
  document.querySelectorAll('.company-step').forEach(s => s.classList.remove('active'));
  const target = document.querySelector('.company-step[data-step="' + step + '"]');
  if (target) target.classList.add('active');

  document.querySelectorAll('#companyStepper .stepper-dot').forEach(function(dot, i) {
    if (i + 1 < step)  { dot.classList.add('done');   dot.classList.remove('active'); }
    if (i + 1 === step){ dot.classList.add('active');  dot.classList.remove('done');  }
    if (i + 1 > step)  { dot.classList.remove('done'); dot.classList.remove('active');}
  });
  document.querySelectorAll('#companyStepper .stepper-line').forEach(function(line, i) {
    line.classList.toggle('done', i + 1 < step);
  });

  document.getElementById('companyStepLabel').innerHTML =
    'Step <strong>' + step + '</strong> of 2 — ' + ['Company Details', 'Company Information'][step - 1];
  authOverlay.scrollTop = 0;
}

// ─── Continue buttons ──────────────────────────────────────
document.getElementById('workerSuccessContinueBtn').addEventListener('click', function() {
  hideAuthOverlay();
  updateTopbarUser(getCurrentUser());
});

document.getElementById('workerCompleteProfileBtn')?.addEventListener('click', function() {
  hideAuthOverlay();
  updateTopbarUser(getCurrentUser());
  if (typeof switchTab === 'function') switchTab('profile');
});

document.getElementById('companySuccessContinueBtn').addEventListener('click', function() {
  hideAuthOverlay();
  updateTopbarUser(getCurrentUser());
});

// ─── Logout ────────────────────────────────────────────────
async function logoutCurrentUser() {
  try {
    await authRequest('/api/auth/logout', { method: 'POST' });
  } catch (_) {
    // Local UI state is cleared even if the network is unavailable.
  }
  clearCurrentUser();
  workerRegData   = {};
  companyRegData  = {};
  workerRegistrationPassword = '';
  companyRegistrationPassword = '';
  resetWorkerRegistrationPhoto();
  const userSection = document.getElementById('topbar-user');
  const resetBtn    = document.getElementById('resetDemoBtn');
  if (userSection) userSection.style.display = 'none';
  if (resetBtn)    resetBtn.style.display = '';

  // Reset role-specific UI back to admin/demo view
  if (typeof applyRoleView === 'function') applyRoleView(null);

  showAuthOverlay();
  showScreen('welcome');
}

window.logoutCurrentUser = logoutCurrentUser;
document.getElementById('logoutBtn')?.addEventListener('click', logoutCurrentUser);

document.getElementById('resetPasswordForm')?.addEventListener('submit', async function(e) {
  e.preventDefault();
  const password = document.getElementById('resetPassword').value;
  const confirmation = document.getElementById('resetPassword2').value;
  const errorElement = document.getElementById('resetPasswordError');
  if (password !== confirmation) {
    errorElement.textContent = 'Passwords do not match.';
    errorElement.style.display = 'block';
    return;
  }
  const submitter = e.submitter;
  setAuthButtonLoading(submitter, true, 'Updating');
  try {
    await authRequest('/api/auth/password/reset', {
      method: 'POST',
      body: { password },
    });
    await authRequest('/api/auth/logout', { method: 'POST' });
    clearCurrentUser();
    document.getElementById('resetPasswordForm').reset();
    showScreen('login');
    showLoginNotice('Password updated. Sign in with your new password.');
  } catch (error) {
    errorElement.textContent = error.message || 'Password reset failed.';
    errorElement.style.display = 'block';
  } finally {
    setAuthButtonLoading(submitter, false);
  }
});

async function adoptPasswordRecoverySession() {
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  if (params.get('type') !== 'recovery') return false;
  const accessToken = params.get('access_token') || '';
  const refreshToken = params.get('refresh_token') || '';
  try {
    const payload = await authRequest('/api/auth/password/adopt', {
      method: 'POST',
      body: { accessToken, refreshToken },
    });
    acceptServerPrincipal(payload.principal);
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
    showAuthOverlay();
    showScreen('reset-password');
    return true;
  } catch (error) {
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
    showAuthOverlay();
    showScreen('login');
    const loginError = document.getElementById('loginError');
    loginError.textContent = error.message || 'The password recovery link is invalid or expired.';
    loginError.style.display = 'block';
    return true;
  }
}

async function restoreServerSession() {
  try {
    const payload = await authRequest('/api/auth/session');
    return acceptServerPrincipal(payload.principal);
  } catch (error) {
    clearCurrentUser();
    if (error.status !== 401 && error.status !== 503) {
      console.error('[Auth] Session restoration failed:', error.message);
    }
    return null;
  }
}

// ─── Init ──────────────────────────────────────────────────
(async function init() {
  try {
    // Remove password material left by the retired browser-only account store.
    saveUsers(getUsers());
    clearCurrentUser();
    // Populate cert checkboxes
    initialisePasswordToggles();
    initialiseWorkerReferralInput();
    const certContainer = document.getElementById('certCheckboxes');
    if (certContainer) {
      certContainer.innerHTML = CERT_OPTIONS.map(function(c) {
        return '<label class="cert-checkbox">' +
          '<input type="checkbox" value="' + c.id + '" />' +
          '<span class="cert-name">' + c.label + '</span>' +
          '<input type="date" class="cert-expiry-input" title="Expiry date (optional)" />' +
          '</label>';
      }).join('');
    }

    // Populate the shared V1 trade and role taxonomy.
    initialiseWorkerTaxonomyFields();
    if (window.OnSiteLocations?.initUkLocationPicker) {
      const locationInput = document.getElementById('regLocation');
      const picker = window.OnSiteLocations.initUkLocationPicker({ input: locationInput });
      locationInput?.addEventListener('onsite-location-selected', function(event) {
        window.workerLocationSelection = event.detail;
      });
      window.workerLocationPicker = picker;
    }

    document.getElementById('useCurrentLocationBtn')?.addEventListener('click', async function() {
      const btn = this;
      const input = document.getElementById('regLocation');
      if (!input || typeof getGPS !== 'function') return;
      setAuthButtonLoading(btn, true, 'Locating');
      try {
        const gps = await getGPS();
        input.value = gps.lat.toFixed(5) + ', ' + gps.lng.toFixed(5);
      } catch (_) {
        input.placeholder = 'Location unavailable — enter town or postcode';
      } finally {
        setAuthButtonLoading(btn, false);
      }
    });

    if (await adoptPasswordRecoverySession()) {
      window.OnSiteLaunch?.ready();
      return;
    }

    // Restore the server session from HttpOnly cookies before revealing the app.
    const user = await restoreServerSession();
    if (user) {
      hideAuthOverlay();
      updateTopbarUser(user);
    } else {
      showAuthOverlay();
      showScreen('welcome');
    }
    window.OnSiteLaunch?.ready();
  } catch (error) {
    window.OnSiteLaunch?.fail(error);
  }
})();
