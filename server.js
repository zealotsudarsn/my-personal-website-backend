// backend/server.js
const express = require('express');
const admin = require('firebase-admin');
const express = require('express');
const cors = require('cors');

// --- Firebase Admin SDK Initialization ---
try {
  let serviceAccount;
  // This part is for Canvas environment if you used it before, can be kept
  const firebaseConfig = typeof __firebase_config !== 'undefined'
    ? JSON.parse(__firebase_config)
    : null;

  if (firebaseConfig && firebaseConfig.credential && firebaseConfig.credential.privateKey) {
    serviceAccount = firebaseConfig.credential;
    console.log("Firebase Admin SDK initialized using __firebase_config.");
  } else if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) { // Check for Render environment variable
    // This path is for Render deployment
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
    console.log("Firebase Admin SDK initialized using environment variable.");
  } else {
    // Fallback for local development (your existing require('./key.json'))
    // Ensure this path is correct for local testing
    serviceAccount = require('./my-personal-website-backend-firebase-adminsdk-fbsvc-1598fcc9cd.json'); // <--- Make sure this path is correct for your local key
    console.log("Firebase Admin SDK initialized using local service account key.");
  }

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });

} catch (error) {
  console.error("Failed to initialize Firebase Admin SDK:", error);
  process.exit(1); // Exit if Firebase initialization fails
}

const db = admin.firestore();
const app = express();
const PORT = process.env.PORT || 3001; // Render will set process.env.PORT

// --- Middleware ---
app.use(cors()); // Enable CORS for all origins (adjust for production to specific origins)
app.use(express.json()); // Enable parsing of JSON request bodies
// --- Firestore Helper for dynamic app_id ---
// In the Canvas environment, __app_id is automatically provided.
// For local development, you can set a default or use an environment variable.
const getAppId = () => {
  return typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
};

// --- API Endpoints ---

// GET /api/portfolio - Fetch portfolio items
app.get('/api/portfolio', async (req, res) => {
  try {
    const appId = getAppId();
    // Fetch documents from the 'portfolio' collection within the public data path
    const portfolioRef = db.collection(`artifacts/${appId}/public/data/portfolio`);
    const snapshot = await portfolioRef.get();

    if (snapshot.empty) {
      console.log('No portfolio items found.');
      return res.status(200).json([]); // Return empty array if no documents
    }

    const portfolioItems = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    // Sort portfolio items by a 'order' field or similar if needed, or by title
    // Example: portfolioItems.sort((a, b) => a.order - b.order);
    res.status(200).json(portfolioItems);
  } catch (error) {
    console.error('Error fetching portfolio items:', error);
    res.status(500).json({ message: 'Failed to fetch portfolio items.', error: error.message });
  }
});

// POST /api/contact - Submit contact form data
app.post('/api/contact', async (req, res) => {
  const { name, email, message } = req.body;

  // Basic server-side validation
  if (!name || !email || !message) {
    return res.status(400).json({ message: 'All fields are required.' });
  }

  try {
    const appId = getAppId();
    // Add contact message to 'contact_messages' collection within the public data path
    const contactMessagesRef = db.collection(`artifacts/${appId}/public/data/contact_messages`);
    const docRef = await contactMessagesRef.add({
      name,
      email,
      message,
      timestamp: admin.firestore.FieldValue.serverTimestamp() // Firestore server timestamp
    });
    console.log('Contact message added with ID:', docRef.id);
    res.status(200).json({ message: 'Message sent successfully!', id: docRef.id });
  } catch (error) {
      console.error('Error adding contact message:', error);
      res.status(500).json({ message: 'Failed to send message.', error: error.message });
  }
});

// --- Start the server ---
app.listen(PORT, () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
  console.log(`App ID: ${getAppId()}`);
});

