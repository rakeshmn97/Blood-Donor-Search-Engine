"""
Blood Donor Emergency Search — ML Pipeline
============================================
Part 1 (Unsupervised): K-Means clustering on donor lat/long to form
                        searchable geographic zones near the hospital.
Part 2 (Supervised):   Classification model to predict whether a donor
                        is likely to respond to an emergency call
                        (target: responded_last_emergency).

Outputs:
  - /mnt/user-data/outputs/donor_dataset_with_clusters.csv
  - /mnt/user-data/outputs/geo_clusters_plot.png
  - /mnt/user-data/outputs/elbow_plot.png
  - /mnt/user-data/outputs/confusion_matrix.png
  - /mnt/user-data/outputs/feature_importance.png
  - /mnt/user-data/outputs/donor_response_model.pkl
  - /mnt/user-data/outputs/model_report.txt
"""

import pandas as pd
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import joblib

from sklearn.cluster import KMeans
from sklearn.preprocessing import StandardScaler, LabelEncoder
from sklearn.model_selection import train_test_split, GridSearchCV
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    classification_report, confusion_matrix, accuracy_score,
    roc_auc_score, precision_score, recall_score, f1_score
)

REPORT_LINES = []
def log(msg=""):
    print(msg)
    REPORT_LINES.append(str(msg))

# ==========================================================
# Load data
# ==========================================================
df = pd.read_csv("/mnt/user-data/outputs/blood_donor_dataset.csv")
log(f"Loaded dataset: {df.shape[0]} rows, {df.shape[1]} columns")

# ==========================================================
# PART 1 — UNSUPERVISED: Geographic clustering (K-Means)
# ==========================================================
log("\n" + "="*60)
log("PART 1: UNSUPERVISED LEARNING — Geo-clustering donors")
log("="*60)

geo_features = df[["latitude", "longitude"]].values

# Elbow method to justify number of clusters
inertias = []
k_range = range(2, 11)
for k in k_range:
    km = KMeans(n_clusters=k, random_state=42, n_init=10)
    km.fit(geo_features)
    inertias.append(km.inertia_)

plt.figure(figsize=(7, 5))
plt.plot(list(k_range), inertias, marker="o")
plt.xlabel("Number of clusters (k)")
plt.ylabel("Inertia")
plt.title("Elbow Method — Optimal Donor Zones")
plt.grid(alpha=0.3)
plt.tight_layout()
plt.savefig("/mnt/user-data/outputs/elbow_plot.png", dpi=150)
plt.close()

# We used 5 real hospital zones to generate the data, so k=5 is a sensible choice
K_GEO = 5
kmeans_geo = KMeans(n_clusters=K_GEO, random_state=42, n_init=10)
df["geo_cluster"] = kmeans_geo.fit_predict(geo_features)
log(f"\nFormed {K_GEO} geographic donor zones using K-Means.")
log(df.groupby("geo_cluster").size().rename("donor_count").to_string())

# Plot clusters
plt.figure(figsize=(8, 7))
colors = plt.cm.tab10(np.linspace(0, 1, K_GEO))
for c in range(K_GEO):
    subset = df[df["geo_cluster"] == c]
    plt.scatter(subset["longitude"], subset["latitude"], s=10, color=colors[c], label=f"Zone {c}")
centers = kmeans_geo.cluster_centers_
plt.scatter(centers[:, 1], centers[:, 0], s=250, c="black", marker="X", label="Cluster centers")
plt.xlabel("Longitude")
plt.ylabel("Latitude")
plt.title("Donor Geographic Clusters (K-Means)")
plt.legend(fontsize=8)
plt.tight_layout()
plt.savefig("/mnt/user-data/outputs/geo_clusters_plot.png", dpi=150)
plt.close()
log("Saved geo_clusters_plot.png and elbow_plot.png")

# ==========================================================
# PART 2 — SUPERVISED: Predict donor response likelihood
# ==========================================================
log("\n" + "="*60)
log("PART 2: SUPERVISED LEARNING — Predict emergency response")
log("="*60)

model_df = df.copy()

# Fill missing behavioral values (donors with 0 or 1 prior donations)
model_df["days_since_last_donation"] = model_df["days_since_last_donation"].fillna(9999)
model_df["donation_frequency_days"] = model_df["donation_frequency_days"].fillna(9999)

# Encode categoricals
le_gender = LabelEncoder()
le_blood = LabelEncoder()
le_zone = LabelEncoder()
le_avail = LabelEncoder()

model_df["gender_enc"] = le_gender.fit_transform(model_df["gender"])
model_df["blood_group_enc"] = le_blood.fit_transform(model_df["blood_group"])
model_df["zone_enc"] = le_zone.fit_transform(model_df["zone"])
model_df["availability_enc"] = le_avail.fit_transform(model_df["availability_status"])

