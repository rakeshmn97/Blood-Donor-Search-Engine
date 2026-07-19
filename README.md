# Blood Donor Emergency Search Engine 🩸🤖

A full-stack, AI-powered system designed to locate, score, and contact blood donors during medical emergencies. It combines **unsupervised K-Means clustering** (to partition donor geolocations into searchable hospital zones) with a **supervised Random Forest Classifier** (to predict a donor's response likelihood based on availability, eligibility, and past donation history).

---

## 🏗️ Project Architecture

The project consists of three main components:
1. **Machine Learning Pipeline (Root)**: Python scripts for generating synthetic datasets, training clustering and classification models, and saving plots.
2. **Backend Services (`/backend`)**: A Django REST Framework (DRF) server backed by SQLite. It exposes analytical, predictive, search, and simulation endpoints, and serves as an orchestration layer for the ML model.
3. **Frontend Dashboard (`/frontend`)**: A React dashboard powered by Vite and customized components. It visualizes donor locations on interactive maps, supports real-time query tuning, and features an ML playground for live testing.

```
├── backend/
│   ├── blood_donor_project/     # Django settings, ASGI/WSGI config, main router
│   ├── donors/                  # Django app for donor management & views
│   │   ├── management/commands/ # Custom manage.py scripts (load_donors.py)
│   │   ├── predictor.py         # Thread-safe ML model prediction loader
│   │   ├── models.py            # SQLite database models
│   │   ├── views.py             # API endpoints (Search, Stats, Broadcast, etc.)
│   │   └── urls.py              # Sub-router mapping for DRF
│   └── db.sqlite3               # SQLite database instance
├── frontend/
│   ├── src/                     # React application source code
│   │   ├── components/          # Reusable dashboard widgets & maps
│   │   ├── App.jsx              # Main dashboard view
│   │   └── index.css            # Custom CSS styles
│   ├── package.json             # Node.js dependencies
│   └── vite.config.js           # Vite configuration
├── blood_donor_dataset.csv      # Initial synthetic dataset
├── donor_dataset_with_clusters.csv # Post-KMeans clustered dataset
├── donor_response_model.pkl     # Exported scikit-learn models & preprocessors
├── generate_donor_dataset.py    # Synthetic donor generator script
├── train_donor_model.py         # Model training and plot exporter
├── model_report.txt             # ML pipeline evaluation metrics
├── *.png                        # Visualizations (Elbow, clusters, confusion matrix, features)
└── requirements.txt             # Root Python dependencies
```

---

## ⚡ Quick Start Guide

### Prerequisites
- **Python**: version 3.10 or higher
- **Node.js**: version 18 or higher (with `npm`)

---

### Step 1: Initialize the Machine Learning Models (Optional)
The project comes pre-packaged with generated datasets and a trained model (`donor_response_model.pkl`). If you wish to regenerate the data or retrain the models:

1. Install root dependencies:
   ```bash
   pip install -r requirements.txt
   ```
2. Generate synthetic data:
   ```bash
   python generate_donor_dataset.py
   ```
3. Train the K-Means and Random Forest models:
   ```bash
   python train_donor_model.py
   ```

*This will recreate `donor_dataset_with_clusters.csv`, update `donor_response_model.pkl`, and output diagnostic plots to the workspace.*

---

### Step 2: Set Up and Start the Django Backend

1. Navigate to the `backend` directory:
   ```bash
   cd backend
   ```
2. Create and activate a virtual environment:
   ```bash
   # On Windows
   python -m venv venv
   venv\Scripts\activate

   # On macOS/Linux
   python3 -m venv venv
   source venv/bin/activate
   ```
3. Install dependencies:
   ```bash
   pip install -r ../requirements.txt
   ```
4. Run migrations:
   ```bash
   python manage.py migrate
   ```
5. Import the clustered donor dataset into the SQLite database:
   ```bash
   python manage.py load_donors
   ```
6. Start the server:
   ```bash
   python manage.py runserver
   ```
The backend API will run on `http://127.0.0.1:8000/`.

---

### Step 3: Set Up and Start the React Frontend

1. Navigate to the `frontend` directory:
   ```bash
   cd ../frontend
   ```
2. Install node dependencies:
   ```bash
   npm install
   ```
3. Start the Vite development server:
   ```bash
   npm run dev
   ```
The dashboard interface will run on `http://localhost:5173/` (or another port indicated in your console).

---

## 📡 API Endpoints (Django REST Framework)

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| **GET** | `/api/donors/` | Standard CRUD listing for all donor records. Supports pagination and filtering. |
| **GET** | `/api/stats/` | Returns system stats (eligibility, blood distributions, zone breakdown) and extracts ML metrics directly from `model_report.txt`. |
| **GET** | `/api/search/` | Performs real-time distance calculation and predictive ranking based on query parameters. |
| **POST** | `/api/broadcast/` | Simulates sending emergency SMS/messages to list of `donor_ids`. Returns mock acceptance and response times. |
| **POST** | `/api/predict/` | Predicts response probability for a user-input mock donor. |
| **GET** | `/api/plots/<filename>/` | Serves visualization PNGs (`confusion_matrix.png`, `elbow_plot.png`, `feature_importance.png`, `geo_clusters_plot.png`). |

### Search Parameter Details
- Endpoint: `/api/search/?latitude={lat}&longitude={lon}&blood_group={group}&weight_distance={w_d}&weight_response={w_r}`
- **Distance Factor**: Computed using the Haversine formula on spherical coordinates, converted to a decay factor `1 / (1 + distance_km)`.
- **Response Probability**: Predicted using the trained Random Forest classifier.
- **Weights**: `weight_distance` and `weight_response` are normalized and combined for a composite score.
- **Penalties**: Applies strict penalty scaling if a donor is ineligible (0.05x), unavailable (0.05x), or temporarily unavailable (0.5x).

---

## 🧠 Machine Learning Details

### 1. Unsupervised Geo-Clustering (K-Means)
- **Features**: Latitude and Longitude.
- **Inertia Elbow Method**: Used to validate grouping. Since data points revolve around 5 primary regional hospital zones, \(K=5\) clusters are generated to categorize geographic regions:
  - Zone A: General Hospital
  - Zone B: Medical College
  - Zone C: City Hospital
  - Zone D: Cottage Hospital
  - Zone E: Community Clinic
- **Predictive Cluster matching**: A search coordinate's nearest cluster center is calculated using K-Means inference.

### 2. Supervised Emergency Response Prediction (Random Forest)
- **Target Variable**: `responded_last_emergency` (Binary: 1 = Responded, 0 = Ignored/No Response).
- **Features**: Age, Gender, Blood Group, Zone, Geo Cluster, Total Donations, Days Since Last Donation, Donation Frequency, Availability Status, Eligibility.
- **Model Choice**: Random Forest Classifier (tuned with grid search, `n_estimators=200`).
- **Baseline comparison**: Compares against Logistic Regression.
- **Key Metrics**:
  - Accuracy: **~71.8%**
  - Recall: **~92.2%** (Optimized for recall to ensure critical prospects are not missed)
  - F1-Score: **~0.82**
