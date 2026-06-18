# Church Inventory Reservation System — Frontend

This is the complete React (Vite) frontend for the Church Inventory Reservation System. It allows church members (Requesters) to browse items and submit reservation requests, and inventory coordinators (Managers) to oversee requests, prepare items, and track item condition histories.

## Tech Stack
- **Framework**: React 19 (via Vite)
- **Routing**: React Router v6 for clean routing and role-based guards
- **API Client**: Axios with interceptors for token management and session expiration handling
- **Image Compression**: `browser-image-compression` for frontend photo resizing before upload
- **Styling**: Pure CSS Modules for scoped, performant layouts with an elegant Indigo & Amber church aesthetic
- **Typography**: Google Font "Inter"

## Key Features Implemented

### 🔓 Authentication
- **Register / Login**: Custom registration supporting different user roles (`requester` or `manager`) and phone contact information.
- **Route Protection**: Automated guards prevent unauthorized access:
  - `ProtectedRoute` ensures only logged-in users access requester views.
  - `ManagerRoute` guards administrator panels.

### 📅 Requester Views
- **Item Browser (`/`)**: Grid catalog showcasing active items with availability statuses. Features a date-time window picker to perform real-time queries.
- **Quantity Selector**: Limits request counts to available window capacities dynamically.
- **New Request Form (`/requests/new`)**: Summary review of selection, time window confirmation, purpose notes input, and conflict-check error notifications displaying overlapping booking details.
- **My Requests (`/requests`)**: Reservation status timeline with options to cancel pending orders.
- **Detailed Log (`/requests/:id`)**: Audit log containing details of the reservation, automatic rejection conflict breakdowns, and comment activity.

### 🛠️ Manager Views
- **Dashboard (`/manager`)**: Coordinate and filter all reservations by statuses: `approved`, `prepared`, `completed`, `cancelled`, and `rejected`.
- **Request Management (`/manager/requests/:id`)**: Move reservation stages forward (`approved` &rarr; `prepared` &rarr; `completed`) and read/reply to comments.
- **Condition Audit Form (`/manager/requests/:id/condition-report`)**: After items are returned, log return states (`good`, `damaged`, or `missing`) with optional assessment details.
- **Item Management (`/manager/items`)**: Complete CRUD suite for registration, editing quantities, uploading photos (under 300KB), and soft-deactivating items with instant undo options.
- **Condition History (`/manager/items/:id/history`)**: Audit trail tracking reports filed across all historic reservations for any inventory item.

### 💬 Discussion System
- **Comments Thread**: Real-time collaborative comment thread attached to every reservation request for direct communication between requesters and managers.

## Getting Started

### 1. Prerequisites
Ensure you have the Express backend server running on `http://localhost:5000`.

### 2. Environment Configuration
Create a `.env` file in the root of the `client/` folder:
```env
VITE_API_URL=http://localhost:5000
```

### 3. Installation
Install the project dependencies:
```bash
npm install
```

### 4. Running Locally
Run the Vite development server:
```bash
npm run dev
```

### 5. Production Build
Compile optimized static assets:
```bash
npm run build
```
