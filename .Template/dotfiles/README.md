# dotfiles

VS Code Dev Containers / Codespaces が**全プロジェクトの起動時に自動適用**する個人dotfiles。
主目的は **Antigravity CLI（`agy`）を全devcontainerに自動導入**すること。

## これは何をするか
- `install.sh` が `agy`（Go製単一バイナリ）を `~/.local/bin` に冪等インストールし、PATHを通す。
- VS Codeが各devcontainer作成時にこのリポジトリをcloneして `install.sh` を実行する。

## セットアップ（一度きり・ホスト側）

### 1. このリポジトリをGitHubにpush
```bash
# このフォルダ（install.sh / README.md / compose-snippet.yml がある場所）で:
git init
git add .
git commit -m "dotfiles: auto-install Antigravity CLI (agy)"
git branch -M main
git remote add origin https://github.com/<あなた>/dotfiles.git
git push -u origin main
```

### 2. VS Code のユーザー設定（settings.json）に追記
`Ctrl+Shift+P` → 「Preferences: Open User Settings (JSON)」で開き、追加:
```json
"dotfiles.repository": "https://github.com/<あなた>/dotfiles",
"dotfiles.installCommand": "install.sh"
```
> `dotfiles.targetPath` は省略可（既定 `~/dotfiles`）。

これで以後、**どのdevcontainerでも起動時に `agy` が自動で入ります**。

## 認証（ログイン状態）を全プロジェクトで共有する
dotfilesはバイナリ導入のみ担当。ログイン状態の保持は各プロジェクトの
`docker-compose.yml`（または devcontainer.json の mounts）に共有ボリュームを足す必要があります。
`compose-snippet.yml` の2か所を各プロジェクトのcomposeに追記してください
（このテンプレートの `.devcontainer/docker-compose.yml` には既に追記済み）。

## 初回ログイン
導入後、新しいターミナルで `agy` を引数なしで起動 → Googleアカウントでログイン。
共有ボリュームを設定済みなら、再構築後も再ログイン不要です。
