/* GamFix - Report details embedded location map.
 * Self-contained, no build step. Loaded (defer) on every dashboard page.
 * Replaces the external "Open location in OpenStreetMap" link inside the
 * Report details dialog with an embedded Leaflet map pinned to the report
 * coordinates. React owns the dialog DOM, so this re-applies itself via a
 * MutationObserver whenever the dialog is (re-)rendered. */
(function () {
  'use strict';

  var tracked = []; // { wrap: Element, map: L.Map }

  function buildMap(anchor) {
    var href = anchor.getAttribute('href') || '';
    var mLat = href.match(/[?&]mlat=(-?\d+(?:\.\d+)?)/);
    var mLng = href.match(/[?&]mlon=(-?\d+(?:\.\d+)?)/);
    if (!mLat || !mLng || typeof window.L === 'undefined') return null;
    var lat = parseFloat(mLat[1]);
    var lng = parseFloat(mLng[1]);

    var wrap = document.createElement('div');
    wrap.className = 'rdm-map-wrap';
    var el = document.createElement('div');
    el.className = 'rdm-map';
    el.setAttribute('aria-label', 'Map of reported location');
    wrap.appendChild(el);

    anchor.parentNode.insertBefore(wrap, anchor);
    anchor.parentNode.removeChild(anchor);

    var map = L.map(el, {
      scrollWheelZoom: false,
      zoomControl: true,
      attributionControl: true
    });
    map.setView([lat, lng], 16);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors'
    }).addTo(map);
    var marker = L.circleMarker([lat, lng], {
      radius: 9,
      color: '#ffffff',
      weight: 3,
      fillColor: '#16a34a',
      fillOpacity: 1
    }).addTo(map);
    marker.bindTooltip('Reported location', { direction: 'top', offset: [0, -8] });
    setTimeout(function () { map.invalidateSize(); }, 60);
    return map;
  }

  function scan() {
    // drop maps whose host node left the DOM (dialog closed / React re-render)
    tracked = tracked.filter(function (t) {
      if (!t.wrap.isConnected) {
        try { t.map.remove(); } catch (e) { /* noop */ }
        return false;
      }
      return true;
    });
    var anchors = document.querySelectorAll(
      'div[role="dialog"] a[href*="openstreetmap.org/?mlat="]'
    );
    for (var i = 0; i < anchors.length; i++) {
      var a = anchors[i];
      if (a.dataset.rdmDone === '1') continue;
      a.dataset.rdmDone = '1';
      var map = buildMap(a);
      var wrap = a.parentNode && a.parentNode.querySelector(':scope > .rdm-map-wrap');
      if (map && wrap) tracked.push({ wrap: wrap, map: map });
    }
  }

  var pending = null;
  function schedule() {
    if (pending) return;
    pending = setTimeout(function () {
      pending = null;
      try { scan(); } catch (e) { /* never break the app */ }
    }, 120);
  }

  function start() {
    var mo = new MutationObserver(schedule);
    mo.observe(document.body, { childList: true, subtree: true });
    schedule();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
