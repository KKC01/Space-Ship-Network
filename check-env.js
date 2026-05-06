const token = process.env.HF_API_TOKEN;

if (token) {
  console.log('✅ HF_API_TOKEN is set in environment');
  console.log(`Length: ${token.length} characters`);
  console.log(`Prefix: ${token.slice(0, 10)}...`);
  console.log(`Valid format: ${token.startsWith('hf_') ? 'Yes' : 'No'}`);
} else {
  console.log('❌ HF_API_TOKEN is NOT set in environment');
  console.log('Make sure .claude/settings.local.json has the token');
}
