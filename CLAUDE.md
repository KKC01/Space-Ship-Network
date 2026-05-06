# Security Rules for This Project

## 🔒 CRITICAL: Never Expose Credentials

**Absolute Rule:**
- API tokens, passwords, secrets MUST NEVER appear in:
  - Bash/PowerShell commands in tool calls
  - Script output logs
  - Response text or messages
  - Git commits or files

### Safe Pattern
```javascript
// Token is ONLY in .claude/settings.local.json
// Script reads it from process.env
const token = process.env.HF_API_TOKEN;
// ✅ Never pass token in command line
node script.js
```

### Dangerous Pattern
```bash
// ❌ NEVER DO THIS
HF_API_TOKEN="hf_xyz123" node script.js
```

### If Credentials Are Exposed
1. Stop immediately
2. Inform user to regenerate
3. Never log or display the exposed credential again
4. Remove from all outputs and responses

## Hugging Face Setup

- Token: Stored in `.claude/settings.local.json`
- Never hardcoded in scripts or configs
- Regenerate immediately if exposed
- Current setup: MCP server + canvas fallback
