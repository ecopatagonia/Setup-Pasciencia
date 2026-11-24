const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = __dirname;
const siteRoot = path.resolve(root, '..');
const siteHtml = fs.readFileSync(path.join(siteRoot, 'index.html'), 'utf8');
const appJs = fs.readFileSync(path.join(siteRoot, 'app.js'), 'utf8');
const moduleHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

test('menu is directly below SL Limit and has its own icon', () => {
  const stopIndex = siteHtml.indexOf('data-page="stopCut"');
  const monteCarloIndex = siteHtml.indexOf('data-page="monteCarlo"');
  const pausesIndex = siteHtml.indexOf('id="pausesNav"');

  assert.ok(stopIndex >= 0);
  assert.ok(monteCarloIndex > stopIndex);
  assert.ok(pausesIndex > monteCarloIndex);

  const menuBlock = siteHtml.slice(monteCarloIndex, pausesIndex);
  assert.match(menuBlock, /<svg[^>]*viewBox="0 0 24 24"/);
  assert.match(menuBlock, /<span>Monte Carlo<\/span>/);
});

test('Setup GATTO starts collapsed without changing the initial results page', () => {
  assert.match(siteHtml, /<div class="nav-group" id="setupGattoNav">\s*<button class="nav-group-toggle" type="button" aria-expanded="false">/);
  assert.match(siteHtml, /class="nav-button nav-subitem active" data-page="resultados" data-dataset="gatto"/);
});

test('navigation lazily loads the retrospective calibration module', () => {
  assert.match(appJs, /PAUSE_PAGES[^\n]+['"]monteCarlo['"]/);
  assert.match(siteHtml, /id="page-monteCarlo"/);
  assert.match(siteHtml, /data-pause-src="montecarlo-calibracao\/index\.html\?v=1"/);
  assert.match(siteHtml, /title="Monte Carlo GATTO e GIO · Calibração retrospectiva"/);
});

test('embedded module is self-contained and its scripts are syntactically valid', () => {
  assert.match(moduleHtml, /id="embeddedData"/);
  assert.match(moduleHtml, /data-view="calibration"/);
  assert.match(moduleHtml, /function runCalibration\(/);
  assert.match(moduleHtml, /function applyParentData\(/);

  const scripts = [...moduleHtml.matchAll(/<script(?:[^>]*)>([\s\S]*?)<\/script>/g)].map(match => match[1]);
  assert.equal(scripts.length, 2);
  assert.doesNotThrow(() => JSON.parse(scripts[0]));
  const embedded = JSON.parse(scripts[0]);
  assert.deepEqual(embedded.gatto, []);
  assert.deepEqual(embedded.gio, []);
  assert.doesNotThrow(() => new Function(scripts[1]));

  const ids = [...moduleHtml.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(ids).size, ids.length);
});

test('module prioritizes the shared site dataset without publishing operation records', () => {
  assert.match(appJs, /window\.PuloPauseData\s*=\s*\(\)\s*=>/);
  assert.match(appJs, /frame\.contentWindow\?\.dispatchEvent\(new Event\('pulo:pause-data'\)\)/);
  assert.match(moduleHtml, /if \(loadParentData\(\)\) return;/);
  assert.match(moduleHtml, /window\.addEventListener\('pulo:pause-data',loadParentData\)/);
  assert.doesNotMatch(moduleHtml, /OP_\d{2}-\d{2}-\d{4}__[123]/);
});
