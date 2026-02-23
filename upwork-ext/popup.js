const button = document.getElementById('analyzeBtn');
const statusEl = document.getElementById('status');
const progressBar = document.getElementById('progressBar');

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.style.color = isError ? '#c62828' : '#0f9d58';
}

function setProgress(percent) {
  const clamped = Math.min(100, Math.max(0, percent));
  progressBar.style.width = `${clamped}%`;
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
  setProgress(0);

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

    const total = scrapeResult.jobs.length;
    const aggregatedResults = [];

    for (let i = 0; i < total; i++) {
      const job = scrapeResult.jobs[i];
      setStatus(`Analyzing job ${i + 1}/${total}...`);

      const backendResponse = await sendJobsToBackend([job]);
      const processed = backendResponse?.detail ?? [];
      aggregatedResults.push(...processed);

      const progress = Math.round(((i + 1) / total) * 100);
      setProgress(progress);
    }

    setStatus(`Done! Processed ${aggregatedResults.length} job${aggregatedResults.length === 1 ? '' : 's'}.`);
  } catch (error) {
    setStatus(error.message || 'Unexpected error', true);
  } finally {
    button.disabled = false;
  }
}

button.addEventListener('click', handleAnalyzeClick);
