const { Plugin } = require('release-it');
const fs = require('fs');
const path = require('path');
const detectNewline = require('detect-newline');
var format = require('string-template');

const pad = num => ('0' + num).slice(-2);

const getFormattedDate = () => {
  const today = new Date();
  return `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
};

class KeepAChangelog extends Plugin {
  async init() {
    await super.init();
    const {
      filename,
      strictLatest,
      addUnreleased,
      keepUnreleased,
      addVersionUrl,
      repositoryUrlFormat,
      unreleasedVersionUrlFormat,
      releasedVersionUrlFormat,
      firstVersionUrlFormat,
      head
    } = this.options;

    this.filename = filename || 'CHANGELOG.md';
    this.strictLatest = strictLatest === undefined ? true : Boolean(strictLatest);
    this.addUnreleased = addUnreleased === undefined ? false : Boolean(addUnreleased);
    this.keepUnreleased = keepUnreleased === undefined ? false : Boolean(keepUnreleased);
    this.addVersionUrl = addVersionUrl === undefined ? false : Boolean(addVersionUrl);
    this.repositoryUrlFormat = repositoryUrlFormat || 'https://{host}/{repository}';
    this.unreleasedVersionUrlFormat = unreleasedVersionUrlFormat || '{repositoryUrl}/compare/{tagName}...{head}';
    this.releasedVersionUrlFormat = releasedVersionUrlFormat || '{repositoryUrl}/compare/{previousTag}...{tagName}';
    this.firstVersionUrlFormat = firstVersionUrlFormat || '{repositoryUrl}/releases/tag/{tagName}';
    this.head = head || 'HEAD';

    this.changelogPath = path.resolve(this.filename);
    this.changelogContent = fs.readFileSync(this.changelogPath, 'utf-8');
    this.EOL = detectNewline(this.changelogContent);
    this.unreleasedTitleRaw = 'Unreleased';
    this.unreleasedTitle = `## [${this.unreleasedTitleRaw}]`;

    const hasUnreleasedSection = this.changelogContent.includes(this.unreleasedTitle);
    if (!hasUnreleasedSection) {
      throw Error(`Missing "${this.unreleasedTitleRaw}" section in ${filename}.`);
    }
  }

  getChangelog(latestVersion) {
    const { changelog } = this.getContext();
    if (changelog) return changelog;

    const { filename, strictLatest } = this;

    const previousReleaseTitle = strictLatest ? `## [${latestVersion}]` : `## [`;
    const hasPreviousReleaseSection = this.changelogContent.includes(previousReleaseTitle);

    if (strictLatest && !hasPreviousReleaseSection) {
      throw Error(`Missing section for previous release ("${latestVersion}") in ${filename}.`);
    }

    const startIndex = this.changelogContent.indexOf(this.unreleasedTitle) + this.unreleasedTitle.length;
    let endIndex = this.changelogContent.indexOf(previousReleaseTitle, startIndex);
    if (!strictLatest && endIndex === -1) {
      endIndex = this.changelogContent.length;
    }

    const changelogContent = this.changelogContent.substring(startIndex, endIndex).trim();
    if (!changelogContent) {
      throw Error(`There are no entries under "${this.unreleasedTitleRaw}" section in ${filename}.`);
    }

    this.setContext({ changelog: changelogContent });
    return changelogContent;
  }

  bump(version) {
    this.setContext({ version });
  }

  addVersionUrls(changelog) {
    const { version, latestVersion, tagName, latestTag, repo } = this.config.getContext();
    let updatedChangelog = changelog;

    const repositoryUrl = format(this.repositoryUrlFormat, repo);
    const unreleasedLinkRegex = new RegExp(`\\[unreleased\\]\\:.*${this.head}`, 'i');

    // Add or update the Unreleased link
    const unreleasedUrl = format(this.unreleasedVersionUrlFormat, { repositoryUrl, tagName, head: this.head });
    const unreleasedLink = `[unreleased]: ${unreleasedUrl}`;
    if (unreleasedLinkRegex.test(updatedChangelog)) {
      updatedChangelog = updatedChangelog.replace(unreleasedLinkRegex, unreleasedLink);
    } else {
      updatedChangelog = `${updatedChangelog}${this.EOL}${unreleasedLink}`;
    }

    // Add a link for the first tagged version
    if (!latestTag) {
      const firstVersionUrl = format(this.firstVersionUrlFormat, { repositoryUrl, tagName });
      const firstVersionLink = `[${version}]: ${firstVersionUrl}`;
      return `${updatedChangelog}${this.EOL}${firstVersionLink}`;
    }

    // Add a link for the new version
    const latestVersionLink = `[${latestVersion}]:`;
    const releaseUrl = format(this.releasedVersionUrlFormat, { repositoryUrl, previousTag: latestTag, tagName });
    const releaseLink = `[${version}]: ${releaseUrl}`;
    if (updatedChangelog.includes(latestVersionLink)) {
      return updatedChangelog.replace(latestVersionLink, `${releaseLink}${this.EOL}${latestVersionLink}`);
    } else {
      return `${updatedChangelog}${this.EOL}${releaseLink}`;
    }
  }

  beforeRelease() {
    const { addUnreleased, keepUnreleased, addVersionUrl } = this;
    const { isDryRun } = this.config;
    if (isDryRun || keepUnreleased) return;
    const { version } = this.getContext();
    const formattedDate = getFormattedDate();
    const unreleasedTitle = addUnreleased ? this.unreleasedTitle + this.EOL + this.EOL : '';
    const releaseTitle = `${unreleasedTitle}## [${version}] - ${formattedDate}`;
    let changelog = this.changelogContent.replace(this.unreleasedTitle, releaseTitle);

    if (addVersionUrl) {
      changelog = this.addVersionUrls(changelog);
    }

    fs.writeFileSync(this.changelogPath, changelog.trim() + this.EOL);
  }
}

module.exports = KeepAChangelog;
