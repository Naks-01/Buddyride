export type Lang = 'en' | 'nso';

type Dict = Record<string, { en: string; nso: string }>;

const dict: Dict = {
  // App
  appName: { en: 'BuddyRide1', nso: 'BuddyRide1' },
  tagline: { en: 'eHailing for Limpopo', nso: 'Ehailing ya Limpopo' },

  // Language
  english: { en: 'English', nso: 'Seseyaposing' },
  sepedi: { en: 'Sepedi', nso: 'Sepedi' },

  // Roles
  passenger: { en: 'Passenger', nso: 'Mofeti' },
  driver: { en: 'Driver', nso: 'Mofeti wa koloi' },
  admin: { en: 'Admin', nso: 'Molaodi' },

  // Auth
  login: { en: 'Login', nso: 'Tsena' },
  logout: { en: 'Logout', nso: 'Etšwa' },
  phoneNumber: { en: 'Phone Number', nso: 'Nomoro ya mogala' },
  enterPhone: { en: 'Enter your phone number', nso: 'Tsenya nomoro ya gago ya mogala' },
  sendOtp: { en: 'Send Code', nso: 'Romela khoutu' },
  enterOtp: { en: 'Enter the 6-digit code', nso: 'Tsenya khoutu ya dia-6' },
  verifyOtp: { en: 'Verify', nso: 'Netefatša' },
  email: { en: 'Email', nso: 'Imeyile' },
  password: { en: 'Password', nso: 'Phasewete' },
  adminLogin: { en: 'Admin Login', nso: 'Tsena bjalo ka molaodi' },
  selectRole: { en: 'Select your role', nso: 'Kgetha maikarabelo ya gago' },
  resendCode: { en: 'Resend Code', nso: 'Romela khoutu gape' },
  fullName: { en: 'Full Name', nso: 'Leina ka botlalo' },

  // Passenger
  whereTo: { en: 'Where to?', nso: 'O ya kae?' },
  setPickup: { en: 'Set Pickup', nso: 'Beakanya moo o tšiwago' },
  setDropoff: { en: 'Set Drop-off', nso: 'Beakanya moo o fihlago' },
  pickup: { en: 'Pickup', nso: 'Moo o tšiwago' },
  dropoff: { en: 'Drop-off', nso: 'Moo o fihlago' },
  fareEstimate: { en: 'Fare Estimate', nso: 'Tekanyo ya tšhelete' },
  requestRide: { en: 'Request Ride', nso: 'Kgopa potego' },
  findDriver: { en: 'Find Driver', nso: 'Nyaka mofeti' },
  cancelRide: { en: 'Cancel Ride', nso: 'Khansela potego' },
  findingDriver: { en: 'Finding your driver...', nso: 'Nyaka mofeti wa koloi...' },
  driverEnRoute: { en: 'Your driver is on the way', nso: 'Mofeti wa gago o tsamaya' },
  tripHistory: { en: 'Trip History', nso: 'Histori ya maeto' },
  noTrips: { en: 'No trips yet', nso: 'Ga gona maeto' },
  driverArriving: { en: 'Driver arriving', nso: 'Mofeti o fihla' },
  driverArrived: { en: 'Driver has arrived', nso: 'Mofeti o fihlile' },
  tripInProgress: { en: 'Trip in progress', nso: 'Eto e tsamaya' },
  tripCompleted: { en: 'Trip completed', nso: 'Eto e feditšwe' },

  // Payment
  payment: { en: 'Payment', nso: 'Tšhelete' },
  payCash: { en: 'Pay Cash', nso: 'Lefša ka tšhelete' },
  payCard: { en: 'Pay with Card', nso: 'Lefša ka kerete' },
  cashPending: { en: 'Cash Pending', nso: 'Tšhelete e sa lebeletšwe' },
  cardComingSoon: { en: 'Card Payment Coming Soon', nso: 'Pelefiso ya kerete e tla kwano' },
  cashToCollect: { en: 'Cash to Collect', nso: 'Tšhelete ya go e loka' },
  confirmCashReceived: { en: 'Confirm Cash Received', nso: 'Netefatša tšhelete e amogilwego' },
  totalCashCollected: { en: 'Total Cash Collected', nso: 'Tšhelete yotlhe e amogilwego' },
  totalCard: { en: 'Total Card', nso: 'Kerete yotlhe' },
  paymentStatus: { en: 'Payment Status', nso: 'Maemo a tšhelete' },
  paid: { en: 'Paid', nso: 'E lefilwe' },
  pending: { en: 'Pending', nso: 'E sa lebantšwe' },
  cashTrips: { en: 'Cash Trips', nso: 'Maeto a tšhelete' },
  cardTrips: { en: 'Card Trips', nso: 'Maeto a kerete' },

  // Driver
  goOnline: { en: 'Go Online', nso: 'Eya inthaneteng' },
  goOffline: { en: 'Go Offline', nso: 'Etšwa inthaneteng' },
  online: { en: 'Online', nso: 'Inthaneteng' },
  offline: { en: 'Offline', nso: 'Sa se inthaneteng' },
  newRideRequest: { en: 'New Ride Request!', nso: 'Ptego ye ntšha ya eto!' },
  accept: { en: 'Accept', nso: 'Amogela' },
  decline: { en: 'Decline', nso: 'Gana' },
  navigate: { en: 'Navigate', nso: 'Tatašiša' },
  arrived: { en: 'Arrived', nso: 'O fihlile' },
  startTrip: { en: 'Start Trip', nso: 'Thoma eto' },
  completeTrip: { en: 'Complete Trip', nso: 'Fetsa eto' },
  earnings: { en: 'Earnings', nso: 'Tšhelete yeo e hweditšwego' },
  dailyEarnings: { en: "Today's Earnings", nso: 'Tšhelete ya lehono' },
  noRequests: { en: 'No ride requests', nso: 'Ga gona dipetego' },
  vehiclePlate: { en: 'Vehicle Plate', nso: 'Pulete ya koloi' },
  vehicleModel: { en: 'Vehicle Model', nso: 'Setswerpe sa koloi' },

  // Admin
  dashboard: { en: 'Dashboard', nso: 'Tše bontšhitšwego' },
  approveDrivers: { en: 'Approve Drivers', nso: 'Amogela bafeti ba dikoloi' },
  liveTrips: { en: 'Live Trips', nso: 'Maeto a go swama' },
  pricing: { en: 'Pricing', nso: 'Tekanyo ya tšhelete' },
  commission: { en: 'Commission %', nso: 'Pakene ya khomishene' },
  totalTrips: { en: 'Total Trips', nso: 'Maeto yotlhe' },
  totalCommission: { en: 'Total Commission', nso: 'Khomishene yotlhe' },
  pendingApproval: { en: 'Pending Approval', nso: 'Go sa amogelwe' },
  approved: { en: 'Approved', nso: 'Go amogilwe' },
  rejected: { en: 'Rejected', nso: 'Go gannywe' },
  approve: { en: 'Approve', nso: 'Amogela' },
  reject: { en: 'Reject', nso: 'Gana' },
  uploadDocuments: { en: 'Upload Documents', nso: 'Lokela ditokumente' },
  baseFare: { en: 'Base Fare', nso: 'Tšhelete ya motheo' },
  perKm: { en: 'Per KM', nso: 'Ka KM' },
  save: { en: 'Save', nso: 'Boloka' },
  totalRevenue: { en: 'Total Revenue', nso: 'Tšhelete yotlhe' },
  activeTrips: { en: 'Active Trips', nso: 'Maeto a go swama' },
  driverName: { en: 'Driver', nso: 'Mofeti' },
  passengerName: { en: 'Passenger', nso: 'Mofeti wa eto' },
  documents: { en: 'Documents', nso: 'Ditokumente' },
  idDocument: { en: 'ID Document', nso: 'Tokumente ya tlotagobalo' },
  driverLicense: { en: "Driver's License", nso: 'Laesense ya go feta' },
  prdp: { en: 'PrDP', nso: 'PrDP' },
  vehiclePapers: { en: 'Vehicle Papers', nso: 'Dipereka tša koloi' },

  // Common
  cancel: { en: 'Cancel', nso: 'Khansela' },
  close: { en: 'Close', nso: 'Tswalela' },
  loading: { en: 'Loading...', nso: 'Go hirwa...' },
  error: { en: 'Error', nso: 'Phoso' },
  retry: { en: 'Retry', nso: 'Leka gape' },
  back: { en: 'Back', nso: 'Morago' },
  km: { en: 'km', nso: 'km' },
  rand: { en: 'R', nso: 'R' },
  confirm: { en: 'Confirm', nso: 'Netefatša' },
  yes: { en: 'Yes', nso: 'Ee' },
  no: { en: 'No', nso: 'Aowa' },
  settings: { en: 'Settings', nso: 'Dipeakanyo' },
  home: { en: 'Home', nso: 'Gae' },
  welcome: { en: 'Welcome', nso: 'O amogetšwe' },
};

export function t(key: keyof typeof dict, lang: Lang): string {
  const entry = dict[key];
  return entry ? entry[lang] : String(key);
}

export function formatFare(amount: number): string {
  return `R${amount.toFixed(0)}`;
}
