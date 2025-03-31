class MapManager {
    constructor(mapElementId, websocketUrl) {
        this.map = L.map(mapElementId).setView([0, 0], 2);
        this.ws = new WebSocket(websocketUrl);

        this.markers = {};
        this.polylines = {};
        this.userColors = {};
        this.userPaths = {};
        this.currentTileLayer = null;
        this.kmlFiles = [];

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
        const userTableBody = document.querySelector("#users tbody");
        userTableBody.innerHTML = ""; // Clear existing rows

        Object.keys(this.markers).forEach((userId, index) => {
            const color = this.userColors[userId];
            const marker = this.markers[userId];

            // Create a table row
            const row = document.createElement("tr");
            row.dataset.userId = userId; // Add data-user-id attribute

            // Number column
            const numberCell = document.createElement("td");
            numberCell.textContent = index + 1; // Row index
            row.appendChild(numberCell);

            // Visibility column
            const visibilityCell = document.createElement("td");
            const checkbox = document.createElement("input");
            checkbox.type = "checkbox";
            checkbox.checked = true;
            checkbox.addEventListener("change", () => {
                this.toggleUserVisibility(userId, checkbox.checked);
            });
            visibilityCell.appendChild(checkbox);
            row.appendChild(visibilityCell);

            // Color column
            const colorCell = document.createElement("td");
            colorCell.innerHTML = `<span style="color:${color}; font-weight:bold;">&#9679;</span>`;
            row.appendChild(colorCell);

            // Uid column
            const uidCell = document.createElement("td");
            uidCell.textContent = userId;
            row.appendChild(uidCell);

            // Add event listeners for row interactions
            row.addEventListener("mouseover", () => {
                row.classList.add("table-active"); // Highlight row
            });

            row.addEventListener("mouseout", () => {
                row.classList.remove("table-active"); // Remove highlight
            });

            row.addEventListener("click", (event) => {
                if (!event.target.matches('input[type="checkbox"]')) {
                    const bounds = L.latLngBounds(this.userPaths[userId]);
                    this.map.fitBounds(bounds, { animate: true, duration: 1.5 });
                }
            });

            // Append the row to the table body
            userTableBody.appendChild(row);
        });
    }

    toggleUserVisibility(userId, isVisible) {
        if (isVisible) {
            this.map.addLayer(this.markers[userId]); // Show the marker
            if (this.polylines[userId]) {
                this.map.addLayer(this.polylines[userId]); // Show the polyline
            }
        } else {
            this.map.removeLayer(this.markers[userId]); // Hide the marker
            if (this.polylines[userId]) {
                this.map.removeLayer(this.polylines[userId]); // Hide the polyline
            }
        }
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

    toggleKMLVisibility(kmlIndex, placemarkIndex, isVisible) {
        const kmlFile = this.kmlFiles[kmlIndex];
        if (!kmlFile || !kmlFile.layers[placemarkIndex]) {
            console.error(`Placemark at index ${placemarkIndex} in KML file ${kmlIndex} not found.`);
            return;
        }
    
        const layer = kmlFile.layers[placemarkIndex];
        if (isVisible) {
            this.map.addLayer(layer); // Show the placemark
        } else {
            this.map.removeLayer(layer); // Hide the placemark
        }
    }

    loadKML(file) {
        const reader = new FileReader();
        reader.onload = (event) => {
            const parser = new DOMParser();
            const kml = parser.parseFromString(event.target.result, "text/xml");
            try {
                const placemarks = Array.from(kml.getElementsByTagName("Placemark"));
                const placemarkLayers = placemarks.map((placemark) => {
                    const coordinates = placemark.getElementsByTagName("coordinates")[0]?.textContent.trim();
                    if (coordinates) {
                        const latLngs = coordinates.split(" ").map(coord => {
                            const [lng, lat] = coord.split(",").map(Number);
                            return [lat, lng];
                        });
    
                        // Create a polygon for the placemark with fill color
                        if (latLngs.length > 2) {
                            return L.polygon(latLngs, {
                                color: 'blue', // Border color
                                fillColor: 'blue', // Fill color
                                fillOpacity: 0.05 // Opacity of the fill
                            }).bindPopup(placemark.getElementsByTagName("name")[0]?.textContent || "Placemark");
                        } else if (latLngs.length === 1) {
                            // Create a marker for single-point placemarks
                            return L.marker(latLngs[0]).bindPopup(placemark.getElementsByTagName("name")[0]?.textContent || "Placemark");
                        }
                    }
                    return null;
                }).filter(layer => layer !== null);
    
                // Store the placemarks and their layers
                const kmlName = kml.querySelector("name")?.textContent || file.name;
                this.kmlFiles.push({ name: kmlName, placemarks, layers: placemarkLayers });
    
                // Add all placemark layers to the map
                placemarkLayers.forEach(layer => this.map.addLayer(layer));

                // Calculate and fit the map to the combined bounds of all placemark layers
                if (placemarkLayers.length > 0) {
                    const combinedBounds = L.latLngBounds([]);
                    placemarkLayers.forEach(layer => {
                        if (layer.getBounds) {
                            combinedBounds.extend(layer.getBounds());
                        } else if (layer.getLatLng) {
                            combinedBounds.extend(layer.getLatLng());
                        }
                    });
                    this.map.fitBounds(combinedBounds);
                }

                // Populate the KML table
                this.populateKMLTable();
            } catch (error) {
                console.error("Error loading KML:", error);
                alert("Failed to load the KML file. Please ensure the file is valid.");
            }
        };
        reader.readAsText(file);
    }

    populateKMLTable() {
        const kmlTableBody = document.querySelector("#kml-table tbody");
        kmlTableBody.innerHTML = ""; // Clear existing rows to avoid duplicates
    
        // Iterate over all KML files stored in this.kmlFiles
        this.kmlFiles.forEach((kmlFile, fileIndex) => {
            kmlFile.placemarks.forEach((placemark, index) => {
                const id = placemark.getAttribute("id") || `Placemark-${fileIndex + 1}-${index + 1}`;
                const name = placemark.getElementsByTagName("name")[0]?.textContent || "N/A";
    
                // Create a table row
                const row = document.createElement("tr");
                row.dataset.placemarkId = id; // Add data-placemark-id attribute
    
                // Number column
                const numberCell = document.createElement("td");
                numberCell.textContent = kmlTableBody.rows.length + 1; // Increment row index
                row.appendChild(numberCell);
    
                // Visibility column
                const visibilityCell = document.createElement("td");
                const checkbox = document.createElement("input");
                checkbox.type = "checkbox";
                checkbox.checked = true; // Default to visible
                checkbox.addEventListener("change", () => {
                    this.toggleKMLVisibility(fileIndex, index, checkbox.checked);
                });
                visibilityCell.appendChild(checkbox);
                row.appendChild(visibilityCell);
    
                // Name column
                const nameCell = document.createElement("td");
                nameCell.textContent = name;
                row.appendChild(nameCell);
    
                // Add event listeners for row interactions
                row.addEventListener("mouseover", () => {
                    row.classList.add("table-active"); // Highlight row
                });
    
                row.addEventListener("mouseout", () => {
                    row.classList.remove("table-active"); // Remove highlight
                });
    
                row.addEventListener("click", (event) => {
                    // Prevent click event if the target is the checkbox
                    if (event.target.matches('input[type="checkbox"]')) {
                        return;
                    }
    
                    // Fit bounds to the placemark area
                    const coordinates = placemark.getElementsByTagName("coordinates")[0]?.textContent.trim();
                    if (coordinates) {
                        const latLngs = coordinates.split(" ").map(coord => {
                            const [lng, lat] = coord.split(",").map(Number);
                            return [lat, lng];
                        });
    
                        if (latLngs.length > 0) {
                            const bounds = L.latLngBounds(latLngs);
                            this.map.fitBounds(bounds, { animate: true, duration: 1.5 });
                        }
                    }
                });
    
                // Append the row to the table body
                kmlTableBody.appendChild(row);
            });
        });
    }

    initKMLUpload(kmlUploadId) {
        const kmlUpload = document.getElementById(kmlUploadId);

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