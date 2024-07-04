const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const session = require('express-session');
const bodyParser = require('body-parser');
const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');

const app = express();
const port = 3000;

// SQLite database setup
const db = new sqlite3.Database('users.db', (err) => {1
    if (err) {
        console.error(err.message);
    } else {
        console.log('Connected to the users database');
        // Create user table if not exists
        db.run(`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL,
            password TEXT NOT NULL,
            profilePic TEXT
        )`);

        // Create chat history table if not exists
        db.run(`CREATE TABLE IF NOT EXISTS chat_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            sender TEXT NOT NULL,
            message TEXT NOT NULL
        )`);

        // Create financial crime articles table if not exists
        db.run(`CREATE TABLE IF NOT EXISTS financial_crime_articles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            content TEXT NOT NULL
        )`);
    }
});

// Express session setup
app.use(session({
    secret: 'your-secret-key', // Change this to a secret key for session management
    resave: false,
    saveUninitialized: true
}));

app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use(bodyParser.json());

// Middleware function to check if the user is authenticated
const authenticateUser = (req, res, next) => {
    // You need to implement user authentication logic here
    // For simplicity, let's assume a user is authenticated if a session variable is set
    if (req.session && req.session.userId) {
        // Fetch user's chat history from the database
        db.all('SELECT * FROM chat_history WHERE user_id = ?', [req.session.userId], (err, rows) => {
            if (err) {
                console.error('Error fetching chat history:', err);2
                return res.status(500).send('Internal Server Error');
            }
            // Attach chat history to the request object
            req.chatHistory = rows;
            return next();
        });
    } else {
        return res.redirect('/login.html');
    }
};

// Routes

// Home route
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/home.html');
});

// Registration route
app.get('/register', (req, res) => {
    res.sendFile(__dirname + '/public/registration.html');
});

// Login route
app.get('/login', (req, res) => {
    res.sendFile(__dirname + '/public/login.html');
});

// Dashboard route with authentication middleware
app.get('/dashboard', authenticateUser, (req, res) => {
    res.render(__dirname + '/public/dashboard.html', { chatHistory: req.chatHistory });
});

// Profile route with authentication middleware
app.get('/profile', authenticateUser, (req, res) => {
    res.sendFile(__dirname + '/public/profile.html');
});

// History route with authentication middleware
app.get('/history', authenticateUser, (req, res) => {
    res.sendFile(__dirname + '/public/history.html');
});

// Logout route
app.get('/logout', (req, res) => {
    // Destroy the session to log out the user
    req.session.destroy((err) => {
        if (err) {
            console.error(err.message);
        }
        res.redirect('/');
    });
});

// Update Profile route
app.post('/update-profile', authenticateUser, (req, res) => {
    const userId = req.session.userId;
    const { password, profilePic } = req.body;

    // Update user profile in the database
    db.run('UPDATE users SET password = ?, profilePic = ? WHERE id = ?', [password, profilePic, userId], (err) => {
        if (err) {
            res.status(500).json({ success: false, message: 'Error updating profile' });
        } else {
            res.json({ success: true, message: 'Profile updated successfully' });
        }
    });
});

// Save chat history route
app.post('/save-chat-history', authenticateUser, (req, res) => {
    const { userMessage, chatbotResponse } = req.body;

    // Save the chat history to the database
    db.run('INSERT INTO chat_history (user_id, sender, message) VALUES (?, ?, ?)', [req.session.userId, 'User', userMessage], (err) => {
        if (err) {
            console.error('Error saving user message to chat history:', err);
            return res.status(500).json({ success: false });
        }

        db.run('INSERT INTO chat_history (user_id, sender, message) VALUES (?, ?, ?)', [req.session.userId, 'Chatbot', chatbotResponse], (err) => {
            if (err) {
                console.error('Error saving chatbot response to chat history:', err);
                return res.status(500).json({ success: false });
            }

            return res.status(200).json({ success: true });
        });
    });
});

// Chatbot route
app.post('/chatbot', (req, res) => {
    const userMessage = req.body.message;
    const chatbotResponse = getChatbotResponse(userMessage);
    res.json({ message: chatbotResponse });
});

// Financial crime articles route
app.get('/collect-financial-crime-articles', async (req, res) => {
    try {
        // Scrape financial crime articles from the provided URL
        const articles = await scrapeFinancialCrimeArticles('https://www.malaymail.com/');

        // Save the articles to the database
        articles.forEach(article => {
            db.run('INSERT INTO financial_crime_articles (title, content) VALUES (?, ?)', [article.title, article.content], (err) => {
                if (err) {
                    console.error('Error saving financial crime article to the database:', err);
                }
            });
        });

        res.status(200).json({ success: true, message: 'Financial crime articles collected and saved successfully.' });
    } catch (error) {
        console.error('Error collecting financial crime articles:', error);
        res.status(500).json({ success: false, message: 'Internal server error.' });
    }
});

// Function to scrape financial crime articles from a given URL
async function scrapeFinancialCrimeArticles(url) {
    const response = await axios.get(url);
    const $ = cheerio.load(response.data);

    const articles = [];
    $('article').each((index, element) => {
        const title = $(element).find('h2').text().trim();
        const content = $(element).find('.article-content').text().trim();

        articles.push({
            title: title,
            content: content
        });
    });

    return articles;
}

// Function to get chatbot response based on user input
function getChatbotResponse(userMessage) {
    // Simple rule-based responses
    if (userMessage.toLowerCase().includes('hello')) {
        return 'Hello! How can I help you today?';
    } else if (userMessage.toLowerCase().includes('goodbye')) {
        return 'Goodbye! Have a great day!';
    } else {
        // NLP-based response using financial crime articles
        const response = processUserMessage(userMessage);
        return response || "I'm sorry, I didn't understand that. Can you please rephrase?";
    }
}

// Function to process user message using financial crime articles
function processUserMessage(userMessage) {
    // Retrieve financial crime articles from the database
    const articles = db.all('SELECT * FROM financial_crime_articles');

    // Convert the result to an array
    const articlesArray = Array.from(articles);

    // Implement your logic to analyze user message and provide relevant information from articles
    // For simplicity, this example checks if the user message contains any article title
    const matchingArticle = articlesArray.find(article => userMessage.toLowerCase().includes(article.title.toLowerCase()));

    if (matchingArticle) {
        return `I found information related to your query:\nTitle: ${matchingArticle.title}\nContent: ${matchingArticle.content}`;
    } else {
        return null; // No relevant information found
    }
}


app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});
