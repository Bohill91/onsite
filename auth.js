// ─── Auth Constants ────────────────────────────────────────
const AUTH_SESSION_KEY = 'onsite_auth_v1';
const AUTH_USERS_KEY   = 'onsite_users_v1';

const TRADE_GRADES = {
  'Electrical':  ['Mate', 'Improver', 'Electrician', 'Approved Electrician', 'Supervisor'],
  'Plumbing':    ['Mate', 'Improver', 'Plumber', 'Pipefitter', 'Mechanical Supervisor'],
  'Carpentry':   ['Mate', 'Carpenter', 'Shopfitter', 'Supervisor'],
  'Groundworks': ['Labourer', 'Groundworker', 'Plant Operator', 'Foreman'],
  'Other':       ['Worker', 'Skilled Worker', 'Supervisor', 'Foreman'],
};

const CERT_OPTIONS = ['CSCS', 'ECS', 'JIB', 'IPAF', 'PASMA', 'SSSTS', 'SMSTS', 'First Aid'];

// ─── In-progress registration data ─────────────────────────
let workerRegData = {};
let companyRegData = {};

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

function showAuthOverlay() {
  authOverlay.style.display = 'flex';
}
function hideAuthOverlay() {
  authOverlay.style.display = 'none';
}

function showScreen(id) {
  document.querySelectorAll('.auth-screen').forEach(s => s.classList.remove('active'));
  const el = document.getElementById('screen-' + id);
  if (el) {
    el.classList.add('active');
    authOverlay.scrollTop = 0;
  }
}

// ─── Topbar User ───────────────────────────────────────────
function updateTopbarUser(user) {
  const userSection = document.getElementById('topbar-user');
  const resetBtn    = document.getElementById('resetDemoBtn');
  if (!userSection || !user) return;

  const ini = user.name.trim().split(/\s+/).slice(0, 2).map(w => w[0].toUpperCase()).join('');
  document.getElementById('topbar-user-initials').textContent = ini;
  document.getElementById('topbar-user-name').textContent =
    user.type === 'company' ? user.companyName : user.name;

  const statusEl = document.getElementById('topbar-user-status');
  if (user.type === 'worker') {
    const map = { incomplete: 'Unverified', pending: 'Pending Review', verified: 'Verified' };
    statusEl.textContent = map[user.verificationStatus || 'incomplete'];
    statusEl.className   = 'user-status-badge status-' + (user.verificationStatus || 'incomplete');
  } else {
    statusEl.textContent = 'Company';
    statusEl.className   = 'user-status-badge status-company';
  }
  userSection.style.display = 'flex';
  if (resetBtn) resetBtn.style.display = 'none';

  if (user.type === 'worker' && typeof ensureWorkerProfileForUser === 'function') {
    ensureWorkerProfileForUser(user);
  }

  // Apply role-specific UI
  if (typeof applyRoleView === 'function') applyRoleView(user);
}

