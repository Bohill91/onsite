// ─── Auth Constants ────────────────────────────────────────
const AUTH_SESSION_KEY = 'onsite_auth_v1';
const AUTH_USERS_KEY   = 'onsite_users_v1';

const CERT_OPTIONS = window.OnSiteCredentials?.common?.() || [];

// ─── In-progress registration data ─────────────────────────
let workerRegData = {};
let companyRegData = {};

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

// ─── User Storage ──────────────────────────────────────────
function getUsers() {
  try { return JSON.parse(localStorage.getItem(AUTH_USERS_KEY)) || []; } catch (_) { return []; }
}
function saveUsers(users) {
  try { localStorage.setItem(AUTH_USERS_KEY, JSON.stringify(users)); } catch (_) {}
}
function getCurrentUser() {
  try { return JSON.parse(localStorage.getItem(AUTH_SESSION_KEY)); } catch (_) { return null; }
}
function setCurrentUser(user) {
  try { localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(user)); } catch (_) {}
}
function clearCurrentUser() {
  try { localStorage.removeItem(AUTH_SESSION_KEY); } catch (_) {}
}

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
  authOverlay.setAttribute('aria-hidden', 'false');
}
function hideAuthOverlay() {
  document.body.classList.remove('auth-is-open');
  authOverlay.style.display = 'none';
  authOverlay.setAttribute('aria-hidden', 'true');
}

