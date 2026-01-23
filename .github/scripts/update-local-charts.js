const { Octokit } = require('@octokit/rest');
const semver = require('semver');
const fs = require('fs');
const path = require('path');
const YAML = require('yaml');


const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN,
});


async function getLatestRelease(owner, repo) {
  try {
    const { data: releases } = await octokit.repos.listReleases({
      owner,
      repo,
      per_page: 100,
    });


    // Filter nur stabile Releases (keine Pre-releases, Drafts)
    const stableReleases = releases.filter(
      (r) => !r.prerelease && !r.draft && r.tag_name.match(/^v?\d+\.\d+\.\d+$/)
    );


    if (stableReleases.length === 0) {
      console.log(`No stable releases found for ${owner}/${repo}`);
      return null;
    }


    // Sortiere nach Version
    stableReleases.sort((a, b) =>
      semver.compare(
        semver.coerce(b.tag_name),
        semver.coerce(a.tag_name)
      )
    );


    return stableReleases[0];
  } catch (error) {
    console.error(
      `Error fetching releases for ${owner}/${repo}:`,
      error.message
    );
    return null;
  }
}


async function findValidImageTag(imagePrefix, releaseTag) {
  const variants = [
    releaseTag, // Exakt wie im Release (v2.2.0 oder 2.2.0)
    releaseTag.replace(/^v/, ''), // Ohne 'v' prefix
    releaseTag.startsWith('v') ? releaseTag : `v${releaseTag}`, // Mit 'v' prefix
  ];


  // Entferne Duplikate
  const uniqueVariants = [...new Set(variants)];


  console.log(`      Testing image tag variants: ${uniqueVariants.join(', ')}`);


  // Für lokale Tests oder ohne Internet: Nutze einfach den Release Tag
  if (!process.env.GITHUB_TOKEN) {
    console.log(
      `      ⚠️  No GITHUB_TOKEN, using release tag as-is: ${releaseTag}`
    );
    return releaseTag;
  }


  // Versuche mit Docker Registry API zu prüfen ob Tag existiert
  for (const variant of uniqueVariants) {
    try {
      // Extrahiere Registry und Repository aus imagePrefix
      // Format: ghcr.io/pocket-id/pocket-id
      const imageParts = imagePrefix.split('/');
      const registry = imageParts[0];


      let apiUrl;
      if (registry.includes('ghcr.io')) {
        // GitHub Container Registry API
        const repo = imageParts.slice(1).join('/');
        apiUrl = `https://ghcr.io/v2/${repo}/manifests/${variant}`;
      } else {
        // Standard Docker Registry V2 API
        const repo = imageParts.slice(1).join('/');
        apiUrl = `https://${registry}/v2/${repo}/manifests/${variant}`;
      }


      const response = await fetch(apiUrl, {
        method: 'HEAD',
        headers: {
          'User-Agent': 'chart-update-tool',
          'Authorization': `Bearer ${process.env.GITHUB_TOKEN}`,
        },
      }).catch(() => null);


      if (response && (response.ok || response.status === 200)) {
        console.log(`      ✓ Valid image tag found: ${variant}`);
        return variant;
      }
    } catch (error) {
      console.log(`      - Variant '${variant}' not found`);
    }
  }


  // Fallback: Nutze Release Tag wie er ist
  console.log(
    `      ⚠️  Could not verify image tag, using release tag: ${releaseTag}`
  );
  return releaseTag;
}


function incrementPatchVersion(version) {
  const parsed = semver.parse(version);
  if (!parsed) {
    console.warn(`Could not parse version: ${version}`);
    return version;
  }
  return semver.inc(parsed, 'patch');
}


/**
 * Aktualisiere einen verschachtelten Wert in YAML-Datei-Content
 * während Kommentare erhalten bleiben
 */
