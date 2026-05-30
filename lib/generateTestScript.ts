/**
 * Generates a browser-console test script that intercepts dataLayer.push
 * and validates the expected event fires with the correct fields.
 *
 * Dynamic params (value === "dynamic") are checked for presence only.
 * Constant params are compared by value.
 *
 * Designed to work alongside the DataSlayer Chrome extension, which shows
 * all dataLayer events in a dedicated DevTools panel.
 */

export interface TestParam {
  name:  string
  value: string   // "dynamic" or a constant
  type:  string   // "string" | "int" | "float" | "boolean"
}

export interface TestScriptOptions {
  eventName:   string
  fullName:    string   // e.g. "custom.ecommerce.purchase" or bare name
  trigger:     string
  url:         string
  params:      TestParam[]
}

/**
 * Generates a compact `javascript:` bookmarklet URL.
 * User saves it as a browser bookmark, then clicks it on the target page
 * to arm the dataLayer monitor without needing to open DevTools first.
 */
export function generateBookmarklet(opts: TestScriptOptions): string {
  const { fullName, params } = opts

  const checks = params.map((p) => {
    const isDynamic = !p.value || p.value === 'dynamic'
    const key = JSON.stringify(p.name)  // safely quoted
    if (isDynamic) {
      return (
        `if(o[${key}]===undefined||o[${key}]===null||o[${key}]===''){` +
        `console.warn('%c✗ ${p.name}: missing/empty','color:#dc2626;font-weight:bold');ok=false;}` +
        `else{console.log('%c✓ ${p.name}','color:#16a34a;font-weight:bold','→',o[${key}]);}`
      )
    }
    const jsVal =
      p.type === 'boolean' || p.type === 'int' || p.type === 'float'
        ? p.value
        : JSON.stringify(p.value)
    return (
      `if(String(o[${key}])===String(${jsVal})){console.log('%c✓ ${p.name}','color:#16a34a;font-weight:bold','→',o[${key}]);}` +
      `else{console.warn('%c✗ ${p.name}','color:#dc2626;font-weight:bold','→ expected',${jsVal},'got',o[${key}]);ok=false;}`
    )
  }).join('')

  const evtJson = JSON.stringify(fullName)
  const script =
    `(function(){` +
    `window.dataLayer=window.dataLayer||[];` +
    `var _p=window.dataLayer.push.bind(window.dataLayer);` +
    `window.dataLayer.push=function(o){` +
      `_p(o);` +
      `if(!o||o.event!==${evtJson})return;` +
      `var ok=true;` +
      `${checks}` +
      `console.log(ok?` +
        `'%c✓ ALL PASSED - ${fullName}':'%c✗ CHECKS FAILED - ${fullName}',` +
        `ok?'color:#16a34a;font-size:13px;font-weight:bold':'color:#dc2626;font-size:13px;font-weight:bold'` +
      `);` +
      `window.dataLayer.push=_p;` +
    `};` +
    `console.log('%cMonitor armed → waiting for: ${fullName}',` +
      `'background:#2563eb;color:#fff;padding:2px 8px;border-radius:4px'` +
    `);` +
    `})()`

  return `javascript:${encodeURIComponent(script)}`
}

export function generateTestScript(opts: TestScriptOptions): string {
  const { eventName, fullName, trigger, url, params } = opts

  // Build the expected object entries for the script
  const entries = params.map((p) => {
    const isDynamic = !p.value || p.value === 'dynamic'
    if (isDynamic) {
      return `    ${p.name}: '<dynamic>',   // any value accepted`
    }
    // Constant — embed the actual expected value
    const jsVal =
      p.type === 'boolean' ? p.value :
      p.type === 'int'     ? p.value :
      p.type === 'float'   ? p.value :
      JSON.stringify(p.value)
    return `    ${p.name}: ${jsVal},`
  })

  const expectedBlock = entries.length > 0
    ? `\n${entries.join('\n')}\n  `
    : ''

  const triggerComment = trigger
    ? `\n * Then trigger: ${trigger}`
    : ''

  return `/**
 * DataLayer test: ${fullName}
 * URL to test:    ${url || '(no URL set — open the target page first)'}${triggerComment}
 *
 * HOW TO USE:
 * 1. Open Chrome DevTools → DataSlayer tab (install from Chrome Web Store if needed)
 * 2. Navigate to the URL above
 * 3. Paste this entire script into the Console tab and press Enter
 * 4. Perform the action that triggers: ${trigger || eventName}
 * 5. Check both the Console output below AND the DataSlayer panel
 */
(function () {
  'use strict';

  var EXPECTED_EVENT = '${fullName}';
  var EXPECTED = {
    event: EXPECTED_EVENT,${expectedBlock}};

  // ── Intercept dataLayer.push ──────────────────────────────────────────────
  window.dataLayer = window.dataLayer || [];
  var _push = window.dataLayer.push.bind(window.dataLayer);

  window.dataLayer.push = function (obj) {
    _push(obj);

    if (!obj || obj.event !== EXPECTED_EVENT) return;

    // ── Check fields ──────────────────────────────────────────────────────
    console.group(
      '%c dataLayer: ' + obj.event,
      'background:#2563eb;color:#fff;padding:2px 8px;border-radius:4px;font-weight:bold'
    );

    var allPassed = true;

    Object.keys(EXPECTED).forEach(function (key) {
      var expected = EXPECTED[key];
      var actual   = obj[key];

      if (expected === '<dynamic>') {
        if (actual !== undefined && actual !== null && actual !== '') {
          console.log('%c ✓ ' + key, 'color:#16a34a;font-weight:bold', '→', actual);
        } else {
          console.warn('%c ✗ ' + key, 'color:#dc2626;font-weight:bold',
            '→ missing or empty (expected a dynamic value)');
          allPassed = false;
        }
      } else {
        // Loose comparison to handle string "true" vs boolean true
        if (String(actual) === String(expected)) {
          console.log('%c ✓ ' + key, 'color:#16a34a;font-weight:bold', '→', actual);
        } else {
          console.warn('%c ✗ ' + key, 'color:#dc2626;font-weight:bold',
            '→ expected', expected, 'but got', actual);
          allPassed = false;
        }
      }
    });

    // Check for unexpected ecommerce: null reset
    if (window.dataLayer.length >= 2) {
      var prev = window.dataLayer[window.dataLayer.length - 2];
      if (prev && prev.ecommerce === null) {
        console.log('%c ✓ ecommerce: null reset detected (correct GA4 pattern)',
          'color:#16a34a');
      }
    }

    console.log('');
    if (allPassed) {
      console.log('%c ✓ All checks passed!',
        'color:#16a34a;font-size:14px;font-weight:bold');
    } else {
      console.warn('%c ✗ Some checks failed — see above',
        'color:#dc2626;font-size:14px;font-weight:bold');
    }
    console.log('Full push object:', JSON.stringify(obj, null, 2));
    console.groupEnd();

    // Restore original push after first match
    window.dataLayer.push = _push;
    console.log('%c Monitor disarmed (intercepted one push)',
      'color:#6b7280;font-style:italic');
  };

  console.log(
    '%c DataLayer monitor armed',
    'background:#2563eb;color:#fff;padding:2px 8px;border-radius:4px'
  );
  console.log('Waiting for event: %c' + EXPECTED_EVENT, 'font-weight:bold;color:#2563eb');
  ${trigger ? `console.log('Trigger: ${trigger.replace(/`/g, "'").replace(/\n/g, ' ')}');` : ''}
  console.log('Check DataSlayer panel for the full push once it fires.');
})();
`
}
