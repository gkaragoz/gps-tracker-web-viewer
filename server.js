const express = require("express");
const http = require("http");
const cors = require("cors");
const path = require("path");

const app = express();
const server = http.createServer(app);

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public"))); // Serve static assets

// Serve the admin dashboard
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "views", "dashboard.html"));
});

const PORT = 3001;
server.listen(PORT, () => {
    console.log(`Server is running at http://localhost:${PORT}`);
});
