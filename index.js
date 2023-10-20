const axios = require('axios');
const core = require('@actions/core');
const github = require('@actions/github');

// GitHub Actionsの入力値を取得する関数
async function getActionInputs() {
    // 入力値を取得して返す
    return {
        githubToken: core.getInput('github-token', { required: true }),
        jiraBaseUrl: core.getInput('jira-base-url', { required: true }),
        jiraEmail: core.getInput('jira-email', { required: true }),
        jiraApiToken: core.getInput('jira-api-token', { required: true }),
        context: github.context
    };
}

class PRProcessor {
    constructor(inputs) {
        this.inputs = inputs;
        this.octokit = github.getOctokit(inputs.githubToken);
        this.context = inputs.context;
    }

    // PRのベースブランチが適切かを確認する関数
    async ensureBaseBranchIsIntended() {
        const intendedBase = this.context.payload.pull_request.base.ref;
        const baseRef = this.context.payload.pull_request.base.ref;
        
        if (baseRef !== intendedBase) {
            throw new Error("PR base branch is not the intended branch.");
        }
    }

    // PRがベースブランチと最新状態であるかを確認する関数
    async checkIfPrIsUpToDate() {
        const prNumber = this.context.payload.pull_request.number;
        const repository = this.context.repo.repo;
        const prInfo = JSON.parse(execSync(`gh pr view ${prNumber} --json base,head -R ${repository}`, { encoding: 'utf8' }));
        
        const headSha = prInfo.head.sha;
        const baseSha = prInfo.base.sha;
        const latestBaseSha = execSync(`git rev-parse origin/${baseRef}`, { encoding: 'utf8' }).trim();
        
        if (baseSha !== latestBaseSha) {
            throw new Error("PR is not up-to-date with its base branch. Please update your branch.");
        }
    }

    // PRの内容をJiraの情報を元に更新する関数
    async updatePrFromJira() {
        const branchName = this.context.payload.pull_request.head.ref;
        const currentDescription = this.context.payload.pull_request.body;
        
        const replacements = await this.extractJiraIdAndFetchDetails(branchName);
        const newDescription = currentDescription
            .replace(/\$JIRA_SBI/g, replacements["$JIRA_SBI"])
            .replace(/\$JIRA_PBI/g, replacements["$JIRA_PBI"]);
            
        await this.updatePrDescription(newDescription);
    }

    extractJiraIdFromBranch(branchName) {
        return branchName.match(/[A-Z]+-[0-9]+/);
    }

    // Jiraの詳細情報を取得する関数
    async extractJiraIdAndFetchDetails(branchName) {
        const branchSuffix = branchName.split('/')[1] || '';
        let replacements = {
            "$JIRA_SBI": branchSuffix,
            "$JIRA_PBI": ''
        };

        const jiraID = this.extractJiraIdFromBranch(branchName);
        if (jiraID) {
            replacements = await this.fetchJiraDetails(jiraID[0]);
        }

        return replacements;
    }

    // Jiraのタスク情報を取得する関数
    async fetchJiraDetails(jiraID) {
        const jiraData = await getJiraTaskInfo(this.inputs.jiraBaseUrl, this.inputs.jiraEmail, this.inputs.jiraApiToken, jiraID);
        let replacements = {
            "$JIRA_SBI": '',
            "$JIRA_PBI": ''
        };

        if (jiraData && jiraData.fields) {
            if (jiraData.fields.parent) {
                replacements["$JIRA_PBI"] = jiraData.fields.parent.key;
            }
            if (jiraData.fields.components && jiraData.fields.components.length > 0) {
                const componentNames = jiraData.fields.components.map(comp => comp.name);
                await this.addLabelsToPR(componentNames);
            }
        }
        return replacements;
    }

    // PRの説明を更新する関数
    async updatePrDescription(newDescription) {
        await this.octokit.rest.pulls.update({
            owner: this.context.repo.owner,
            repo: this.context.repo.repo,
            pull_number: this.context.payload.pull_request.number,
            body: newDescription
        });
    }

    // PRにラベルを追加する関数
    async addLabelsToPR(labels) {
        for (const label of labels) {
            await this.octokit.rest.issues.addLabels({
                owner: this.context.repo.owner,
                repo: this.context.repo.repo,
                issue_number: this.context.payload.pull_request.number,
                labels: [label]
            });
        }
    }
}

async function run() {
    try {
        const inputs = await getActionInputs();
        const processor = new PRProcessor(inputs);
        await processor.process();
    } catch (error) {
        core.setFailed(error.message);
    }
}

run();