function showScreen(id) {
  document.querySelectorAll('.auth-screen').forEach(s => s.classList.remove('active'));
  const el = document.getElementById('screen-' + id);
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
async function recoverCanonicalCompany(email, password) {
  if (email !== 'luke_bohill@outlook.com') return null;

  try {
    const response = await fetch('/api/auth/recover', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!response.ok) return null;
    const payload = await response.json();
    return payload.user || null;
  } catch (_) {
    return null;
  }
}

document.getElementById('loginForm').addEventListener('submit', async function(e) {
  e.preventDefault();
  const email = document.getElementById('loginEmail').value.trim().toLowerCase();
  const pass  = document.getElementById('loginPassword').value;
  const err   = document.getElementById('loginError');

  const existingUser = getUsers().find(u => u.email === email);
  let user = getUsers().find(u => u.email === email && u.password === pass);

  if (!user) {
    const recoveredUser = await recoverCanonicalCompany(email, pass);
    if (recoveredUser) {
      user = { ...existingUser, ...recoveredUser, password: pass };
      const users = getUsers().filter(u => u.email !== email);
      users.push(user);
      saveUsers(users);
    }
  }

  if (!user) {
    err.textContent = 'Incorrect email or password.';
    err.style.display = 'block';
    return;
  }
  err.style.display = 'none';
  setCurrentUser(user);
  hideAuthOverlay();
  updateTopbarUser(user);
});

// ─── Forgot Password ───────────────────────────────────────
document.getElementById('forgotForm').addEventListener('submit', function(e) {
  e.preventDefault();
  document.getElementById('forgotFormWrap').style.display = 'none';
  document.getElementById('forgotMsg').style.display = 'block';
});

// ─── Worker Reg — Step 1 ───────────────────────────────────
document.getElementById('workerStep1Form').addEventListener('submit', function(e) {
  e.preventDefault();
  const email = document.getElementById('regEmail').value.trim().toLowerCase();
  const pass  = document.getElementById('regPassword').value;
  const pass2 = document.getElementById('regPassword2').value;
  const err   = document.getElementById('step1Error');

  if (pass !== pass2) {
    err.textContent = 'Passwords do not match.';
    err.style.display = 'block';
    return;
  }
  if (getUsers().find(u => u.email === email)) {
    err.textContent = 'An account with this email already exists.';
    err.style.display = 'block';
    return;
  }
  err.style.display = 'none';
  workerRegData = {
    name:     document.getElementById('regName').value.trim(),
    email,
    phone:    document.getElementById('regPhone').value.trim(),
    password: pass,
  };
  setWorkerStep(2);
});

// ─── Worker Reg — Step 2: create the account ───────────────
document.getElementById('workerStep2Form').addEventListener('submit', function(e) {
  e.preventDefault();
  workerRegData.trade = document.getElementById('regTrade').value;
  workerRegData.tradeKey = window.OnSiteTaxonomy?.tradeKeyFor(workerRegData.trade) || '';
  workerRegData.specialism = document.getElementById('regRole').value;
  workerRegData.roleKey = window.OnSiteTaxonomy?.roleKeyFor(workerRegData.trade, workerRegData.specialism) || '';
  workerRegData.yearsExp = document.getElementById('regYearsExp').value;
  workerRegData.location = document.getElementById('regLocation').value.trim();
  workerRegData.locationData = window.workerLocationSelection || null;
  workerRegData.minRate = '';
  workerRegData.travelRadiusMiles = Number(document.getElementById('regTravelRadius').value) || 15;
  workerRegData.travelFurtherWithAccommodation =
    document.querySelector('input[name="regTravelFurther"]:checked')?.value === 'yes';
  const user = {
    id: 'user-' + Date.now() + '-' + Math.random().toString(16).slice(2),
    type: 'worker',
    name:     workerRegData.name,
    email:    workerRegData.email,
    phone:    workerRegData.phone,
    password: workerRegData.password,
    trade:    workerRegData.trade,
    tradeKey: workerRegData.tradeKey,
    specialism: workerRegData.specialism,
    roleKey: workerRegData.roleKey,
    // Compatibility mirror for legacy matching/profile readers.
    grade: workerRegData.specialism,
    yearsExp: workerRegData.yearsExp,
    location: workerRegData.location,
    minRate:  workerRegData.minRate,
    travelRadiusMiles: workerRegData.travelRadiusMiles || 15,
    travelFurtherWithAccommodation: !!workerRegData.travelFurtherWithAccommodation,
    weekendPreferences: workerRegData.weekendPreferences || {
      saturday: false,
      sunday: false,
      weekendOnly: false,
    },
    locationData: workerRegData.locationData,
    // Empty compatibility fields are intentionally completed later in Profile.
    utr: '',
    cisStatus: '',
    nationalInsuranceNumber: '',
    dateOfBirth: '',
    cscsCard: '',
    rightToWork: '',
    photoId: '',
    drivingLicenceHolder: false,
    certifications: [],
    qualifications: [],
    profilePhoto: '',
    verificationStatus: 'pending',
    workerVerificationStatus: 'pending',
    qualificationVerificationStatus: 'pending',
    paymentDetailsPlaceholder: '',
    preferredPaymentMethod: '',
    paymentVerificationStatus: 'unverified',
    createdAt: Date.now(),
  };

  // ── Permanent identity record + duplicate/returning-worker check ──
  let dupeResult = null;
  if (typeof registerWorkerIdentity === 'function') {
    dupeResult = registerWorkerIdentity(user);
    if (dupeResult && dupeResult.identity) {
      user.identityId = dupeResult.identity.workerIdentityId;
      if (dupeResult.isDuplicate && typeof dupeResult.restoredScore === 'number') {
        user.reliability = dupeResult.restoredScore;
      }
    }
  }

  const users = getUsers();
  users.push(user);
  saveUsers(users);
  if (typeof ensureWorkerProfileForUser === 'function') {
    ensureWorkerProfileForUser(user);
  }
  setCurrentUser(user);
  showWorkerSuccess(user, dupeResult);
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

function showWorkerSuccess(user, dupeResult) {
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
  showScreen('worker-success');
}

// ── Worker account deletion (keeps permanent identity record) ──
function deleteWorkerAccount() {
  const user = getCurrentUser();
  if (!user || user.type !== 'worker') return;
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
    !!user.profilePhoto,
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
    { label: 'Profile photo', done: !!user.profilePhoto },
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
  if (getUsers().find(function(u) { return u.email === email; })) {
    err.textContent = 'An account with this email already exists.';
    err.style.display = 'block';
    return;
  }
  err.style.display = 'none';
  companyRegData = {
    companyName: document.getElementById('companyName').value.trim(),
    name:        document.getElementById('companyContactName').value.trim(),
    email,
    phone:       document.getElementById('companyPhone').value.trim(),
    password: pass,
  };
  setCompanyStep(2);
});

// ─── Company Reg — Step 2 ──────────────────────────────────
document.getElementById('companyStep2Form').addEventListener('submit', function(e) {
  e.preventDefault();

  const accountsEmail = document.getElementById('companyAccountsEmail')?.value.trim().toLowerCase() || '';
  const err = document.getElementById('companyStep1Error');
  if (accountsEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(accountsEmail)) {
    err.textContent = 'Enter a valid accounts email address.';
    err.style.display = 'block';
    return;
  }
  err.style.display = 'none';

  const companyNumber = document.getElementById('companyRegNumber').value.trim();

  const user = {
    id: 'user-' + Date.now() + '-' + Math.random().toString(16).slice(2),
    type:        'company',
    name:        companyRegData.name,
    companyName: companyRegData.companyName,
    email:       companyRegData.email,
    phone:       companyRegData.phone,
    password:    companyRegData.password,
    address:     document.getElementById('companyAddress').value.trim(),
    regNumber:   companyNumber,
    companyNumber,
    vatNumber:   document.getElementById('companyVAT').value.trim(),
    vatRegistered: document.getElementById('companyVatRegistered')?.value === 'yes',
    paymentContact: document.getElementById('companyPaymentContact')?.value.trim() || '',
    accountsEmail,
    companyVerificationStatus: 'pending',
    vatVerificationStatus: document.getElementById('companyVAT').value.trim() ? 'pending' : 'unverified',
    verificationStatus: 'pending',
    createdAt: Date.now(),
  };

  const users = getUsers();
  users.push(user);
  saveUsers(users);
  setCurrentUser(user);

  document.getElementById('companySuccessName').textContent = companyRegData.companyName;
  showScreen('company-success');
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
function logoutCurrentUser() {
  clearCurrentUser();
  workerRegData   = {};
  companyRegData  = {};
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

// ─── Init ──────────────────────────────────────────────────
(function init() {
  try {
    // Populate cert checkboxes
    initialisePasswordToggles();
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

    // Check the existing session before revealing either the app or auth shell.
    const user = getCurrentUser();
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
