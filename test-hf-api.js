const token = process.env.HF_API_TOKEN;

async function testAPI() {
  const models = [
    'black-forest-labs/FLUX.1-schnell',
    'stabilityai/stable-diffusion-xl-base-1.0',
    'runwayml/stable-diffusion-v1-5',
    'stabilityai/stable-diffusion-2',
  ];

  for (const model of models) {
    console.log(`\nTesting model: ${model}`);
    try {
      const response = await fetch(
        `https://api-inference.huggingface.co/models/${model}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          method: 'POST',
          body: JSON.stringify({
            inputs: 'Earth planet',
            parameters: { height: 30, width: 30 },
          }),
        }
      );

      console.log(`Status: ${response.status}`);
      const text = await response.text();
      console.log(`Response: ${text.slice(0, 200)}`);
    } catch (error) {
      console.log(`Error: ${error.message}`);
    }
  }
}

testAPI();
