const API_URL = 'http://localhost:4000/api';

document.addEventListener('DOMContentLoaded', async () => {
  const app = document.getElementById('app');
  
  // Check authentication status
  const authResponse = await chrome.runtime.sendMessage({ action: 'getAuth' });
  
  if (!authResponse.isLoggedIn) {
    renderLoginForm();
  } else {
    renderDashboard(authResponse.user);
  }
  
  // Footer links
  document.getElementById('openDashboard').addEventListener('click', (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: 'http://localhost:3000/dashboard/jobs' });
  });
  
  document.getElementById('refreshCV').addEventListener('click', async (e) => {
    e.preventDefault();
    const btn = e.target;
    btn.textContent = 'Refreshing...';
    await chrome.runtime.sendMessage({ action: 'refreshCV' });
    btn.textContent = 'Refresh CV';
    location.reload();
  });
});

function renderLoginForm() {
  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="auth-section active">
      <div class="form-group">
        <label>Email</label>
        <input type="email" id="email" placeholder="your@email.com">
      </div>
      <div class="form-group">
        <label>Password</label>
        <input type="password" id="password" placeholder="••••••••">
      </div>
      <div id="loginError" class="error" style="display: none;"></div>
      <button class="btn btn-primary" id="loginBtn">Sign In</button>
    </div>
  `;
  
  document.getElementById('loginBtn').addEventListener('click', handleLogin);
  document.getElementById('password').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleLogin();
  });
}

async function handleLogin() {
  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;
  const errorEl = document.getElementById('loginError');
  const btn = document.getElementById('loginBtn');
  
  if (!email || !password) {
    errorEl.textContent = 'Please enter email and password';
    errorEl.style.display = 'block';
    return;
  }
  
  btn.disabled = true;
  btn.textContent = 'Signing in...';
  
  try {
    const response = await chrome.runtime.sendMessage({ action: 'login', email, password });
    
    if (response.success) {
      renderDashboard(response.user);
    } else {
      errorEl.textContent = response.error || 'Login failed';
      errorEl.style.display = 'block';
      btn.disabled = false;
      btn.textContent = 'Sign In';
    }
  } catch (error) {
    errorEl.textContent = 'Network error. Is the backend running?';
    errorEl.style.display = 'block';
    btn.disabled = false;
    btn.textContent = 'Sign In';
  }
}

function renderDashboard(user) {
  const app = document.getElementById('app');
  const initial = user?.email?.[0]?.toUpperCase() || 'U';
  
  app.innerHTML = `
    <div class="user-info">
      <div class="user-avatar">${initial}</div>
      <div class="user-details">
        <h3>${user?.email || 'User'}</h3>
        <p>Logged in</p>
      </div>
      <button class="btn btn-secondary" style="margin-left: auto; padding: 8px 12px; width: auto;" id="logoutBtn">Logout</button>
    </div>
    
    <div id="statusBar" class="status-bar">
      <div class="status-dot"></div>
      <span>Checking CV data...</span>
    </div>
    
    <div id="cvPreview" class="cv-preview">
      <h4>CV Data</h4>
      <div class="loading"><div class="spinner" style="width: 20px; height: 20px; border-width: 2px;"></div></div>
    </div>
    
    <button class="btn btn-primary fill-btn" id="fillBtn" disabled>
      🔄 Fill Form on Page
    </button>
    
    <div id="fillResult" style="display: none;"></div>
  `;
  
  document.getElementById('logoutBtn').addEventListener('click', async () => {
    await chrome.runtime.sendMessage({ action: 'logout' });
    renderLoginForm();
  });
  
  // Load CV data
  loadCVData();
  
  // Fill button handler
  document.getElementById('fillBtn').addEventListener('click', handleFillForm);
}

async function loadCVData() {
  const statusBar = document.getElementById('statusBar');
  const cvPreview = document.getElementById('cvPreview');
  const fillBtn = document.getElementById('fillBtn');
  
  try {
    const response = await chrome.runtime.sendMessage({ action: 'getCVData' });
    
    if (response.success && response.data) {
      const data = response.data;
      
      statusBar.innerHTML = `<div class="status-dot" style="background: #16a34a;"></div><span>Ready to fill</span>`;
      statusBar.style.background = '#dcfce7';
      statusBar.style.color = '#166534';
      
      fillBtn.disabled = false;
      
      const fields = [
        { icon: '👤', label: 'Name', value: data.name },
        { icon: '✉️', label: 'Email', value: data.email },
        { icon: '📞', label: 'Phone', value: data.phone },
        { icon: '📍', label: 'Location', value: data.location },
        { icon: '💼', label: 'Experience', value: data.experience?.length ? `${data.experience.length} positions` : null },
        { icon: '🎓', label: 'Education', value: data.education?.length ? `${data.education.length} degrees` : null },
        { icon: '⚡', label: 'Skills', value: data.skills?.length ? `${data.skills.length} skills` : null }
      ].filter(f => f.value);
      
      cvPreview.innerHTML = `
        <h4>CV Data</h4>
        ${fields.map(f => `
          <div class="cv-field">
            <div class="cv-field-icon">${f.icon}</div>
            <div class="cv-field-content">
              <div class="cv-field-label">${f.label}</div>
              <div class="cv-field-value">${f.value}</div>
            </div>
          </div>
        `).join('')}
      `;
      
    } else {
      statusBar.innerHTML = `<div class="status-dot" style="background: #dc2626;"></div><span>${response.error || 'No CV found'}</span>`;
      statusBar.style.background = '#fef2f2';
      statusBar.style.color = '#991b1b';
      
      cvPreview.innerHTML = `
        <h4>CV Data</h4>
        <p style="color: #6b7280; font-size: 13px;">No CV uploaded yet. Please upload a CV in the dashboard first.</p>
      `;
      
      fillBtn.disabled = true;
    }
  } catch (error) {
    statusBar.innerHTML = `<div class="status-dot" style="background: #dc2626;"></div><span>Error loading CV</span>`;
    statusBar.style.background = '#fef2f2';
    statusBar.style.color = '#991b1b';
    
    fillBtn.disabled = true;
  }
}

async function handleFillForm() {
  const fillBtn = document.getElementById('fillBtn');
  const fillResult = document.getElementById('fillResult');
  
  fillBtn.disabled = true;
  fillBtn.textContent = '⏳ Filling...';
  
  try {
    // Check if site is blocked
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (tab?.url) {
      const siteCheck = await chrome.runtime.sendMessage({ action: 'checkSite', url: tab.url });
      
      if (siteCheck.blocked) {
        fillResult.style.display = 'block';
        fillResult.innerHTML = `
          <div class="site-warning">
            <p>⚠️ Automation is blocked on this site<br><small>${siteCheck.reason}</small></p>
          </div>
        `;
        fillBtn.disabled = false;
        fillBtn.textContent = '🔄 Fill Form on Page';
        return;
      }
    }
    
    // Get CV data and fill form
    const cvResponse = await chrome.runtime.sendMessage({ action: 'getCVData' });
    
    if (!cvResponse.success) {
      throw new Error(cvResponse.error);
    }
    
    const result = await chrome.runtime.sendMessage({
      action: 'fillForm',
      data: cvResponse.data
    });
    
    if (result.success) {
      fillResult.style.display = 'block';
      fillResult.innerHTML = `
        <div class="success-icon">✓</div>
        <div class="stats">
          <div class="stat-card">
            <div class="stat-value">${result.filled}</div>
            <div class="stat-label">Fields Filled</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">${result.skipped}</div>
            <div class="stat-label">Skipped</div>
          </div>
        </div>
        <p style="text-align: center; font-size: 12px; color: #6b7280;">
          Please review all fields before submitting!
        </p>
      `;
    } else {
      throw new Error(result.error);
    }
  } catch (error) {
    fillResult.style.display = 'block';
    fillResult.innerHTML = `
      <div class="site-warning">
        <p>❌ ${error.message || 'Failed to fill form'}</p>
      </div>
    `;
  }
  
  fillBtn.disabled = false;
  fillBtn.textContent = '🔄 Fill Form on Page';
}