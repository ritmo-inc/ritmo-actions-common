# JIRA Integration GitHub Action

このActionは、GitHubのPull Requestに関連するJIRAのタスク情報を自動的に取得し、PRの説明に情報を追加する機能を提供します。さらに、ベースブランチが期待するものであるか、およびPRがベースブランチと同期しているかどうかを確認する機能も備えています。

## 使用方法
1. GitHubのリポジトリで、このActionを使用するワークフローを作成します。
2. 必要な入力パラメータを設定します。
3. ワークフローがトリガーされると、Actionが実行されます。
### 前提条件

- JIRA APIトークン、メール、ベースURLが必要です。
- GitHubトークンが必要です。

### セットアップ

1. ワークフローファイル (`*.yml` or `*.yaml`) に以下のステップを追加します：

```yaml
- name: JIRA Integration
  uses: [YOUR-GITHUB-USERNAME]/[YOUR-REPOSITORY-NAME]@v1
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
    jira-base-url: ${{ secrets.JIRA_BASE_URL }}
    jira-email: ${{ secrets.JIRA_EMAIL }}
    jira-api-token: ${{ secrets.JIRA_API_TOKEN }}
```

### 入力パラメーター

| パラメータ名      | 説明                                       | 必須   | 既定値 |
|------------------|-------------------------------------------|-------|-------|
| `github-token`   | GitHubのトークン。                         | Yes   |       |
| `jira-base-url`  | JIRAのベースURL。                          | Yes   |       |
| `jira-email`     | JIRAのAPIにアクセスするためのメールアドレス。  | Yes   |       |
| `jira-api-token` | JIRAのAPIトークン。                        | Yes   |       |

### 使い方

1. GitHubのリポジトリで、このActionを使用するワークフローを作成します。
2. 必要な入力パラメータを設定します。
3. ワークフローがトリガーされると、Actionが実行されます。