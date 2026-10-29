# 🏛️ CivicLense — AI-Powered Civic Issue Platform

> **Transforming municipal grievance reporting into an automated, transparent, and verified workflow — from a single photograph to verified resolution.**

---

## 📌 Project Overview

**CivicLense** is an intelligent civic issue detection and municipal management platform. It allows citizens to photograph public infrastructure issues (such as potholes, overflowing garbage bins, water leaks, or defaced walls) and automatically:

1. **Validates Authenticity & Relevance**: Employs an on-device AI gate to separate genuine public civic defects from non-civic photos (e.g., personal selfies, indoor rooms).
2. **Classifies & Scores**: Categorizes the issue across 10 municipal domains and 39 categories, calculating a calibrated severity score and resolution SLA.
3. **Routes to Department**: Maps GPS coordinates to municipal administrative wards and assigns work orders to the responsible department or contractor.
4. **Tracks Work to Closure**: Provides real-time status tracking, before-and-after photo verification, and citizen satisfaction ratings.

---

## 🌟 Key Features

* **🤖 Local AI Vision Pipeline**: 
  * **Model 0 (Civic Gate)**: High-speed binary classifier distinguishing public civic infrastructure from private/personal scenes.
  * **Hierarchical Classifier**: MobileNetV2 feature extractor and neural classification across municipal defect categories.
  * **Anti-Hallucination Guardrails**: Visually indeterminable attributes are handled through dynamic citizen follow-up questions.
* **📍 GIS & Geolocation**:
  * Captures live coordinates and resolves administrative wards and responsible field offices.
* **⚡ Severity & Dynamic SLAs**:
  * Deterministic SLA engine calculates turnaround targets (e.g., exposed live electrical wires $\le 4\text{ hours}$).
* **👥 Three Dedicated Portals**:
  * **Citizen App**: 1-minute issue reporting, map exploration, and status timeline.
  * **Field Officer Portal**: Job queues, navigation routes, and photo upload for completed repairs.
  * **Admin Command Centre**: City-wide heatmaps, cluster analytics, SLA breach alerts, and contractor performance metrics.

---

## 🛠️ Technology Stack

| Layer | Technologies |
| :--- | :--- |
| **Frontend** | React 18, Vite, React Router, CSS Variables / Modern Design System |
| **Backend API** | Node.js, Express, RESTful APIs, JWT Auth |
| **Database & Auth** | Supabase (PostgreSQL), Session Connection Pooler, Storage Buckets |
| **AI Microservice** | Python 3.10–3.12, TensorFlow / Keras, MobileNetV2, OpenCV, Flask |

---

## 🚀 How to Run the Project

### Option 1: 1-Click Launch (Recommended)
Double-click `Start_CivicLense.bat` on your Desktop, or run in your terminal:
```bash
.\run_all.bat
```
This automatically boots all three services and opens your browser to **http://localhost:5173**.

---

### Option 2: Step-by-Step in VS Code (3 Terminals)

1. **AI Model Microservice (Port 8000)**
   ```powershell
   cd model
   & "C:\Users\SNEHAL C THOMBARE\Desktop\civic-ai\venv\Scripts\python.exe" server.py
   ```

2. **Backend API Server (Port 4000)**
   ```powershell
   cd server
   npm run dev
   ```

3. **Frontend Dashboard (Port 5173)**
   ```powershell
   cd client
   npm run dev
   ```

4. **Open in Browser**:
   Navigate to **[http://localhost:5173](http://localhost:5173)**.

---

## 📁 Project Structure

```text
civiclense/
├── client/          # React + Vite citizen & administrative frontend
│   ├── src/pages/   # Public, Citizen, Officer, and Admin interfaces
│   └── src/lib/     # API connectors, authentication, and i18n
├── server/          # Node.js Express backend REST API
│   ├── src/routes/  # Complaints, clusters, zones, metrics, and officers
│   └── src/db/      # PostgreSQL pooler and schema migrations
├── model/           # Python AI microservice (Port 8000)
│   ├── modules/     # Quality check, civic gate, classifier, severity, GIS
│   ├── models/      # Trained neural networks (.keras) and centroids (.npy)
│   └── server.py    # Flask REST API endpoints
└── dataset/         # Curated municipal defect and non-civic training data
```

---

## 🔒 Privacy & Local Processing
All AI visual analysis runs locally on the microservice without streaming private images to third-party paid cloud AI APIs, ensuring citizen data privacy and zero API quota costs.
