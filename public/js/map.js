const ws = new WebSocket("wss://gps-tracker-server-lls2.onrender.com");
const map = L.map('map').setView([0, 0], 2);

const markers = {};
const polylines = {};
const userColors = {};
const userPaths = {}; // Store each user's full path

L.tileLayer('https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', {
    subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
    attribution: '© Google Maps'
}).addTo(map);

const getRandomColor = () => `#${Math.floor(Math.random() * 16777215).toString(16)}`;

function zoomToUser(userId) {
    if (markers[userId]) {
        map.flyTo(markers[userId].getLatLng(), 16, { animate: true, duration: 1.5 });
    }
}

function updateUserList() {
    const userList = document.getElementById("users");
    userList.innerHTML = Object.keys(markers).map(userId => {
        return `<li><span style="color:${userColors[userId]}; font-weight:bold;">&#9679;</span> ` +
            `<button class="btn-locate" onclick="zoomToUser('${userId}')">${userId}</button></li>`;
    }).join('');
}

ws.onmessage = event => {
    try {
        const data = JSON.parse(event.data);
        console.log("WebSocket message received", data);

        if (data.type === "initialData") {
            console.log("📤 Initial data received:", data.data);
            
            data.data.forEach(entry => {
                const { userId, latitude, longitude, timestamp } = entry;
                if (!userPaths[userId]) userPaths[userId] = [];
                userPaths[userId].push([latitude, longitude]);
                if (!userColors[userId]) userColors[userId] = getRandomColor();
            });

            Object.keys(userPaths).forEach(userId => {
                const path = userPaths[userId];
                if (path.length > 1) {
                    polylines[userId] = L.polyline(path, { color: userColors[userId] }).addTo(map);
                }
                const lastPosition = path[path.length - 1];
                markers[userId] = L.circleMarker(lastPosition, {
                    color: userColors[userId], radius: 6, fillOpacity: 1
                }).addTo(map).bindPopup(`${userId}`);

                markers[userId].on('click', () => zoomToUser(userId));
            });
            updateUserList();
        }
        else if (data.type === "userUpdate") {
            console.log("📍 Live update received:", data.data);
            let { userId, latitude, longitude, timestamp } = data.data;
            if (!latitude || !longitude) {
                console.error(`❌ Invalid location data for ${userId}`, latitude, longitude, timestamp);
                return;
            }
            if (!userPaths[userId]) userPaths[userId] = [];
            userPaths[userId].push([latitude, longitude]);
            if (!userColors[userId]) userColors[userId] = getRandomColor();
            if (!markers[userId]) {
                markers[userId] = L.circleMarker([latitude, longitude], {
                    color: userColors[userId], radius: 6, fillOpacity: 1
                }).addTo(map).bindPopup(`${userId}`);
                markers[userId].on('click', () => zoomToUser(userId));
            } else {
                markers[userId].setLatLng([latitude, longitude]);
                if (userPaths[userId].length > 1) {
                    if (polylines[userId]) map.removeLayer(polylines[userId]);
                    polylines[userId] = L.polyline(userPaths[userId], { color: userColors[userId] }).addTo(map);
                }
            }
            updateUserList();
        }
    } catch (error) {
        console.error("❌ Error processing WebSocket message:", error);
    }
};

const loadKML = (file) => {
    const reader = new FileReader();
    reader.onload = (event) => {
        const parser = new DOMParser();
        const kml = parser.parseFromString(event.target.result, "text/xml");
        try {
            const kmlLayer = new L.KML(kml); // Use the leaflet-kml plugin
            kmlLayer.on("loaded", () => {
                map.fitBounds(kmlLayer.getBounds()); // Fit map to KML bounds
            });
            map.addLayer(kmlLayer);
        } catch (error) {
            console.error("Error loading KML:", error);
            alert("Failed to load the KML file. Please ensure the file is valid.");
        }
    };
    reader.readAsText(file);
};

document.getElementById("kmlUpload").addEventListener("change", (event) => {
    const file = event.target.files[0];
    if (file && file.name.endsWith(".kml")) {
        loadKML(file);
    } else {
        alert("Please upload a valid .kml file");
    }
});

document.addEventListener("DOMContentLoaded", function () {
    if (!map) { // Check if the map is already initialized
        map = L.map("map").setView([0, 0], 2); // Initialize map
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            maxZoom: 19,
        }).addTo(map);
    }

    const kmlUpload = document.getElementById("kmlUpload");
    const kmlFilesList = document.getElementById("kmlFiles");

    kmlUpload.addEventListener("change", function (event) {
        const file = event.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = function (e) {
                const kmlText = e.target.result;
                const parser = new DOMParser();
                const kmlDoc = parser.parseFromString(kmlText, "application/xml");

                // Parse KML and add to map
                const kmlLayer = new L.KML(kmlDoc);
                map.addLayer(kmlLayer);

                // Get the name of the KML file from the <name> tag
                const kmlName = kmlDoc.querySelector("name")?.textContent || file.name;

                // Add the KML file to the list
                const listItem = document.createElement("li");
                listItem.textContent = kmlName;
                listItem.style.cursor = "pointer";
                listItem.addEventListener("click", function () {
                    const bounds = kmlLayer.getBounds();
                    map.fitBounds(bounds); // Zoom to the KML layer
                });
                kmlFilesList.appendChild(listItem);
            };
            reader.readAsText(file);
        }
    });
});