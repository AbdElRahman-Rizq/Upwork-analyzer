const button = document.getElementById('analyzeBtn');
const statusEl = document.getElementById('status');

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.style.color = isError ? '#c62828' : '#0f9d58';
}

async function sendJobsToBackend(jobs) {
  const response = await fetch('http://localhost:3001/jobs/process', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(jobs),
  });

  if (!response.ok) {
    throw new Error(`Backend responded with ${response.status}`);
  }

  return response.json();
}

async function handleAnalyzeClick() {
  button.disabled = true;
  setStatus('Collecting jobs...');

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      throw new Error('No active Upwork tab found.');
    }

    const scrapeResult = await chrome.tabs.sendMessage(tab.id, { type: 'SCRAPE_JOBS' });

    if (!scrapeResult?.success) {
      throw new Error(scrapeResult?.error || 'Failed to scrape jobs');
    }

    if (!scrapeResult.jobs?.length) {
      throw new Error('No jobs were found on this page.');
    }

    setStatus('Sending to analyzer...');
    const backendResponse = await sendJobsToBackend(scrapeResult.jobs);
    setStatus(`Done! Processed ${backendResponse.detail?.length ?? 0} jobs.`);
  } catch (error) {
    setStatus(error.message || 'Unexpected error', true);
  } finally {
    button.disabled = false;
  }
}

button.addEventListener('click', handleAnalyzeClick);
