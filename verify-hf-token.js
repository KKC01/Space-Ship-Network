const token = process.env.HF_API_TOKEN;

if (!token) {
  console.error('❌ HF_API_TOKEN is not set');
  process.exit(1);
}

console.log('Verifying Hugging Face token...\n');

async function verifyToken() {
  try {
    // Method 1: Check user endpoint
    console.log('Method 1: Check user profile');
    const userResponse = await fetch('https://huggingface.co/api/user', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    console.log(`Status: ${userResponse.status}`);
    const userData = await userResponse.json();

    if (userResponse.ok) {
      console.log('✅ Token is VALID');
      console.log(`Username: ${userData.name}`);
      console.log(`Organization: ${userData.org_name || 'None'}`);
      console.log(`Email: ${userData.email || 'N/A'}`);
    } else {
      console.log('❌ Token is INVALID or EXPIRED');
      console.log(`Error: ${userData.error}`);
    }
  } catch (error) {
    console.error('Error checking token:', error.message);
  }

  try {
    // Method 2: Check Inference API access
    console.log('\nMethod 2: Check Inference API access');
    const apiResponse = await fetch(
      'https://api-inference.huggingface.co/models/google/flan-t5-base',
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        method: 'POST',
        body: JSON.stringify({ inputs: 'test' }),
      }
    );

    console.log(`Status: ${apiResponse.status}`);

    if (apiResponse.status === 401 || apiResponse.status === 403) {
      console.log('❌ Token does not have Inference API access');
    } else if (apiResponse.status === 404) {
      console.log('⚠️  Inference API endpoint not found, but token might be valid');
    } else if (apiResponse.ok || apiResponse.status === 503) {
      console.log('✅ Token has Inference API access');
    }
  } catch (error) {
    console.error('Error checking Inference API:', error.message);
  }
}

verifyToken();