// ─── Login ─────────────────────────────────────────────────
document.getElementById('loginForm').addEventListener('submit', function(e) {
  e.preventDefault();
  const email = document.getElementById('loginEmail').value.trim().toLowerCase();
  const pass  = document.getElementById('loginPassword').value;
  const err   = document.getElementById('loginError');

  const user = getUsers().find(u => u.email === email && u.password === pass);
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

// ─── Worker Reg — Step 2 ───────────────────────────────────
document.getElementById('workerStep2Form').addEventListener('submit', function(e) {
  e.preventDefault();
  workerRegData.trade    = document.getElementById('regTrade').value;
  workerRegData.grade    = document.getElementById('regGrade').value;
  workerRegData.yearsExp = document.getElementById('regYearsExp').value;
  workerRegData.location = document.getElementById('regLocation').value.trim();
  workerRegData.minRate  = document.getElementById('regMinRate').value;
  workerRegData.travelRadiusMiles = Number(document.getElementById('regTravelRadius').value) || 15;
  workerRegData.travelFurtherWithAccommodation =
    document.querySelector('input[name="regTravelFurther"]:checked')?.value === 'yes';
  workerRegData.weekendPreferences = {
    saturday: document.getElementById('regWeekendSaturday')?.value === 'yes',
    sunday: document.getElementById('regWeekendSunday')?.value === 'yes',
    weekendOnly: document.getElementById('regWeekendOnly')?.value === 'yes',
  };
  setWorkerStep(3);
});

// ─── Worker Reg — Step 3 ───────────────────────────────────
document.getElementById('workerStep3Form').addEventListener('submit', function(e) {
  e.preventDefault();
  const utr = document.getElementById('regUTR').value.replace(/\D/g, '');
  const err = document.getElementById('step3Error');

  if (!/^\d{10}$/.test(utr)) {
    err.textContent = 'UTR number must be exactly 10 digits.';
    err.style.display = 'block';
    return;
  }
  err.style.display = 'none';

  const certs = Array.from(document.querySelectorAll('#certCheckboxes input[type="checkbox"]:checked'))
    .map(function(c) {
      const lbl    = c.closest('.cert-checkbox');
      const expiry = lbl ? (lbl.querySelector('.cert-expiry-input')?.value || null) : null;
      return { name: c.value, expiry: expiry || null };
    });

  const user = {
    id: 'user-' + Date.now() + '-' + Math.random().toString(16).slice(2),
    type: 'worker',
    name:     workerRegData.name,
    email:    workerRegData.email,
    phone:    workerRegData.phone,
    password: workerRegData.password,
    trade:    workerRegData.trade,
    grade:    workerRegData.grade,
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
    utr,
    cisStatus:        document.getElementById('regCisStatus').value,
    nationalInsuranceNumber: document.getElementById('regNationalInsurance').value.trim(),
    dateOfBirth:      document.getElementById('regDOB').value,
    cscsCard:         document.getElementById('regCscsCard').value.trim(),
    rightToWork:      document.getElementById('regRightToWork').value,
    photoId:          document.getElementById('regPhotoId').value,
    drivingLicenceHolder: document.getElementById('regDrivingLicenceHolder').value === 'yes',
    certifications:   certs,
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
    'Step <strong>' + step + '</strong> of 3 — ' + ['Basic Details', 'Trade Information', 'Compliance'][step - 1];
  authOverlay.scrollTop = 0;
}

function showWorkerSuccess(user, dupeResult) {
  const completion = calcCompletion(user);
  document.getElementById('workerSuccessName').textContent = user.name.split(' ')[0];
  document.getElementById('workerCompletionPct').textContent = completion + '%';
  document.getElementById('workerCompletionBar').style.width = completion + '%';
  renderCompletionChecklist(user);
  const note = document.getElementById('returningWorkerNote');
  if (note) {
    if (dupeResult && dupeResult.isDuplicate) {
      note.style.display = 'block';
      note.innerHTML =
        '<strong>Welcome back.</strong> We matched this sign-up to an existing worker profile, ' +
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
  let score = 0;
  if (user.name && user.email && user.phone)          score += 20;
  if (user.trade && user.grade)                        score += 20;
  if (user.utr)                                        score += 15;
  if (user.rightToWork)                               score += 15;
  if (user.certifications && user.certifications.length > 0) score += 20;
  return score;
}

function renderCompletionChecklist(user) {
  const items = [
    { label: 'Basic Information',  done: !!(user.name && user.email && user.phone) },
    { label: 'Trade Information',  done: !!(user.trade && user.grade)               },
    { label: 'Profile Photo',      done: false                                       },
    { label: 'UTR Number',         done: !!user.utr                                  },
    { label: 'Right to Work',      done: !!user.rightToWork                          },
    { label: 'Qualifications',     done: !!(user.certifications && user.certifications.length) },
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

// ─── Trade → Grade dynamic update ─────────────────────────
document.getElementById('regTrade').addEventListener('change', function() {
  populateGrades(this.value);
});

function populateGrades(trade) {
  const grades = TRADE_GRADES[trade] || TRADE_GRADES['Other'];
  const sel = document.getElementById('regGrade');
  sel.innerHTML = grades.map(function(g) {
    return '<option value="' + g + '">' + g + '</option>';
  }).join('');
}

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

document.getElementById('companySuccessContinueBtn').addEventListener('click', function() {
  hideAuthOverlay();
  updateTopbarUser(getCurrentUser());
});

// ─── Logout ────────────────────────────────────────────────
document.getElementById('logoutBtn').addEventListener('click', function() {
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
});

// ─── Init ──────────────────────────────────────────────────
(function init() {
  // Populate cert checkboxes
  const certContainer = document.getElementById('certCheckboxes');
  certContainer.innerHTML = CERT_OPTIONS.map(function(c) {
    return '<label class="cert-checkbox">' +
      '<input type="checkbox" value="' + c + '" />' +
      '<span class="cert-name">' + c + '</span>' +
      '<input type="date" class="cert-expiry-input" title="Expiry date (optional)" />' +
      '</label>';
  }).join('');

  // Populate initial grades
  populateGrades(document.getElementById('regTrade').value);

  document.getElementById('useCurrentLocationBtn')?.addEventListener('click', async function() {
    const btn = this;
    const input = document.getElementById('regLocation');
    if (!input || typeof getGPS !== 'function') return;
    const prev = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Locating…';
    try {
      const gps = await getGPS();
      input.value = gps.lat.toFixed(5) + ', ' + gps.lng.toFixed(5);
    } catch (_) {
      input.placeholder = 'Location unavailable — enter town or postcode';
    } finally {
      btn.disabled = false;
      btn.textContent = prev;
    }
  });

  // Check existing session
  const user = getCurrentUser();
  if (user) {
    hideAuthOverlay();
    updateTopbarUser(user);
  } else {
    showAuthOverlay();
    showScreen('welcome');
  }
})();
