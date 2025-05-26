// server.js - Your Node.js/Express Backend

// --- Module Imports ---
const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin'); // For Firebase Firestore
const sgMail = require('@sendgrid/mail'); // NEW: For SendGrid email notifications

// --- Initialize Express App ---
const app = express();
const PORT = process.env.PORT || 3001; // Use PORT from environment or default to 3001

// --- Middleware ---
app.use(cors()); // Enable CORS for all routes
app.use(express.json()); // Enable JSON body parsing for incoming requests

// --- Firebase Admin SDK Initialization ---
let db; // Declare db here so it's accessible throughout the file

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
        // You MUST have a service account JSON file at this path for local development
        serviceAccount = require('./my-personal-website-backend-firebase-adminsdk-fbsvc-1598fcc9cd.json'); // <--- Make sure this path is correct for your local key
        console.log("Firebase Admin SDK initialized using local service account key.");
    }

    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
    console.log('Firebase Admin SDK initialized successfully.'); // More general success message

    db = admin.firestore(); // Initialize Firestore ONLY after successful app initialization

} catch (error) {
    console.error("Failed to initialize Firebase Admin SDK:", error);
    process.exit(1); // Exit if Firebase initialization fails
}

// --- SendGrid API Key Setup ---
// This must be done after the sgMail module is required
if (process.env.SENDGRID_API_KEY) {
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);
    console.log('SendGrid API Key loaded.');
} else {
    console.error('SENDGRID_API_KEY environment variable is not set. Email notifications will not work.');
}


// --- Firestore Helper for dynamic app_id ---
// In the Canvas environment, __app_id is automatically provided.
// For local development, you can set a default or use an environment variable.
const getAppId = () => {
    return typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
};

// --- API Routes ---

// GET /api/portfolio - Fetch portfolio items (existing route)
app.get('/api/portfolio', async (req, res) => {
    try {
        if (!db) {
            return res.status(500).json({ message: 'Firebase not initialized.' });
        }
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

// NEW: Route to handle contact form submissions
app.post('/api/contact', async (req, res) => {
    // Destructure data from the request body
    const { name, email, message } = req.body;

    // Basic validation to ensure all required fields are present
    if (!name || !email || !message) {
        return res.status(400).json({ message: 'Please fill in all required fields (name, email, message).' });
    }

    try {
        // Ensure Firebase Firestore is initialized before attempting to save
        if (!db) {
            console.error('Firestore database is not initialized. Cannot save message.');
            return res.status(500).json({ message: 'Server error: Database not ready.' });
        }

        const appId = getAppId(); // Get the app ID for the collection path

        // 1. Save the message to Firebase Firestore
        const docRef = await db.collection(`artifacts/${appId}/public/data/contactMessages`).add({ // Updated collection path
            name,
            email,
            message,
            timestamp: admin.firestore.FieldValue.serverTimestamp() // Add a server-generated timestamp
        });
        console.log('Contact message saved to Firestore with ID:', docRef.id);

        // 2. Send an email notification using SendGrid
        // Ensure SendGrid API key is loaded before attempting to send
        if (!process.env.SENDGRID_API_KEY) {
            console.warn('SendGrid API key not found. Skipping email notification.');
            // Proceed without sending email, but inform the client it was saved
            return res.status(200).json({ message: 'Message saved, but email notification skipped (API key missing).' });
        }

        const msg = {
            to: 'sudarshansapkota170@gmail.com', // Your actual email to receive notifications
            from: 'sudarshansapkota170@gmail.com', // The email you VERIFIED in SendGrid
            subject: `New Contact Message from ${name} (Portfolio Website)`, // Subject line for the email
            html: `
                <p>You have received a new message from your portfolio website:</p>
                <p><strong>Name:</strong> ${name}</p>
                <p><strong>Email:</strong> ${email}</p>
                <p><strong>Message:</strong><br>${message.replace(/\n/g, '<br>')}</p>
                <p><em>Received at: ${new Date().toLocaleString()}</em></p>
                <p>Please log in to your Firebase console to view all messages in the 'contactMessages' collection under 'artifacts/${appId}/public/data'.</p>
            `, // HTML content of the email
        };

        await sgMail.send(msg); // Send the email
        console.log('Email notification sent successfully!');

        // Respond to the frontend that the message was processed
        res.status(200).json({ message: 'Message sent and notification email dispatched!' });

    } catch (error) {
        // Log any errors that occur during the process (saving to Firestore or sending email)
        console.error('Error processing contact form submission:', error);

        // Provide more detail if it's a SendGrid error
        if (error.code && error.code === 401) {
            console.error('SendGrid Authentication Error: Check your API Key.');
        } else if (error.response && error.response.body && error.response.body.errors) {
            console.error('SendGrid Specific Error Details:', error.response.body.errors);
        }

        // Send an appropriate error response to the frontend
        res.status(500).json({ message: 'Failed to send message. Please try again later.' });
    }
});


// --- Start the server ---
app.listen(PORT, () => {
    console.log(`Backend server running on http://localhost:${PORT}`);
    console.log(`App ID: ${getAppId()}`);
});
