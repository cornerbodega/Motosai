# 🏍️ Motosai - Highway 101 Motorcycle Simulator

A realistic motorcycle physics simulator featuring California's Highway 101 from San Francisco to San Diego. Experience authentic motorcycle dynamics with custom physics, traffic AI, and low-poly 3D graphics.

## 🎮 Game Features

### Physics Engine
- **Realistic Motorcycle Dynamics**
  - Lean angles up to 45°
  - Counter-steering physics
  - Independent front/rear brakes
  - 6-speed transmission with clutch
  - Wheelie and stoppie mechanics
  - Tire grip model with slip simulation
  - Wind resistance and drafting

### Environment
- **Highway 101 Recreation**
  - ~500 miles from San Francisco to San Diego
  - Infinite scrolling highway system
  - Dynamic scenery generation
  - Low-poly aesthetic for performance
  - Day/night cycle (coming soon)

### Traffic System
- **Intelligent AI Vehicles**
  - 5 vehicle types (cars, SUVs, trucks, vans, sports cars)
  - Realistic lane changing behavior
  - Variable speeds (55-75 mph)
  - Lane splitting awareness
  - Working brake lights

### Controls
- **Desktop**
  - `W/↑` - Throttle
  - `S/↓` - Brake
  - `A/←` - Lean Left
  - `D/→` - Lean Right
  - `Q/E` - Gear Down/Up
  - `Shift` - Clutch
  - `Space` - Front Brake
  - `P` - Pause

- **Mobile** 📱
  - Virtual joystick for steering/leaning (left side)
  - Touch buttons for throttle and brake (right side)
  - Haptic feedback support
  - Optimized for mobile browsers
  - See [MOBILE_CONTROLS_GUIDE.md](MOBILE_CONTROLS_GUIDE.md) for details

## 🏗️ Architecture

- **Frontend**: Three.js + Custom Physics Engine + Vite
- **Backend**: Node.js + Express + Socket.io on Cloud Run
- **Hosting**: Google Cloud Storage (static) + Cloud Run (API)
- **CI/CD**: Google Cloud Build

## Local Development

### Server
```bash
cd server
npm install
npm run dev
```
Server runs on http://localhost:8080

### Client
```bash
cd client
npm install
npm run dev
```
Client runs on http://localhost:3000

## 🚀 Quick Start

### Prerequisites
- Node.js 20+
- npm or yarn
- Google Cloud SDK (for deployment)

### Installation
```bash
# Clone the repository
git clone https://github.com/yourusername/motosai.git
cd motosai

# Install server dependencies
cd server && npm install

# Install client dependencies
cd ../client && npm install
```

### Run Locally
```bash
# Terminal 1 - Start server
cd server && npm run dev

# Terminal 2 - Start client
cd client && npm run dev
```

Open http://localhost:3000 and click "🎮 Play Game"

## 🌐 Deployment

### Google Cloud Platform Setup

1. **Enable APIs**:
```bash
gcloud services enable \
    cloudbuild.googleapis.com \
    run.googleapis.com \
    artifactregistry.googleapis.com \
    storage.googleapis.com
```

2. **Create Resources**:
```bash
# Create storage bucket
gsutil mb gs://motosai-app
gsutil iam ch allUsers:objectViewer gs://motosai-app

# Create artifact registry
gcloud artifacts repositories create motosai-repo \
    --repository-format=docker \
    --location=us-central1
```

3. **Deploy**:
```bash
./deploy.sh
```

## 📁 Project Structure

```
motosai/
├── client/                 # Frontend application
│   ├── src/
│   │   ├── game/          # Game components
│   │   │   ├── MotosaiGame.js       # Main game loop
│   │   │   ├── Highway101.js        # Highway environment
│   │   │   └── TrafficSystem.js     # Traffic AI
│   │   ├── physics/       # Physics engine
│   │   │   └── MotorcyclePhysics.js # Custom physics
│   │   └── main.js        # Entry point
│   ├── game.html          # Game page
│   └── index.html         # Landing page
├── server/                # Backend API
│   ├── server.js          # Express + Socket.io server
│   └── Dockerfile         # Container configuration
├── cloudbuild.yaml        # CI/CD configuration
└── deploy.sh              # Deployment script
```

## 🎯 Roadmap

- [ ] Multiplayer support
- [ ] More motorcycle models
- [ ] Weather effects (fog, rain)
- [ ] Day/night cycle
- [ ] Leaderboards
- [ ] Mobile app (React Native)
- [ ] VR support
- [ ] Realistic sound effects
- [ ] California landmarks
- [ ] Traffic accidents/obstacles

## 🛠️ Technologies

- **Three.js** - 3D graphics rendering
- **Custom Physics Engine** - Realistic motorcycle dynamics
- **Node.js/Express** - Backend server
- **Socket.io** - Real-time communication
- **Vite** - Frontend build tool
- **Google Cloud Run** - Serverless backend
- **Google Cloud Storage** - Static hosting

## 📊 Performance

- Target: 60 FPS on modern browsers
- Mobile: 30+ FPS
- Low-poly graphics for optimization
- Efficient physics calculations
- Dynamic LOD system (planned)

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📝 License

MIT License - feel free to use this project for any purpose.

## 🙏 Acknowledgments

- California Highway 101 for inspiration
- Three.js community
- Motorcycle physics research papers

## 📧 Contact

For questions or suggestions, please open an issue on GitHub.

---

**Live Demo**: https://storage.googleapis.com/motosai-app/index.html