import { io } from "socket.io-client";

class PassengerSocketService {
  constructor(serverUrl, tripId) {
    this.socket = io(serverUrl);
    this.tripId = tripId;
    this.socket.emit("join_trip_room", tripId);
  }

  requestNewRide(passengerId, pickup, dropoff) {
    this.socket.emit("request_ride", { tripId: this.tripId, passengerId, pickup, dropoff });
  }

  listenForDriverStatus(onStatusUpdate) {
    this.socket.on("trip_status_changed", onStatusUpdate);
  }

  listenForDriverGPS(onGpsUpdate) {
    this.socket.on("gps_stream_received", onGpsUpdate);
  }

  disconnect() {
    this.socket.disconnect();
  }
}

export default PassengerSocketService;
