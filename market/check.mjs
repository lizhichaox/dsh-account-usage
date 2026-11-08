#!/usr/bin/env node
/**
 * Lightweight format-1 plugin market index check.
 *
 *   node market/check.mjs market/index-entry.example.json
 *
 * The authoritative validator is `@deepseek-ai/dsh-plugin-market-index`
 * (see PUBLISHING.md); this script only catches the common mistakes before
 * handing an index to it: shape, unique names, exact versions, timestamps,
 * icon size, and declared category/label ids.
 */
import fs from 'node:fs';
import path from 'node:path';

let failed = false;
const fail = (message) => {
  failed = true;
  console.error('index check: ' + message);
};

const file = process.argv[2];
if (file === undefined) {
  console.error('usage: node market/check.mjs <index.json>');
  process.exit(2);
}

let document;
try {
  document = JSON.parse(fs.readFileSync(path.resolve(file), 'utf8'));
} catch (error) {
  console.error('index check: cannot read ' + file + ': ' + error.message);
  process.exit(1);
}

const isObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);
const isText = (value) => typeof value === 'string' && value.trim() !== '';
const PACKAGE_NAME = /^(?:@[a-z0-9][a-z0-9._~-]*\/)?[a-z0-9][a-z0-9._~-]*$/u;
const SEMVER = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-(?:\d*[a-zA-Z-][0-9a-zA-Z-]*|\d+)(?:\.(?:\d*[a-zA-Z-][0-9a-zA-Z-]*|\d+))*)?(?:\+[0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*)?$/u;
const DATA_ICON = /^data:(?:image\/svg\+xml|image\/png|image\/jpeg|image\/webp);base64,([A-Za-z0-9+/]*={0,2})$/u;
const GIT_COMMIT = /^[0-9a-f]{40}$/u;

const localized = (value, where) => {
  if (typeof value === 'string') return isText(value);
  if (!isObject(value)) return fail(where + ' must be a string or a language object'), false;
  if (!Object.hasOwn(value, 'en')) return fail(where + ' must contain en'), false;
  for (const [language, text] of Object.entries(value)) {
    if (!/^[a-z]{2,8}(?:-[a-z0-9]{1,8})*$/u.test(language)) fail(where + '.' + language + ' must be a lowercase language id');
    if (!isText(text)) fail(where + '.' + language + ' must be a non-empty string');
  }
  return true;
};

if (document.format !== 1) fail('format must be 1');
localized(document.title, 'title');
if (document.description !== undefined) localized(document.description, 'description');

const categories = isObject(document.metadata) && isObject(document.metadata.categories) ? document.metadata.categories : {};
const labels = isObject(document.metadata) && isObject(document.metadata.labels) ? document.metadata.labels : {};
for (const [id, member] of Object.entries(categories)) if (!isObject(member) || !localized(member.title, 'metadata.categories.' + id + '.title')) fail('metadata.categories.' + id + ' is malformed');
for (const [id, member] of Object.entries(labels)) if (!isObject(member) || !localized(member.title, 'metadata.labels.' + id + '.title')) fail('metadata.labels.' + id + ' is malformed');

if (!Array.isArray(document.plugins) || document.plugins.length === 0) {
  fail('plugins must be a non-empty array');
} else {
  const names = new Set();
  document.plugins.forEach((plugin, index) => {
    const at = 'plugins[' + String(index) + ']';
    if (!isObject(plugin)) return fail(at + ' must be an object');
    if (!isText(plugin.name) || plugin.name.length > 214 || !PACKAGE_NAME.test(plugin.name)) fail(at + '.name must be a valid npm package name');
    if (names.has(plugin.name)) fail(at + '.name duplicates ' + plugin.name);
    names.add(plugin.name);
    if (plugin.title !== undefined) localized(plugin.title, at + '.title');
    if (plugin.description !== undefined) {
      // The market row shows this intro verbatim (user 2026-11-08): keep it within 50 characters.
      localized(plugin.description, at + '.description');
      const entries = typeof plugin.description === 'string' ? [plugin.description] : Object.values(plugin.description);
      for (const text of entries) if (text.length > 50) fail(at + '.description must stay within 50 characters, got ' + String(text.length));
    }
    if (plugin.homepage !== undefined) {
      try {
        const url = new URL(plugin.homepage);
        if (url.protocol !== 'https:' && url.protocol !== 'http:') fail(at + '.homepage must use http(s)');
      } catch {
        fail(at + '.homepage must be an absolute URL');
      }
    }
    if (plugin.repository !== undefined) {
      if (!isObject(plugin.repository) || !isText(plugin.repository.url)) fail(at + '.repository.url is required');
      else if (!/^https?:\/\//u.test(plugin.repository.url)) fail(at + '.repository.url must use http(s)');
    }
    if (plugin.metadata !== undefined) {
      const metadata = plugin.metadata;
      if (!isObject(metadata)) fail(at + '.metadata must be an object');
      else {
        if (metadata.category !== undefined && !Object.hasOwn(categories, metadata.category)) fail(at + '.metadata.category references an undeclared category');
        if (metadata.labels !== undefined) {
          if (!Array.isArray(metadata.labels)) fail(at + '.metadata.labels must be an array');
          else for (const label of metadata.labels) if (!Object.hasOwn(labels, label)) fail(at + '.metadata.labels references an undeclared label ' + String(label));
        }
      }
    }
    if (plugin.icon !== undefined) {
      const icon = plugin.icon;
      if (typeof icon !== 'string' || icon.trim() === '') fail(at + '.icon must be a non-empty string');
      else if (icon.startsWith('data:')) {
        const payload = DATA_ICON.exec(icon)?.[1];
        if (payload === undefined) fail(at + '.icon must be a base64 SVG/PNG/JPEG/WebP data URL');
        else {
          const decoded = Buffer.from(payload, 'base64').length;
          if (decoded > 32 * 1024) fail(at + '.icon exceeds 32 KiB decoded');
        }
      } else {
        try {
          const url = new URL(icon);
          if (url.protocol !== 'https:') fail(at + '.icon must use https');
        } catch {
          fail(at + '.icon must be an absolute https URL or a data URL');
        }
      }
    }
    if (!Array.isArray(plugin.versions) || plugin.versions.length === 0) fail(at + '.versions must be a non-empty array');
    else {
      const versions = new Set();
      plugin.versions.forEach((version, position) => {
        const versionAt = at + '.versions[' + String(position) + ']';
        if (!isObject(version)) return fail(versionAt + ' must be an object');
        if (!isText(version.version) || !SEMVER.test(version.version)) fail(versionAt + '.version must be an exact SemVer version');
        if (versions.has(version.version)) fail(versionAt + '.version duplicates ' + String(version.version));
        versions.add(version.version);
        if (!Number.isInteger(version.publishTimestamp) || version.publishTimestamp < 0 || version.publishTimestamp >= 1e11) fail(versionAt + '.publishTimestamp must be Unix seconds');
        if (!isObject(version.source)) fail(versionAt + '.source is required');
        else if (version.source.type === 'npm') {
          if (version.source.registry !== undefined && !/^https?:\/\//u.test(String(version.source.registry))) fail(versionAt + '.source.registry must be an http(s) URL');
        } else if (version.source.type === 'git') {
          if (!/^https:\/\//u.test(String(version.source.url))) fail(versionAt + '.source.url must be https');
          if (!GIT_COMMIT.test(String(version.source.commit))) fail(versionAt + '.source.commit must be a 40-hex commit');
        } else fail(versionAt + '.source.type must be "npm" or "git"');
        if (version.engines !== undefined) {
          if (!isObject(version.engines)) fail(versionAt + '.engines must be an object');
          else if (version.engines.dsh !== undefined && (typeof version.engines.dsh !== 'string' || /^workspace:/u.test(version.engines.dsh))) fail(versionAt + '.engines.dsh must be a non-workspace SemVer range');
        }
      });
    }
  });
}

if (failed) process.exit(1);
console.log('index check passed:', file);
