const API_URL = 'http://localhost:4000/api';
const STORAGE_KEY = 'jobflow_auth';
const CV_DATA_KEY = 'jobflow_cv_data';

// Blocked sites - never auto-fill or submit
const BLOCKED_SITES = [
  'linkedin.com',
  'indeed.com',
  'glassdoor.com',
  'ziprecruiter.com',
  'monster.com',
  'simplyhired.com'
];

function isBlockedSite(url) {
  try {
    const hostname = new URL(url).hostname;
    return BLOCKED_SITES.some(site => hostname.includes(site));
  } catch {
    return false;
  }
}

async function getAuthToken() {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  const auth = result[STORAGE_KEY];
  return auth?.token || null;
}

async function getCVData() {
  const token = await getAuthToken();
  if (!token) {
    return { error: 'Not logged in' };
  }

  try {
    const response = await fetch(`${API_URL}/cv/fill-data`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!response.ok) {
      if (response.status === 401) {
        await clearAuth();
        return { error: 'Session expired. Please log in again.' };
      }
      throw new Error('Failed to fetch CV data');
    }

    const data = await response.json();
    
    // Cache CV data locally
    await chrome.storage.local.set({ [CV_DATA_KEY]: data.fillData });
    
    return data;
  } catch (error) {
    console.error('Failed to get CV data:', error);
    return { error: 'Failed to load CV data' };
  }
}

async function clearAuth() {
  await chrome.storage.local.remove(STORAGE_KEY);
  await chrome.storage.local.remove(CV_DATA_KEY);
}

async function setAuth(token, user) {
  await chrome.storage.local.set({
    [STORAGE_KEY]: { token, user }
  });
}

// Message handler for popup and content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    switch (message.action) {
      case 'login': {
        const { email, password } = message;
        try {
          const response = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
          });
          
          const data = await response.json();
          
          if (!response.ok) {
            sendResponse({ success: false, error: data.error || 'Login failed' });
            return;
          }
          
          await setAuth(data.token, data.user);
          
          // Also fetch and cache CV data
          await getCVData();
          
          sendResponse({ success: true, user: data.user });
        } catch (error) {
          sendResponse({ success: false, error: 'Network error' });
        }
        break;
      }

      case 'logout': {
        await clearAuth();
        sendResponse({ success: true });
        break;
      }

      case 'getAuth': {
        const result = await chrome.storage.local.get(STORAGE_KEY);
        const auth = result[STORAGE_KEY];
        sendResponse({ 
          isLoggedIn: !!(auth?.token),
          user: auth?.user 
        });
        break;
      }

      case 'getCVData': {
        // Check cache first
        const cached = await chrome.storage.local.get(CV_DATA_KEY);
        if (cached[CV_DATA_KEY]) {
          sendResponse({ success: true, data: cached[CV_DATA_KEY] });
          return;
        }
        
        const result = await getCVData();
        if (result.error) {
          sendResponse({ success: false, error: result.error });
        } else {
          sendResponse({ success: true, data: result.fillData });
        }
        break;
      }

      case 'refreshCV': {
        const result = await getCVData();
        sendResponse(result);
        break;
      }

      case 'checkSite': {
        const url = message.url;
        sendResponse({ 
          blocked: isBlockedSite(url),
          reason: isBlockedSite(url) ? 'Automation not allowed on this site' : null
        });
        break;
      }

      case 'fillForm': {
        // Send to content script to fill the form
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab?.id) {
          chrome.tabs.sendMessage(tab.id, {
            action: 'fillForm',
            data: message.data
          });
          sendResponse({ success: true });
        } else {
          sendResponse({ success: false, error: 'No active tab' });
        }
        break;
      }

      default:
        sendResponse({ error: 'Unknown action' });
    }
  })();
  
  return true; // Keep message channel open for async response
});

// Listen for tab updates to inject content script if needed
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    // Content script will auto-run on matching hosts
  }
});