function updateYamlValue(content, keyPath, newValue) {
  const lines = content.split('\n');
  const keys = keyPath.split('.');
  let result = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Überspringe leere Zeilen und Kommentare (zu Anfang der Zeile)
    if (!trimmed || trimmed.startsWith('#')) {
      result.push(line);
      continue;
    }

    // Extrahiere Einrückung und Key
    const keyMatch = line.match(/^(\s*)([^:]+):\s*(.*)$/);
    if (keyMatch) {
      const currentKey = keyMatch[2].trim();
      const currentIndent = keyMatch[1];
      const currentValue = keyMatch[3];

      // Prüfe ob das die Key ist, die wir suchen
      if (keys.length === 1 && currentKey === keys[0]) {
        // Single-key update (z.B. "version")
        const comment = currentValue.match(/#.*$/) ? ` ${currentValue.match(/#.*$/)[0]}` : '';
        result.push(`${currentIndent}${currentKey}: ${newValue}${comment}`);
        continue;
      } else if (keys.length > 1 && currentKey === keys[keys.length - 1]) {
        // Nested-key update (z.B. "image.tag")
        const comment = currentValue.match(/#.*$/) ? ` ${currentValue.match(/#.*$/)[0]}` : '';
        result.push(`${currentIndent}${currentKey}: ${newValue}${comment}`);
        continue;
      }
    }

    result.push(line);
  }

  return result.join('\n');
}


async function updateChart(chartConfig) {
  const {
    name,
    chartPath,
    repository,
    imagePrefix,
    valuesFile = 'values.yaml',
    imageKey,
    enabled = true,
    external = false,
  } = chartConfig;


  // Skip disabled charts
  if (!enabled) {
    console.log(`\n⊘ Skipped (disabled): ${name}`);
    return { updated: false, chart: name, skipped: true, reason: 'disabled' };
  }


  // Skip external charts - werden vom sync-external-charts.js verwaltet
  if (external) {
    console.log(
      `\n⊘ Skipped (external chart - managed by sync workflow): ${name}`
    );
    return { updated: false, chart: name, skipped: true, reason: 'external' };
  }


  // Skip charts ohne imagePrefix/imageKey - können nicht aktualisiert werden
  if (!imagePrefix || !imageKey) {
    console.log(
      `\n⊘ Skipped (no imagePrefix or imageKey configured): ${name}`
    );
    return {
      updated: false,
      chart: name,
      skipped: true,
      reason: 'no-image-config',
    };
  }


  console.log(`\n📦 Processing chart: ${name}`);
  console.log(`   Repository: ${repository}`);


  const [owner, repo] = repository.split('/');
  const latestRelease = await getLatestRelease(owner, repo);


  if (!latestRelease) {
    console.log(`   ⚠️  No releases found, skipping...`);
    return { updated: false, chart: name };
  }


  const releaseTag = latestRelease.tag_name;
  console.log(`   Latest release: ${releaseTag}`);


  const imageTag = await findValidImageTag(imagePrefix, releaseTag);


  const chartMetaPath = path.join(chartPath, 'Chart.yaml');
  const valuesPath = path.join(chartPath, valuesFile);


  // Lese Chart.yaml
  if (!fs.existsSync(chartMetaPath)) {
    console.error(`   ❌ Chart.yaml not found at ${chartMetaPath}`);
    return { updated: false, chart: name, error: 'Chart.yaml not found' };
  }


  const chartMetaContent = fs.readFileSync(chartMetaPath, 'utf8');
  const chartMeta = YAML.parse(chartMetaContent);


  // Lese values.yaml
  if (!fs.existsSync(valuesPath)) {
    console.error(`   ❌ ${valuesFile} not found at ${valuesPath}`);
    return {
      updated: false,
      chart: name,
      error: `${valuesFile} not found`,
    };
  }


  let valuesContent = fs.readFileSync(valuesPath, 'utf8');
  const values = YAML.parse(valuesContent);


  // Extrahiere aktuelles Image Tag
  const currentImageTag = getNestedProperty(values, imageKey);


  if (currentImageTag === imageTag) {
    console.log(`   ✓ Already up to date (${imageTag})`);
    return { updated: false, chart: name };
  }


  console.log(`   🔄 Update found: ${currentImageTag} → ${imageTag}`);


  // Aktualisiere Image Tag in values.yaml unter Beibehaltung von Kommentaren
  valuesContent = updateYamlValue(valuesContent, imageKey, imageTag);


  // Speichere alte AppVersion für Vergleich
  const oldAppVersion = chartMeta.appVersion;


  // Aktualisiere AppVersion in Chart.yaml
  chartMeta.appVersion = releaseTag;


  // Aktualisiere Chart Version nur wenn AppVersion sich geändert hat
  const currentChartVersion = chartMeta.version;
  let newChartVersion = currentChartVersion;


  if (oldAppVersion !== releaseTag) {
    newChartVersion = incrementPatchVersion(currentChartVersion);
    chartMeta.version = newChartVersion;
    console.log(`      Chart Version: ${currentChartVersion} → ${newChartVersion}`);
  } else {
    console.log(`      Chart Version: ${currentChartVersion} (unchanged - AppVersion already up to date)`);
  }


  // Schreibe Dateien zurück
  fs.writeFileSync(chartMetaPath, YAML.stringify(chartMeta));
  fs.writeFileSync(valuesPath, valuesContent);


  console.log(`   ✅ Updated successfully`);
  console.log(`      Image: ${currentImageTag} → ${imageTag}`);
  console.log(`      AppVersion: ${oldAppVersion} → ${releaseTag}`);


  return {
    updated: true,
    chart: name,
    imageUpdate: { from: currentImageTag, to: imageTag },
    appVersionUpdate: { from: oldAppVersion, to: releaseTag },
    chartVersionUpdate: oldAppVersion !== releaseTag ? { from: currentChartVersion, to: newChartVersion } : null,
  };
}


function getNestedProperty(obj, path) {
  return path.split('.').reduce((current, prop) => current?.[prop], obj);
}


async function main() {
  console.log('🚀 Starting chart version update process...\n');


  const configPath = path.join(
    process.cwd(),
    '.github/config/charts-versions.json'
  );


  if (!fs.existsSync(configPath)) {
    console.error(`❌ Config file not found at ${configPath}`);
    process.exit(1);
  }


  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const results = [];


  for (const chart of config.charts) {
    const result = await updateChart(chart);
    results.push(result);
  }


  console.log('\n' + '='.repeat(50));
  console.log('📊 Summary:');
  console.log('='.repeat(50));


  const updated = results.filter((r) => r.updated);
  const skipped = results.filter((r) => r.skipped);


  console.log(`Total charts processed: ${results.length}`);
  console.log(`Updated: ${updated.length}`);
  console.log(`Skipped: ${skipped.length}`);


  if (updated.length > 0) {
    console.log('\n✅ Updated charts:');
    updated.forEach((r) => {
      console.log(
        `  • ${r.chart}: ${r.imageUpdate.from} → ${r.imageUpdate.to}`
      );
      console.log(
        `      AppVersion: ${r.appVersionUpdate.from} → ${r.appVersionUpdate.to}`
      );
      if (r.chartVersionUpdate) {
        console.log(
          `      Chart Version: ${r.chartVersionUpdate.from} → ${r.chartVersionUpdate.to}`
        );
      }
    });
  }


  if (skipped.length > 0) {
    console.log('\n⊘ Skipped charts:');
    skipped.forEach((r) => {
      console.log(`  • ${r.chart}: ${r.reason}`);
    });
  }
}


main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});