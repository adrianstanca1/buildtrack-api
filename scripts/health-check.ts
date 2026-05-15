import axios from 'axios';

const API_URL = process.env.API_URL || 'http://localhost:3001';

async function healthCheck() {
  const checks = [
    { name: 'Health endpoint', url: `${API_URL}/health` },
    { name: 'API health', url: `${API_URL}/api/health` },
    { name: 'Swagger docs', url: `${API_URL}/api/docs` },
  ];
  
  let passed = 0;
  let failed = 0;
  
  for (const check of checks) {
    try {
      const res = await axios.get(check.url, { timeout: 5000 });
      if (res.status === 200) {
        console.log(`✅ ${check.name}: OK (${res.status})`);
        passed++;
      } else {
        console.log(`⚠️  ${check.name}: ${res.status}`);
        failed++;
      }
    } catch (err: any) {
      console.log(`❌ ${check.name}: ${err.message}`);
      failed++;
    }
  }
  
  console.log(`\n📊 ${passed}/${passed + failed} checks passed`);
  process.exit(failed > 0 ? 1 : 0);
}

healthCheck();
