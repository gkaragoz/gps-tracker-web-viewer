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