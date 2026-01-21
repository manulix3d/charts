const { Octokit } = require('@octokit/rest');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN,
});

const specificChart = process.argv[2] || '';

async function getRepositoryInfo(owner, repo) {
  try {
    const { data } = await octokit.repos.get({ owner, repo });
    return data;
  } catch (error) {
    console.error(`Error fetching repo info for ${owner}/${repo}:`, error.message);
    return null;
  }
}

async function downloadChartFromGit(owner, repo, sourceChartPath, syncBranch) {
  const tempDir = `/tmp/${owner}-${repo}-chart-${Date.now()}`;

  try {
    console.log(`   Cloning ${owner}/${repo} (branch: ${syncBranch})...`);
    execSync(
      `git clone --depth=1 --branch ${syncBranch} --filter=blob:none --sparse https://github.com/${owner}/${repo}.git ${tempDir}`,
      { stdio: 'pipe' }
    );

    execSync(`git sparse-checkout set ${sourceChartPath}`, {
      cwd: tempDir,
      stdio: 'pipe',
    });

    const sourcePath = path.join(tempDir, sourceChartPath);
    if (!fs.existsSync(sourcePath)) {
      throw new Error(`Chart path ${sourceChartPath} not found in repository`);
    }

    return { tempDir, sourcePath };
  } catch (error) {
    console.error(`Error downloading chart from ${owner}/${repo}:`, error.message);
    if (fs.existsSync(tempDir)) {
      execSync(`rm -rf ${tempDir}`, { stdio: 'pipe' });
    }
    return null;
  }
}

function copyChart(sourcePath, targetPath) {
  try {
    console.log(`   Copying chart from ${sourcePath} to ${targetPath}...`);

    if (!fs.existsSync(targetPath)) {
      fs.mkdirSync(targetPath, { recursive: true });
    }

    execSync(`rm -rf ${targetPath}/*`, { stdio: 'pipe' });

    execSync(`cp -r ${sourcePath}/* ${targetPath}/`, { stdio: 'pipe' });

    console.log(`   ✓ Chart copied successfully`);
    return true;
  } catch (error) {
    console.error(`Error copying chart:`, error.message);
    return false;
  }
}

function cleanupTemp(tempDir) {
  try {
    if (fs.existsSync(tempDir)) {
      execSync(`rm -rf ${tempDir}`, { stdio: 'pipe' });
    }
  } catch (error) {
    console.warn(`Warning: Could not cleanup temp directory:`, error.message);
  }
}

function getChartVersion(chartPath) {
  try {
    const chartYamlPath = path.join(chartPath, 'Chart.yaml');
    if (!fs.existsSync(chartYamlPath)) {
      return 'unknown';
    }

    const content = fs.readFileSync(chartYamlPath, 'utf8');
    const match = content.match(/^version:\s*(.+)$/m);
    return match ? match[1].trim() : 'unknown';
  } catch (error) {
    return 'unknown';
  }
}

async function syncExternalChart(chartConfig) {
  const { name, chartPath, repository, sourceChartPath, syncBranch } = chartConfig;

  console.log(`\n📥 Syncing external chart: ${name}`);
  console.log(`   Source: ${repository}`);
  console.log(`   Source path: ${sourceChartPath}`);
  console.log(`   Target: ${chartPath}`);

  const [owner, repo] = repository.split('/');

  const repoInfo = await getRepositoryInfo(owner, repo);
  if (!repoInfo) {
    return { synced: false, chart: name, error: 'Could not fetch repository info' };
  }

  console.log(`   Latest commit: ${repoInfo.default_branch}`);

  const downloadResult = await downloadChartFromGit(owner, repo, sourceChartPath, syncBranch || repoInfo.default_branch);
  if (!downloadResult) {
    return { synced: false, chart: name, error: 'Download failed' };
  }

  const { tempDir, sourcePath } = downloadResult;

  const oldVersion = getChartVersion(chartPath);

  const copySuccess = copyChart(sourcePath, chartPath);
  if (!copySuccess) {
    cleanupTemp(tempDir);
    return { synced: false, chart: name, error: 'Copy failed' };
  }

  const newVersion = getChartVersion(chartPath);

  cleanupTemp(tempDir);

  console.log(`   ✅ Synced successfully`);
  console.log(`      Chart version: ${oldVersion} → ${newVersion}`);

  return {
    synced: true,
    chart: name,
    versionUpdate: { from: oldVersion, to: newVersion },
    repository: repository,
  };
}

async function main() {
  console.log('🚀 Starting external chart sync process...\n');

  const configPath = path.join(process.cwd(), '.github/config/charts-versions.json');

  if (!fs.existsSync(configPath)) {
    console.error(`❌ Config file not found at ${configPath}`);
    process.exit(1);
  }

  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const results = [];

  for (const chart of config.charts) {
    if (!chart.external) {
      console.log(`\n⊘ Skipped (not external): ${chart.name}`);
      continue;
    }

    if (!chart.enabled) {
      console.log(`\n⊘ Skipped (disabled): ${chart.name}`);
      continue;
    }

    if (specificChart && chart.name !== specificChart) {
      console.log(`\n⊘ Skipped (not requested): ${chart.name}`);
      continue;
    }

    const result = await syncExternalChart(chart);
    results.push(result);
  }

  console.log('\n' + '='.repeat(50));
  console.log('📊 Summary:');
  console.log('='.repeat(50));

  const synced = results.filter((r) => r.synced);
  console.log(`Total external charts processed: ${results.length}`);
  console.log(`Synced: ${synced.length}`);

  if (synced.length > 0) {
    synced.forEach((r) => {
      console.log(`  • ${r.chart}: ${r.versionUpdate.from} → ${r.versionUpdate.to}`);
    });
  }

  const failed = results.filter((r) => !r.synced);
  if (failed.length > 0) {
    console.log('\n❌ Failed syncs:');
    failed.forEach((r) => {
      console.log(`  • ${r.chart}: ${r.error}`);
    });
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});