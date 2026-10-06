import { io } from "socket.io-client";

class DriverSocketService {
  constructor(serverUrl, tripId) {
    this.socket = io(serverUrl);
    this.tripId = tripId;
    this.socket.emit("join_trip_room", tripId);
  }

  acceptTripOffer(driverId) {
    this.socket.emit("driver_accept", { tripId: this.tripId, driverId });
  }

  streamLiveGPS(latitude, longitude, bearing) {
    this.socket.emit("update_gps", { tripId: this.tripId, latitude, longitude, bearing });
  }

  updateTripState(newStatus) {
    this.socket.emit("trip_state_update", { tripId: this.tripId, newStatus });
  }

  disconnect() {
    this.socket.disconnect();
  }
}

export default DriverSocketService;
