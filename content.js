(function() {
  // Removed AWS imports and S3/DynamoDB functions

  let clsValue = 0;
  let lcpValue = 0;

  const performanceData = {
    fcp: null,
    lcp: null,
    fid: null,
    cls: null,
    maxFid: null,
    pageLoadTime: null,
    tti: null,
    ttfb: null,
    ttlb: null,
    dnsLookupTime: null,
    totalPageSize: 0,
    numHttpsRequests: 0,
    si: null
  };

  const updateMetrics = () => {
    chrome.runtime.sendMessage({
      type: 'performanceData',
      data: performanceData
    });
  };

  const calculateSpeedIndex = () => {
    // using the performance api below, everything documented on their website
    const paintEntries = performance.getEntriesByType('paint');
    const navigationEntries = performance.getEntriesByType('navigation');

    if (paintEntries.length > 0 && navigationEntries.length > 0) {
      const firstPaint = paintEntries.find(entry => entry.name === 'first-paint');
      const firstContentfulPaint = paintEntries.find(entry => entry.name === 'first-contentful-paint');

      if (firstPaint && firstContentfulPaint) {
        const start = navigationEntries[0].startTime;
        const fcpTime = firstContentfulPaint.startTime;
        const lcpTime = lcpValue;

        // Easy Speed Index calculation (actually a little more complicated)
        performanceData.si = Number(((fcpTime + lcpTime) / 2 - start).toFixed(1));
      }
    }
  };

  // Now update everything below

  if ('PerformanceObserver' in window) {
    new PerformanceObserver((entryList) => {
      for (const entry of entryList.getEntries()) {
        if (entry.entryType === 'paint' && entry.name === 'first-contentful-paint') {
          performanceData.fcp = Number(entry.startTime.toFixed(1));
          updateMetrics();
        }
      }
    }).observe({ type: 'paint', buffered: true });

    new PerformanceObserver((entryList) => {
      for (const entry of entryList.getEntries()) {
        if (entry.entryType === 'first-input') {
          const fidValue = Number((entry.processingStart - entry.startTime).toFixed(1));
          performanceData.fid = fidValue;
          performanceData.maxFid = Math.max(performanceData.maxFid || 0, fidValue);
          updateMetrics();
        }
      }
    }).observe({ type: 'first-input', buffered: true });

    new PerformanceObserver((entryList) => {
      for (const entry of entryList.getEntries()) {
        if (entry.entryType === 'layout-shift' && !entry.hadRecentInput) {
          clsValue += entry.value;
          performanceData.cls = Number(clsValue.toFixed(3));
          updateMetrics();
        }
      }
    }).observe({ type: 'layout-shift', buffered: true });

    new PerformanceObserver((entryList) => {
      for (const entry of entryList.getEntries()) {
        if (entry.entryType === 'longtask' && entry.name === 'self') {
          performanceData.tti = Number(entry.startTime.toFixed(1));
          updateMetrics();
        }
      }
    }).observe({ type: 'longtask', buffered: true });
  }

  const loadPerformanceData = () => {
    // really simple calculations
    const navigationTiming = performance.getEntriesByType('navigation')[0];
    const resourceTiming = performance.getEntriesByType('resource');

    if (navigationTiming) {
      performanceData.ttfb = Number((navigationTiming.responseStart - navigationTiming.requestStart).toFixed(1));
      performanceData.ttlb = Number((navigationTiming.responseEnd - navigationTiming.requestStart).toFixed(1));
      performanceData.dnsLookupTime = Number((navigationTiming.domainLookupEnd - navigationTiming.domainLookupStart).toFixed(1));
    }

    performanceData.totalPageSize = 0;
    performanceData.numHttpsRequests = 0;
    resourceTiming.forEach(resource => {
      performanceData.totalPageSize += resource.transferSize;
      if (resource.name.startsWith('https://')) {
        performanceData.numHttpsRequests++;
      }
    });

    updateMetrics();
  };

  const ensurePerformanceEntriesAvailable = () => {
    if (performance.getEntries().length > 0) {
      loadPerformanceData();
    } else {
      setTimeout(ensurePerformanceEntriesAvailable, 500);
    }
  };

  const calculatePageLoadTime = () => {
    // load time sometimes doesn't work using performance api so you have to do it like this
    const pageEnd = performance.now();
    const loadTime = pageEnd / 1000;

    performanceData.pageLoadTime = Number(loadTime.toFixed(1));
    updateMetrics();

    const $perf = document.querySelector('.js-perf');
    if ($perf) {
      $perf.innerHTML += `Page loaded in ${loadTime}s.`;
    }
  };

  window.addEventListener('load', () => {
    calculatePageLoadTime();
    ensurePerformanceEntriesAvailable();
  });

  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'updateSettings') {
      loadPerformanceData();
    }
  });
})();
