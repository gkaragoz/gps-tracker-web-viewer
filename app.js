const express = require("express");
const http = require("http");
const cors = require("cors");
const path = require("path");

const app = express();
const server = http.createServer(app);

app.use(cors());
app.use(express.json());
app.use(express.static("public"));

// Default route serves index.html
app.get("/", (req, res) => {
	res.sendFile(path.join(__dirname, "public", "index.html"));
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
	console.log(`WebApp is running at http://localhost:${PORT}`);
});