feature_cols = [
    "age", "gender_enc", "blood_group_enc", "zone_enc", "geo_cluster",
    "total_donations", "days_since_last_donation", "donation_frequency_days",
    "availability_enc", "eligible_to_donate"
]
X = model_df[feature_cols]
y = model_df["responded_last_emergency"]

log(f"\nFeatures used: {feature_cols}")
log(f"Target distribution:\n{y.value_counts().to_string()}")

X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42, stratify=y
)

scaler = StandardScaler()
X_train_scaled = scaler.fit_transform(X_train)
X_test_scaled = scaler.transform(X_test)

# --- Model 1: Logistic Regression (baseline) ---
log_reg = LogisticRegression(max_iter=1000, random_state=42)
log_reg.fit(X_train_scaled, y_train)
lr_preds = log_reg.predict(X_test_scaled)
lr_proba = log_reg.predict_proba(X_test_scaled)[:, 1]

log("\n--- Logistic Regression (baseline) ---")
log(f"Accuracy:  {accuracy_score(y_test, lr_preds):.3f}")
log(f"Precision: {precision_score(y_test, lr_preds):.3f}")
log(f"Recall:    {recall_score(y_test, lr_preds):.3f}")
log(f"F1-score:  {f1_score(y_test, lr_preds):.3f}")
log(f"ROC-AUC:   {roc_auc_score(y_test, lr_proba):.3f}")

# --- Model 2: Random Forest (main model, with light grid search) ---
param_grid = {
    "n_estimators": [100, 200],
    "max_depth": [5, 8, None],
    "min_samples_leaf": [1, 3],
}
rf = RandomForestClassifier(random_state=42, class_weight="balanced")
grid = GridSearchCV(rf, param_grid, cv=5, scoring="f1", n_jobs=-1)
grid.fit(X_train, y_train)  # RF doesn't need scaling
best_rf = grid.best_estimator_

rf_preds = best_rf.predict(X_test)
rf_proba = best_rf.predict_proba(X_test)[:, 1]

log("\n--- Random Forest (tuned) ---")
log(f"Best params: {grid.best_params_}")
log(f"Accuracy:  {accuracy_score(y_test, rf_preds):.3f}")
log(f"Precision: {precision_score(y_test, rf_preds):.3f}")
log(f"Recall:    {recall_score(y_test, rf_preds):.3f}")
log(f"F1-score:  {f1_score(y_test, rf_preds):.3f}")
log(f"ROC-AUC:   {roc_auc_score(y_test, rf_proba):.3f}")
log("\nFull classification report (Random Forest):")
log(classification_report(y_test, rf_preds))

# Confusion matrix plot
cm = confusion_matrix(y_test, rf_preds)
plt.figure(figsize=(5, 4))
plt.imshow(cm, cmap="Blues")
plt.title("Confusion Matrix — Random Forest")
plt.xlabel("Predicted")
plt.ylabel("Actual")
plt.xticks([0, 1], ["No Response", "Responded"])
plt.yticks([0, 1], ["No Response", "Responded"])
for i in range(2):
    for j in range(2):
        plt.text(j, i, str(cm[i, j]), ha="center", va="center",
                  color="white" if cm[i, j] > cm.max()/2 else "black", fontsize=14)
plt.colorbar()
plt.tight_layout()
plt.savefig("/mnt/user-data/outputs/confusion_matrix.png", dpi=150)
plt.close()

# Feature importance plot
importances = pd.Series(best_rf.feature_importances_, index=feature_cols).sort_values()
plt.figure(figsize=(7, 5))
importances.plot(kind="barh", color="crimson")
plt.title("Feature Importance — Random Forest")
plt.xlabel("Importance")
plt.tight_layout()
plt.savefig("/mnt/user-data/outputs/feature_importance.png", dpi=150)
plt.close()

log("\nSaved confusion_matrix.png and feature_importance.png")

# ==========================================================
# Save artifacts
# ==========================================================
joblib.dump({
    "model": best_rf,
    "feature_cols": feature_cols,
    "label_encoders": {
        "gender": le_gender, "blood_group": le_blood,
        "zone": le_zone, "availability": le_avail
    },
    "geo_kmeans": kmeans_geo
}, "/mnt/user-data/outputs/donor_response_model.pkl")

df.to_csv("/mnt/user-data/outputs/donor_dataset_with_clusters.csv", index=False)

with open("/mnt/user-data/outputs/model_report.txt", "w") as f:
    f.write("\n".join(REPORT_LINES))

log("\nSaved donor_response_model.pkl, donor_dataset_with_clusters.csv, model_report.txt")
log("\nPIPELINE COMPLETE.")
