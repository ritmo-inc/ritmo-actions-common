const core = require('@actions/core');
const github = require('@actions/github');
const axios = require('axios');
const { execSync } = require('child_process');

class PRHandler {
    constructor(inputs) {
        this.inputs = inputs;
        this.octokit = github.getOctokit(this.inputs.githubToken);
    }

    async assignPullRequestToCreator() {
        const { issue, repo, payload } = this.inputs.context;
        await this.octokit.rest.issues.addAssignees({
            issue_number: issue.number,
            owner: repo.owner,
            repo: repo.repo,
            assignees: [payload.pull_request.user.login]
        });
    }

    determineLabelFromBranch(branchName) {
        const prefixes = ['feature', 'bugfix', 'release', 'hotfix', 'support'];
        return prefixes.find(prefix => branchName.startsWith(`${prefix}/`)) || '';
    }

    async labelPullRequest(label) {
        const { issue, repo } = this.inputs.context;
        await this.octokit.rest.issues.addLabels({
            owner: repo.owner,
            repo: repo.repo,
            issue_number: issue.number,
            labels: [label]
        });
    }

    async setTitleWithJiraTask(branchName) {
        const jiraID = branchName.match(/[A-Z]+-[0-9]+/);
        if (!jiraID) return;

        const jiraData = await this.fetchJiraData(jiraID[0]);
        const updatedTitle = `[${branchName}] ${jiraData.fields.summary}`;
        
        await this.octokit.rest.pulls.update({
            owner: this.inputs.context.repo.owner,
            repo: this.inputs.context.repo.repo,
            pull_number: this.inputs.context.issue.number,
            title: updatedTitle
        });
    }

    async fetchJiraData(jiraID) {
        return axios.get(`${this.inputs.jiraBaseUrl}/rest/api/2/issue/${jiraID}`, {
            headers: {
                'Authorization': `Basic ${Buffer.from(`${this.inputs.jiraEmail}:${this.inputs.jiraApiToken}`).toString('base64')}`,
                'Content-Type': 'application/json'
            }
        }).then(response => response.data);
    }

    ensureValidBaseBranch() {
        const intendedBase = 'develop';
        if (this.inputs.context.payload.pull_request.base.ref !== intendedBase) {
            throw new Error("Error: PR base branch is not the intended branch.");
        }
    }

    async checkIfPullRequestIsUpToDate() {
        const baseBranchSha = this.getLatestBaseBranchSha(this.inputs.context.payload.pull_request.base.ref);
        const pullRequestBaseSha = await this.fetchPullRequestBaseSha();
        if (baseBranchSha !== pullRequestBaseSha) {
            throw new Error("PR is not up-to-date with its base branch. Please update your branch.");
        }
    }

    getLatestBaseBranchSha(baseRef) {
        return execSync(`git rev-parse origin/${baseRef}`, { encoding: 'utf8' }).trim();
    }

    async fetchPullRequestBaseSha() {
        const { repo, issue } = this.inputs.context;
        const prInfo = await this.octokit.pulls.get({
            owner: repo.owner,
            repo: repo.repo,
            pull_number: issue.number
        });
        return prInfo.data.base.sha;
    }
}

async function getActionInputs() {
    return {
        githubToken: core.getInput('github-token', { required: true }),
        jiraBaseUrl: process.env.JIRA_BASE_URL,
        jiraEmail: process.env.JIRA_EMAIL,
        jiraApiToken: process.env.JIRA_API_TOKEN,
        context: github.context
    };
}

async function run() {
    try {
        const inputs = await getActionInputs();
        const prHandler = new PRHandler(inputs);
        
        await prHandler.assignPullRequestToCreator();
        const branchName = inputs.context.payload.pull_request.head.ref;
        const label = prHandler.determineLabelFromBranch(branchName);
        if (label) await prHandler.labelPullRequest(label);
        await prHandler.setTitleWithJiraTask(branchName);
        prHandler.ensureValidBaseBranch();
        await prHandler.checkIfPullRequestIsUpToDate();

    } catch (error) {
        core.setFailed(error.message);
    }
}

run();
