const express = require('express');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const fs = require('fs');
const app = express();

// কনফিগারেশন
const APP_ID = '1191341'; // ধাপ ৩ থেকে সংগ্রহ করা App ID
const INSTALLATION_ID = '63290236'; // ধাপ ৩ থেকে Installation ID
const PRIVATE_KEY = fs.readFileSync('./private-key.pem'); // ধাপ ২ থেকে ডাউনলোড করা ফাইল
const GIST_ID = '2f40bd034c51e66cd46dfc581c4bfff3'; // আপনার Gist ID

app.use(express.json());

// JWT টোকেন জেনারেট
function generateJWT() {
  return jwt.sign(
    {
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 600, // 10 মিনিট
      iss: APP_ID
    },
    PRIVATE_KEY,
    { algorithm: 'RS256' }
  );
}

// ইন্সটলেশন টোকেন পেতে
async function getInstallationToken() {
  try {
    const jwtToken = generateJWT();
    const response = await axios.post(
      `https://api.github.com/app/installations/${INSTALLATION_ID}/access_tokens`,
      {},
      {
        headers: {
          'Authorization': `Bearer ${jwtToken}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      }
    );
    return response.data.token;
  } catch (error) {
    console.error('Installation token পেতে ব্যর্থ:', error.message);
    return null;
  }
}

// Gist অপারেশন
async function handleGist(action, data = null) {
  const token = await getInstallationToken();
  
  if (!token) {
    throw new Error('টোকেন পাওয়া যায়নি');
  }

  try {
    const config = {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    };

    if (action === 'get') {
      const response = await axios.get(`https://api.github.com/gists/${GIST_ID}`, config);
      return JSON.parse(response.data.files['blood_donors.json'].content);
    } else if (action === 'update') {
      const response = await axios.patch(
        `https://api.github.com/gists/${GIST_ID}`,
        {
          files: {
            'blood_donors.json': {
              content: JSON.stringify(data)
            }
          }
        },
        config
      );
      return response.data;
    }
  } catch (error) {
    console.error('Gist অপারেশন ব্যর্থ:', error.response?.data || error.message);
    throw error;
  }
}

// API এন্ডপয়েন্ট
app.post('/api/sync-donors', async (req, res) => {
  try {
    const localData = req.body.donors;
    const remoteData = await handleGist('get');
    
    // ডাটা মার্জ
    const mergedData = [...localData];
    const existingPhones = new Set(localData.map(d => d.phone));
    remoteData.forEach(donor => {
      if (!existingPhones.has(donor.phone)) {
        mergedData.push(donor);
      }
    });

    // Gist আপডেট
    await handleGist('update', mergedData);
    
    res.json({ success: true, data: mergedData });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message,
      details: error.response?.data || null
    });
  }
});

// স্টার্ট সার্ভার
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`সার্ভার চলছে পোর্ট ${PORT} এ`));