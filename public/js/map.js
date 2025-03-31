class MapManager {
    constructor(mapElementId, websocketUrl) {
        this.map = L.map(mapElementId).setView([0, 0], 2);
        this.ws = new WebSocket(websocketUrl);

        this.markers = {};
        this.polylines = {};
        this.userColors = {};
        this.userPaths = {};
        this.currentTileLayer = null;

        this.initWebSocket();
    }

    getRandomColor() {
        return `#${Math.floor(Math.random() * 16777215).toString(16)}`;
    }

    setMapView(viewType) {
        if (this.currentTileLayer) {
            this.map.removeLayer(this.currentTileLayer);
        }

        let tileLayerUrl;
        const tileLayerOptions = {
            attribution: '© OpenStreetMap contributors',
        };

        switch (viewType) {
            case 'satellite':
                tileLayerUrl = 'https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}';
                tileLayerOptions.subdomains = ['mt0', 'mt1', 'mt2', 'mt3'];
                break;
            case 'street':
                tileLayerUrl = 'https://{s}.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png';
                break;
            case 'terrain':
                tileLayerUrl = 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png';
                break;
            default:
                console.error('Unknown map view type:', viewType);
                return;
        }

        this.currentTileLayer = L.tileLayer(tileLayerUrl, tileLayerOptions).addTo(this.map);

        const dropdownButton = document.querySelector('.btn-group .dropdown-toggle');
        if (dropdownButton) {
            dropdownButton.textContent = `${viewType.charAt(0).toUpperCase() + viewType.slice(1)} View`;
        }
    }

    zoomToUser(userId) {
        if (this.markers[userId]) {
            const bounds = L.latLngBounds(this.userPaths[userId]);
            this.map.fitBounds(bounds, { animate: true, duration: 1.5 });
        }
    }

    updateUserList() {
        const userList = document.getElementById("users");
        userList.innerHTML = Object.keys(this.markers).map(userId => {
            return `<li><span style="color:${this.userColors[userId]}; font-weight:bold;">&#9679;</span> ` +
                `<button class="btn-locate" onclick="mapManager.zoomToUser('${userId}')">${userId}</button></li>`;
        }).join('');
    }

    handleInitialData(data) {
        data.forEach(entry => {
            const { userId, latitude, longitude } = entry;
            if (!this.userPaths[userId]) this.userPaths[userId] = [];
            this.userPaths[userId].push([latitude, longitude]);
            if (!this.userColors[userId]) this.userColors[userId] = this.getRandomColor();
        });

        Object.keys(this.userPaths).forEach(userId => {
            const path = this.userPaths[userId];
            if (path.length > 1) {
                this.polylines[userId] = L.polyline(path, { color: this.userColors[userId] }).addTo(this.map);
            }
            const lastPosition = path[path.length - 1];
            this.markers[userId] = L.circleMarker(lastPosition, {
                color: this.userColors[userId], radius: 6, fillOpacity: 1
            }).addTo(this.map).bindPopup(`${userId}`);

            this.markers[userId].on('click', () => this.zoomToUser(userId));
        });

        this.updateUserList();
    }

    handleUserUpdate(data) {
        const { userId, latitude, longitude } = data;
        if (!latitude || !longitude) {
            console.error(`❌ Invalid location data for ${userId}`, latitude, longitude);
            return;
        }
        if (!this.userPaths[userId]) this.userPaths[userId] = [];
        this.userPaths[userId].push([latitude, longitude]);
        if (!this.userColors[userId]) this.userColors[userId] = this.getRandomColor();

        if (!this.markers[userId]) {
            this.markers[userId] = L.circleMarker([latitude, longitude], {
                color: this.userColors[userId], radius: 6, fillOpacity: 1
            }).addTo(this.map).bindPopup(`${userId}`);
            this.markers[userId].on('click', () => this.zoomToUser(userId));
        } else {
            this.markers[userId].setLatLng([latitude, longitude]);
            if (this.userPaths[userId].length > 1) {
                if (this.polylines[userId]) this.map.removeLayer(this.polylines[userId]);
                this.polylines[userId] = L.polyline(this.userPaths[userId], { color: this.userColors[userId] }).addTo(this.map);
            }
        }

        this.updateUserList();
    }

    initWebSocket() {
        this.ws.onmessage = event => {
            try {
                const data = JSON.parse(event.data);
                console.log("WebSocket message received", data);

                if (data.type === "initialData") {
                    console.log("📤 Initial data received:", data.data);
                    this.handleInitialData(data.data);
                } else if (data.type === "userUpdate") {
                    console.log("📍 Live update received:", data.data);
                    this.handleUserUpdate(data.data);
                }
            } catch (error) {
                console.error("❌ Error processing WebSocket message:", error);
            }
        };
    }

    loadKML(file) {
        const reader = new FileReader();
        reader.onload = (event) => {
            const parser = new DOMParser();
            const kml = parser.parseFromString(event.target.result, "text/xml");
            try {
                const kmlLayer = new L.KML(kml); // Use the leaflet-kml plugin
                this.map.addLayer(kmlLayer);
                this.map.fitBounds(kmlLayer.getBounds());

                // Get the name of the KML file from the <name> tag
                const kmlName = kml.querySelector("name")?.textContent || file.name;

                // Add the KML file to the list
                this.addKMLToList(kmlName, kmlLayer);
            } catch (error) {
                console.error("Error loading KML:", error);
                alert("Failed to load the KML file. Please ensure the file is valid.");
            }
        };
        reader.readAsText(file);
    }

    addKMLToList(kmlName, kmlLayer) {
        const kmlFilesList = document.getElementById("kmlFiles");
        const listItem = document.createElement("li");
        listItem.textContent = kmlName;
        listItem.style.cursor = "pointer";
        listItem.addEventListener("click", () => {
            this.map.fitBounds(kmlLayer.getBounds()); // Zoom to the KML layer
        });
        kmlFilesList.appendChild(listItem);
    }

    initKMLUpload(kmlUploadId, kmlFilesListId) {
        const kmlUpload = document.getElementById(kmlUploadId);
        const kmlFilesList = document.getElementById(kmlFilesListId);

        kmlUpload.addEventListener("change", (event) => {
            const file = event.target.files[0];
            if (file && file.name.endsWith(".kml")) {
                this.loadKML(file);
            } else {
                alert("Please upload a valid .kml file");
            }
        });
    }
}

// Initialize the MapManager
const mapManager = new MapManager('map', "wss://gps-tracker-server-lls2.onrender.com");
document.addEventListener("DOMContentLoaded", () => {
    mapManager.setMapView('satellite'); // Default view
    mapManager.initKMLUpload("kmlUpload", "kmlFiles");
});