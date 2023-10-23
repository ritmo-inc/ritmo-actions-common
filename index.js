const core = require('@actions/core');
const github = require('@actions/github');
const axios = require('axios');
const { execSync } = require('child_process');

async function getActionInputs() {
    return {
        githubToken: core.getInput('github-token', { required: true }),
        jiraBaseUrl: process.env.JIRA_BASE_URL,
        jiraEmail: process.env.JIRA_EMAIL,
        jiraApiToken: process.env.JIRA_API_TOKEN,
        context: github.context
    };
}

async function assignPullRequestToCreator(octokit, context) {
    const { issue, repo, payload } = context;
    await octokit.rest.issues.addAssignees({
        issue_number: issue.number,
        owner: repo.owner,
        repo: repo.repo,
        assignees: [payload.pull_request.user.login]
    });
}

function determineLabelFromBranch(branchName) {
    const prefixes = ['feature', 'bugfix', 'release', 'hotfix', 'support'];
    return prefixes.find(prefix => branchName.startsWith(`${prefix}/`)) || '';
}

async function labelPullRequest(octokit, context, label) {
    const { issue, repo } = context;
    await octokit.rest.issues.addLabels({
        owner: repo.owner,
        repo: repo.repo,
        issue_number: issue.number,
        labels: [label]
    });
}

async function setTitleWithJiraTask(octokit, context, branchName) {
    const jiraID = branchName.match(/[A-Z]+-[0-9]+/);
    if (!jiraID) return;

    const jiraData = await fetchJiraData(jiraID[0]);
    const updatedTitle = `[${branchName}] ${jiraData.fields.summary}`;
    
    await octokit.rest.pulls.update({
        owner: context.repo.owner,
        repo: context.repo.repo,
        pull_number: context.issue.number,
        title: updatedTitle
    });
}

async function fetchJiraData(jiraID) {
    return axios.get(`${process.env.JIRA_BASE_URL}/rest/api/2/issue/${jiraID}`, {
        headers: {
            'Authorization': `Basic ${Buffer.from(`${process.env.JIRA_EMAIL}:${process.env.JIRA_API_TOKEN}`).toString('base64')}`,
            'Content-Type': 'application/json'
        }
    }).then(response => response.data);
}

function ensureValidBaseBranch(context) {
    const intendedBase = 'develop';
    if (context.payload.pull_request.base.ref !== intendedBase) {
        throw new Error("Error: PR base branch is not the intended branch.");
    }
}

function checkIfPullRequestIsUpToDate(octokit, context) {
    const baseBranchSha = getLatestBaseBranchSha(context.payload.pull_request.base.ref);
    const pullRequestBaseSha = fetchPullRequestBaseSha(octokit, context);
    if (baseBranchSha !== pullRequestBaseSha) {
        throw new Error("PR is not up-to-date with its base branch. Please update your branch.");
    }
}

function getLatestBaseBranchSha(baseRef) {
    return execSync(`git rev-parse origin/${baseRef}`, { encoding: 'utf8' }).trim();
}

async function fetchPullRequestBaseSha(octokit, context) {
    const { repo, issue } = context;
    const prInfo = await octokit.pulls.get({
        owner: repo.owner,
        repo: repo.repo,
        pull_number: issue.number
    });
    return prInfo.data.base.sha;
}

async function run() {
    try {
        const inputs = await getActionInputs();
        const octokit = github.getOctokit(inputs.githubToken);
        
        await assignPullRequestToCreator(octokit, inputs.context);
        const label = determineLabelFromBranch(inputs.context.payload.pull_request.head.ref);
        if (label) await labelPullRequest(octokit, inputs.context, label);
        await setTitleWithJiraTask(octokit, inputs.context, branchName);
        ensureValidBaseBranch(inputs.context);
        checkIfPullRequestIsUpToDate(octokit, inputs.context);

    } catch (error) {
        core.setFailed(error.message);
    }
}

run();
