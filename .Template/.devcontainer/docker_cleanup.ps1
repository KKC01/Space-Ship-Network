# Docker環境 定期クリーンアップスクリプト（月次実行用・Windowsホストで実行）
#
# 方針: イメージとビルドキャッシュだけを削除し、コンテナ・ボリュームには触れない。
# 理由: devcontainerが停止中に `docker system prune` 等を実行すると、
#       コンテナごと削除されコンテナ内部の状態（Claude Codeの会話履歴等）が失われるため。
#       /root/.claude は docker-compose.yml で名前付きボリューム(claude-state)化済みだが、
#       念のため container/system/volume prune は使わない運用にする。

$ErrorActionPreference = "Continue"
$logFile = Join-Path $env:USERPROFILE "docker_cleanup_log.txt"
$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"

Add-Content -Path $logFile -Value "`n===== $timestamp ====="

Add-Content -Path $logFile -Value "--- prune前のディスク使用量 ---"
docker system df *>> $logFile

Add-Content -Path $logFile -Value "--- 未使用イメージを削除 (docker image prune -a) ---"
docker image prune -a -f *>> $logFile

Add-Content -Path $logFile -Value "--- ビルドキャッシュを削除 (docker builder prune -a) ---"
docker builder prune -a -f *>> $logFile

Add-Content -Path $logFile -Value "--- prune後のディスク使用量 ---"
docker system df *>> $logFile

# Tempフォルダ整理: 30日以上更新がないファイルのみ削除（使用中ファイルはスキップされる）
$tempPath = Join-Path $env:LOCALAPPDATA "Temp"
Add-Content -Path $logFile -Value "--- Tempフォルダ整理: $tempPath (30日以上前のファイルのみ) ---"
Get-ChildItem -Path $tempPath -Recurse -Force -ErrorAction SilentlyContinue |
    Where-Object { -not $_.PSIsContainer -and $_.LastWriteTime -lt (Get-Date).AddDays(-30) } |
    Remove-Item -Force -ErrorAction SilentlyContinue

Add-Content -Path $logFile -Value "完了。Docker Desktop → Settings → Resources → Disk usage で最終確認してください。"
Add-Content -Path $logFile -Value "VHDXの圧縮（ext4.vhdx）はこのスクリプトでは行いません。数ヶ月に一度、Docker Desktopを完全終了した上で手動実施してください。"
