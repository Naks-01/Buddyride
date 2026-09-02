import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { RoleSelect } from './pages/RoleSelect'
import Login from './pages/Login'
import { PassengerRides } from './pages/PassengerRides'
import { RideStatus } from './pages/RideStatus'
import { Profile } from './pages/Profile'
import DriverDashboard from './pages/DriverDashboard'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<RoleSelect />} />
        <Route path="/login" element={<Login />} />
        <Route path="/passenger" element={<PassengerRides />} />
        <Route path="/dashboard/passenger" element={<PassengerRides />} />
        <Route path="/driver" element={<DriverDashboard />} />
        <Route path="/dashboard/driver" element={<DriverDashboard />} />
        <Route path="/ride-status/:id" element={<RideStatus />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
