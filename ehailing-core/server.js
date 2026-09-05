const express = require("express");
const { createServer } = require("http");
const { Server } = require("socket.io");

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: "*" } });

const activeTrips = new Map();

io.on("connection", (socket) => {
  socket.on("join_trip_room", (tripId) => {
    socket.join(`trip_${tripId}`);
  });

  socket.on("request_ride", (payload) => {
    io.emit("broadcast_ride_offer", payload);
  });

  socket.on("driver_accept", (payload) => {
    const { tripId } = payload;
    activeTrips.set(tripId, { driverSocket: socket.id, status: "accepted" });
    io.to(`trip_${tripId}`).emit("trip_status_changed", { status: "driver_en_route", payload });
  });

  socket.on("update_gps", (payload) => {
    const { tripId, latitude, longitude, bearing } = payload;
    io.to(`trip_${tripId}`).emit("gps_stream_received", { latitude, longitude, bearing });
  });

  socket.on("trip_state_update", (payload) => {
    const { tripId, newStatus } = payload;
    io.to(`trip_${tripId}`).emit("trip_status_changed", { status: newStatus });
    if (newStatus === "completed") {
      io.in(`trip_${tripId}`).socketsLeave(`trip_${tripId}`);
      activeTrips.delete(tripId);
    }
  });
});

httpServer.listen(3000);
