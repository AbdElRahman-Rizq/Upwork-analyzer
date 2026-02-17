(function () {
  function extractText(element) {
    return element?.textContent?.trim() ?? '';
  }

  function findFirst(element, selectors) {
    for (const selector of selectors) {
      const found = element.querySelector(selector);
      if (found) {
        return found;
      }
    }
    return null;
  }

  function scrapeJobs() {
    const cardSelectors = [
      'article:has(a[data-test*="job-tile-title-link"])',
      'article[data-test~="job-tile"]',
      'section[data-test~="job-tile"] article',
      'section[data-test~="jobsList"] article',
      'div[data-test*="JobTile"]',
      'li[data-test~="job-tile-list-item"]',
      '.job-tile',
      '[data-ev-job-uid]',
    ];

    let cards = [];
    for (const selector of cardSelectors) {
      cards = Array.from(document.querySelectorAll(selector));
      if (cards.length) break;
    }

    if (!cards.length) {
      const links = Array.from(document.querySelectorAll('a[data-test*="job-tile-title-link"]'));
      cards = links
        .map((link) => link.closest('article') || link.parentElement?.closest('article') || link.parentElement)
        .filter((card) => Boolean(card));
    }

    if (!cards.length) {
      return [];
    }

    const titleSelectors = [
      '[data-test*="job-tile-title-link"]',
      '[data-test*="job-title"]',
      'a[data-test*="job-card-title"]',
      'h2.job-tile-title a',
      'h3.job-tile-title a',
      'h2 a',
      'h3 a',
    ];

    const descSelectors = [
      '[data-test="job-description-text"]',
      '[data-test="job-description"]',
      '[data-test*="job-snippet"]',
      '.job-tile-description',
      '.line-clamp-2',
      'p',
    ];

    return cards
      .map((card) => {
        const titleEl = findFirst(card, titleSelectors);
        const descEl = findFirst(card, descSelectors);
        const linkEl = titleEl?.closest('a') || card.querySelector('a[href*="/jobs/"]');

        const title = extractText(titleEl);
        const description = extractText(descEl);
        const link = linkEl?.href || window.location.href;

        if (!title && !description) {
          return null;
        }

        return {
          title: title || 'Untitled Job',
          description,
          link,
        };
      })
      .filter((job) => Boolean(job));
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === 'SCRAPE_JOBS') {
      try {
        const jobs = scrapeJobs();
        sendResponse({ success: true, jobs });
      } catch (error) {
        sendResponse({ success: false, error: error?.message ?? 'Unknown error' });
      }
      return true;
    }
    return undefined;
  });
})();
