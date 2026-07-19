import React, { useState, useEffect, useCallback } from 'react';
import InteractiveMap from './components/InteractiveMap';

const API_BASE = "http://127.0.0.1:8000/api";

const HOSPITAL_ZONES = {
  "Zone_A_General_Hospital": { lat: 8.5241, lon: 76.9366, label: "General Hospital" },
  "Zone_B_Medical_College": { lat: 8.5470, lon: 76.9012, label: "Medical College" },
  "Zone_C_City_Hospital": { lat: 8.4855, lon: 76.9540, label: "City Hospital" },
  "Zone_D_Cottage_Hospital": { lat: 8.5601, lon: 76.8800, label: "Cottage Hospital" },
  "Zone_E_Community_Clinic": { lat: 8.5000, lon: 76.9700, label: "Community Clinic" },
};

const BLOOD_GROUPS = ["O+", "O-", "A+", "A-", "B+", "B-", "AB+", "AB-"];

export default function App() {
  // Navigation tabs
  const [activeTab, setActiveTab] = useState('dashboard');
  
  // Search parameters
  const [selectedHospital, setSelectedHospital] = useState('Zone_A_General_Hospital');
  const [searchLat, setSearchLat] = useState(HOSPITAL_ZONES.Zone_A_General_Hospital.lat);
  const [searchLon, setSearchLon] = useState(HOSPITAL_ZONES.Zone_A_General_Hospital.lon);
  const [bloodGroup, setBloodGroup] = useState('O-');
  const [maxDistanceKm, setMaxDistanceKm] = useState(50);
  
  // UI preferences (toggles map view to keep UI simple)
  const [showMap, setShowMap] = useState(false);

  // Search results & API loading
  const [donors, setDonors] = useState([]);
  const [selectedDonorId, setSelectedDonorId] = useState(null);
  const [loadingDonors, setLoadingDonors] = useState(false);
  const [searchError, setSearchError] = useState(null);

  // General dashboard stats
  const [stats, setStats] = useState({
    total_donors: 0,
    eligible_donors: 0,
    blood_group_counts: {},
    availability_counts: {},
    cluster_counts: {},
    model_metrics: { baseline_lr: {}, random_forest: {} },
    raw_report: ""
  });
  const [loadingStats, setLoadingStats] = useState(true);

  // Outreach selection & Simulation
  const [selectedForOutreach, setSelectedForOutreach] = useState(new Set());
  const [isSimulating, setIsSimulating] = useState(false);
  const [simulationLogs, setSimulationLogs] = useState([]);
  const [simulationResults, setSimulationResults] = useState(null);

  // Model Playground state
  const [playgroundInput, setPlaygroundInput] = useState({
    age: 32,
    gender: 'Male',
    blood_group: 'O+',
    zone: 'Zone_A_General_Hospital',
    availability_status: 'Available',
    total_donations: 4,
    days_since_last_donation: 120,
    donation_frequency_days: 90,
    eligible_to_donate: true,
    geo_cluster: 0
  });
  const [playgroundProb, setPlaygroundProb] = useState(null);
  const [loadingPlayground, setLoadingPlayground] = useState(false);

  // Fetch stats from backend
  const fetchStats = useCallback(async () => {
    setLoadingStats(true);
    try {
      const res = await fetch(`${API_BASE}/stats/`);
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (e) {
      console.error("Error fetching statistics:", e);
    } finally {
      setLoadingStats(false);
    }
  }, []);

  // Run donor search query
  const performSearch = useCallback(async () => {
    setLoadingDonors(true);
    setSearchError(null);
    try {
      const res = await fetch(
        `${API_BASE}/search/?latitude=${searchLat}&longitude=${searchLon}&blood_group=${encodeURIComponent(bloodGroup)}&weight_distance=0.5&weight_response=0.5&max_distance_km=${maxDistanceKm}`
      );
      if (res.ok) {
        const data = await res.json();
        setDonors(data.donors || []);
        // Pre-select top 5 donors
        const top5Ids = (data.donors || [])
          .slice(0, 5)
          .filter(d => d.donor.eligible_to_donate && d.donor.availability_status !== 'Not Available')
          .map(d => d.donor.donor_id);
        setSelectedForOutreach(new Set(top5Ids));
      } else {
        const err = await res.json();
        setSearchError(err.error || "Search request failed.");
      }
    } catch (e) {
      setSearchError("Unable to connect to Django API. Make sure backend is running.");
    } finally {
      setLoadingDonors(false);
    }
  }, [searchLat, searchLon, bloodGroup, maxDistanceKm]);

  // Initial load
  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  // Automatically search when parameters change
  useEffect(() => {
    performSearch();
  }, [performSearch]);

  // Update Lat/Lon when preset hospital changes
  const handleHospitalPresetChange = (presetName) => {
    setSelectedHospital(presetName);
    if (HOSPITAL_ZONES[presetName]) {
      const { lat, lon } = HOSPITAL_ZONES[presetName];
      setSearchLat(lat);
      setSearchLon(lon);
    }
  };

  // Toggle donor selection for outreach
  const toggleOutreachSelection = (id) => {
    const updated = new Set(selectedForOutreach);
    if (updated.has(id)) {
      updated.delete(id);
    } else {
      updated.add(id);
    }
    setSelectedForOutreach(updated);
  };

  // Select/Deselect all eligible and available search results
  const toggleAllOutreach = () => {
    const validDonors = donors.filter(d => d.donor.eligible_to_donate && d.donor.availability_status !== 'Not Available');
    const allSelected = validDonors.every(d => selectedForOutreach.has(d.donor.donor_id));
    
    if (allSelected) {
      setSelectedForOutreach(new Set());
    } else {
      const newSet = new Set(validDonors.map(d => d.donor.donor_id));
      setSelectedForOutreach(newSet);
    }
  };

  // Execute emergency broadcast simulation
  const startBroadcastSimulation = async () => {
    if (selectedForOutreach.size === 0) return;
    
    setIsSimulating(true);
    setSimulationResults(null);
    setSimulationLogs(["Connecting to emergency gateway..."]);
    setActiveTab('simulation');

    try {
      const res = await fetch(`${API_BASE}/broadcast/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ donor_ids: Array.from(selectedForOutreach) })
      });

      if (res.ok) {
        const data = await res.json();
        
        let currentSec = 2;
        const interval = setInterval(() => {
          if (currentSec > 10) {
            clearInterval(interval);
            
            const logs = [
              `Gateway active. Dispatching emergency alerts to ${selectedForOutreach.size} ranked donors...`,
              `Targeting group ${bloodGroup} near search center coordinates.`
            ];

            data.outcomes.forEach((out) => {
              if (out.outcome === "Accepted") {
                logs.push(`✔ RESPONDED: ${out.name} (+91 ${out.phone_number.slice(0,3)}***) - ACCEPTED (Expected response: ${out.response_time_sec}s)`);
              } else {
                logs.push(`✖ NO RESPONSE: ${out.name} (+91 ${out.phone_number.slice(0,3)}***) - TIMEOUT`);
              }
            });

            setSimulationLogs(logs);
            setSimulationResults(data);
            setIsSimulating(false);
          } else {
            setSimulationLogs(prev => [
              ...prev, 
              `Outreach gateway dispatching request signals (attempt ${currentSec / 2})...`
            ]);
            currentSec += 2;
          }
        }, 200);

      } else {
        setSimulationLogs(prev => [...prev, "✖ Gateway error. Dispatch failed."]);
        setIsSimulating(false);
      }
    } catch (e) {
      setSimulationLogs(prev => [...prev, "✖ Network error. Cannot contact simulation backend."]);
      setIsSimulating(false);
    }
  };

  // Run model playground prediction
  const runPlaygroundPrediction = async (e) => {
    if (e) e.preventDefault();
    setLoadingPlayground(true);
    try {
      const res = await fetch(`${API_BASE}/predict/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(playgroundInput)
      });
      if (res.ok) {
        const data = await res.json();
        setPlaygroundProb(data.probability);
      }
    } catch (err) {
      console.error("Playground error:", err);
    } finally {
      setLoadingPlayground(false);
    }
  };

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '1rem 1.5rem' }}>
      
      {/* Simple Modern Header (Light Theme style) */}
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.75rem', marginBottom: '1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#e11d48" style={{ width: '1.25rem', height: '1.25rem' }}>
            <path d="M11.645 20.91l-.007-.003-.022-.012a15.247 15.247 0 01-.383-.218 25.18 25.18 0 01-4.244-3.17C4.688 15.36 2.25 12.174 2.25 8.2 2.25 5.322 4.714 3 7.688 3A5.5 5.5 0 0112 5.052 5.5 5.5 0 0116.313 3c2.973 0 5.437 2.322 5.437 5.2 0 3.971-2.42 7.144-4.766 9.51a25.176 25.176 0 01-4.244 3.17 15.247 15.247 0 01-.383.219l-.022.012-.007.004-.003.001a.752.752 0 01-.704 0l-.003-.001z" />
          </svg>
          <div>
            <h1 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              LifeLine <span style={{ fontSize: '0.7rem', backgroundColor: '#ffe4e6', border: '1px solid #fecdd3', color: '#e11d48', padding: '0.1rem 0.4rem', borderRadius: '4px', fontWeight: 700 }}>Registry</span>
            </h1>
            <p style={{ fontSize: '0.75rem', color: '#64748b', margin: 0 }}>
              Emergency Blood Donor Search & Outreach
            </p>
          </div>
        </div>

        {/* Clean minimal aggregate metrics */}
        <div style={{ display: 'flex', gap: '1.5rem', fontSize: '0.8rem', fontWeight: 600, color: '#475569' }}>
          <div>
            <span style={{ fontSize: '0.7rem', color: '#94a3b8', display: 'block', fontWeight: 550 }}>Total Pool</span>
            <span>{loadingStats ? "..." : stats.total_donors.toLocaleString()}</span>
          </div>
          <div>
            <span style={{ fontSize: '0.7rem', color: '#94a3b8', display: 'block', fontWeight: 550 }}>Eligible</span>
            <span style={{ color: '#10b981' }}>{loadingStats ? "..." : stats.eligible_donors.toLocaleString()}</span>
          </div>
          <div>
            <span style={{ fontSize: '0.7rem', color: '#94a3b8', display: 'block', fontWeight: 550 }}>Accuracy</span>
            <span style={{ color: '#0093e9' }}>72.2%</span>
          </div>
        </div>

        {/* Nav tabs */}
        <nav style={{ display: 'flex', gap: '0.5rem' }}>
          <button onClick={() => setActiveTab('dashboard')} className={`tab-btn ${activeTab === 'dashboard' ? 'active' : ''}`}>Dashboard</button>
          <button onClick={() => setActiveTab('simulation')} className={`tab-btn ${activeTab === 'simulation' ? 'active' : ''}`}>Outreach</button>
          <button onClick={() => setActiveTab('insights')} className={`tab-btn ${activeTab === 'insights' ? 'active' : ''}`}>Models</button>
        </nav>
      </header>

      {/* Main body content */}
      <main>
        {activeTab === 'dashboard' && (
          <div style={{ display: 'grid', gridTemplateColumns: '35% 63%', gap: '2%' }}>
            
            {/* Left column - clean search settings */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="card-panel">
                <h3 style={{ fontSize: '0.85rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#334155', marginBottom: '0.75rem' }}>
                  Search Settings
                </h3>

                <div style={{ marginBottom: '0.75rem' }}>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#475569', marginBottom: '0.25rem' }}>Location preset</label>
                  <select 
                    value={selectedHospital}
                    onChange={(e) => handleHospitalPresetChange(e.target.value)}
                    className="select-input"
                  >
                    {Object.entries(HOSPITAL_ZONES).map(([key, zone]) => (
                      <option key={key} value={key}>{zone.label}</option>
                    ))}
                    <option value="custom">Custom GPS Coordinate</option>
                  </select>
                </div>

                <div style={{ marginBottom: '0.75rem' }}>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#475569', marginBottom: '0.25rem' }}>Target Blood group</label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.25rem' }}>
                    {BLOOD_GROUPS.map(bg => (
                      <button
                        key={bg}
                        type="button"
                        onClick={() => setBloodGroup(bg)}
                        className={`pill-btn ${bloodGroup === bg ? 'active' : ''}`}
                      >
                        {bg}
                      </button>
                    ))}
                  </div>
                </div>

                <div style={{ marginBottom: '0.75rem', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', padding: '0.5rem', borderRadius: '6px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', fontWeight: 600, color: '#475569', marginBottom: '0.25rem' }}>
                    <span>📍 Maximum Distance</span>
                    <span style={{ color: '#0f172a' }}>{maxDistanceKm} km</span>
                  </div>
                  <input 
                    type="range"
                    min="1"
                    max="100"
                    value={maxDistanceKm}
                    onChange={(e) => setMaxDistanceKm(parseInt(e.target.value))}
                    className="slider-control"
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', color: '#94a3b8', marginTop: '0.2rem' }}>
                    <span>1 km</span>
                    <span>100 km</span>
                  </div>
                </div>

                {/* Toggle Map Checkbox */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem' }}>
                  <input 
                    type="checkbox"
                    checked={showMap}
                    onChange={(e) => setShowMap(e.target.checked)}
                    id="toggle_map_view"
                    style={{ width: '0.9rem', height: '0.9rem', cursor: 'pointer' }}
                  />
                  <label htmlFor="toggle_map_view" style={{ fontSize: '0.75rem', fontWeight: 600, color: '#475569', cursor: 'pointer' }}>
                    Show Geolocation Map Visualizer
                  </label>
                </div>
              </div>

              {/* Toggleable Clean Map (Keeps UI extremely simple when hidden!) */}
              {showMap && (
                <div className="card-panel" style={{ minHeight: '340px' }}>
                  <InteractiveMap 
                    searchLat={searchLat}
                    searchLon={searchLon}
                    onLocationChange={(lat, lon) => {
                      setSelectedHospital('custom');
                      setSearchLat(lat);
                      setSearchLon(lon);
                    }}
                    donors={donors}
                    selectedDonorId={selectedDonorId}
                    onSelectDonor={(id) => {
                      setSelectedDonorId(id);
                      const el = document.getElementById(`donor-row-${id}`);
                      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }}
                  />
                </div>
              )}
            </div>

            {/* Right column - clean datagrid list of matches */}
            <div className="card-panel" style={{ minHeight: '440px', display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', paddingBottom: '0.5rem', borderBottom: '1px solid #e2e8f0' }}>
                <h3 style={{ fontSize: '0.85rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#334155' }}>
                  Compatible Shortlist ({donors.length} found)
                </h3>
                {donors.length > 0 && (
                  <button 
                    onClick={toggleAllOutreach}
                    style={{ fontSize: '0.75rem', color: '#e11d48', background: 'none', border: 'none', fontWeight: 700, cursor: 'pointer' }}
                  >
                    {donors.filter(d => d.donor.eligible_to_donate && d.donor.availability_status !== 'Not Available').every(d => selectedForOutreach.has(d.donor.donor_id)) 
                      ? "Deselect All" 
                      : "Select All Eligible"
                    }
                  </button>
                )}
              </div>

              {searchError && (
                <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecdd3', color: '#991b1b', padding: '0.5rem', borderRadius: '6px', fontSize: '0.75rem', marginBottom: '0.75rem' }}>
                  {searchError}
                </div>
              )}

              {/* Clean table headers */}
              <div style={{ overflowX: 'auto', flexGrow: 1 }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th style={{ width: '30px' }}>Sel</th>
                      <th>Donor Name</th>
                      <th>Distance</th>
                      <th>Contact details</th>
                      <th>Eligibility</th>
                      <th style={{ textAlignment: 'right' }}>Response Chance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loadingDonors ? (
                      <tr>
                        <td colSpan="6" style={{ textAlign: 'center', padding: '2rem', color: '#94a3b8', fontWeight: 550 }}>
                          Fetching compatible donors...
                        </td>
                      </tr>
                    ) : donors.length === 0 ? (
                      <tr>
                        <td colSpan="6" style={{ textAlign: 'center', padding: '2rem', color: '#94a3b8' }}>
                          No compatible donors found. Try changing blood group.
                        </td>
                      </tr>
                    ) : (
                      donors.map((item) => {
                        const isSelected = item.donor.donor_id === selectedDonorId;
                        const canContact = item.donor.eligible_to_donate && item.donor.availability_status !== 'Not Available';
                        const isChecked = selectedForOutreach.has(item.donor.donor_id);
                        
                        return (
                          <tr 
                            key={item.donor.donor_id}
                            id={`donor-row-${item.donor.donor_id}`}
                            onClick={() => setSelectedDonorId(item.donor.donor_id)}
                            className={`${isSelected ? 'selected' : ''}`}
                            style={{ opacity: canContact ? 1.0 : 0.45, cursor: 'pointer' }}
                          >
                            <td onClick={(e) => e.stopPropagation()}>
                              <input 
                                type="checkbox"
                                disabled={!canContact}
                                checked={isChecked}
                                onChange={() => toggleOutreachSelection(item.donor.donor_id)}
                                style={{ cursor: canContact ? 'pointer' : 'not-allowed' }}
                              />
                            </td>
                            <td>
                              <span style={{ fontWeight: 700, color: '#1e293b' }}>{item.donor.name}</span>
                              <span style={{ fontSize: '0.7rem', color: '#94a3b8', marginLeft: '0.4rem', fontFamily: 'monospace' }}>
                                {item.donor.donor_id}
                              </span>
                            </td>
                            <td style={{ fontWeight: 600, color: '#475569' }}>
                              {item.distance_km.toFixed(1)} km
                            </td>
                            <td onClick={(e) => e.stopPropagation()}>
                              <a href={`tel:${item.donor.phone_number}`} style={{ color: '#0093e9', textDecoration: 'none', fontWeight: 650, display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}>
                                📞 {item.donor.phone_number}
                              </a>
                            </td>
                            <td>
                              <span style={{ 
                                fontSize: '0.7rem', 
                                fontWeight: 700, 
                                padding: '0.1rem 0.4rem', 
                                borderRadius: '4px',
                                backgroundColor: item.donor.eligible_to_donate ? '#ecfdf5' : '#fef2f2',
                                color: item.donor.eligible_to_donate ? '#059669' : '#dc2626'
                              }}>
                                {item.donor.eligible_to_donate ? "Eligible" : "Ineligible"}
                              </span>
                            </td>
                            <td style={{ textAlign: 'right', fontWeight: 750, color: item.response_probability >= 0.75 ? '#059669' : item.response_probability >= 0.5 ? '#d97706' : '#dc2626' }}>
                              {(item.response_probability * 100).toFixed(0)}%
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Outreach Simulation Bar */}
              {selectedForOutreach.size > 0 && (
                <div style={{ marginTop: '0.75rem', borderTop: '1px solid #e2e8f0', paddingTop: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 650 }}>
                    Selected queue: <strong>{selectedForOutreach.size}</strong> donor{selectedForOutreach.size > 1 ? 's' : ''}
                  </span>
                  <button onClick={startBroadcastSimulation} className="btn-primary">
                    Alert Selected Donors
                  </button>
                </div>
              )}
            </div>

          </div>
        )}

        {activeTab === 'simulation' && (
          <div className="card-panel" style={{ maxWidth: '650px', margin: '0 auto' }}>
            <h3 style={{ fontSize: '0.95rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#0f172a', marginBottom: '0.25rem' }}>
              Outreach Simulator Gateway
            </h3>
            <p style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '1rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.5rem' }}>
              Aggregates response states for SMS dispatches based on ML predictor outputs.
            </p>

            {selectedForOutreach.size === 0 ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: '#94a3b8' }}>
                No donors selected. Go to Dashboard to build queue.
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1rem' }}>
                <div>
                  <h4 style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569', marginBottom: '0.4rem' }}>Live dispatch logs</h4>
                  <div style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', padding: '0.75rem', borderRadius: '6px', height: '180px', overflowY: 'auto', fontFamily: 'monospace', fontSize: '0.75rem', color: '#334155', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    {simulationLogs.map((log, idx) => (
                      <div key={idx} style={{ color: log.includes('✖') ? '#b91c1c' : log.includes('✔') ? '#047857' : '#334155' }}>
                        {log}
                      </div>
                    ))}
                    {isSimulating && <div style={{ color: '#94a3b8', fontStyle: 'italic' }}>Awaiting callbacks...</div>}
                  </div>
                </div>

                {simulationResults && (
                  <div style={{ backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', padding: '1rem', borderRadius: '6px', color: '#166534', fontSize: '0.8rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-around', fontWeight: 700 }}>
                      <div>Dispatched: {simulationResults.contacted_count}</div>
                      <div>Responded: {simulationResults.accepted_count}</div>
                      <div>Conversion: {Math.round((simulationResults.accepted_count / simulationResults.contacted_count) * 100)}%</div>
                    </div>
                  </div>
                )}

                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                  <button onClick={startBroadcastSimulation} disabled={isSimulating} className="btn-primary" style={{ flexGrow: 1 }}>
                    {isSimulating ? "Dispatching SMS..." : "Alert Donors"}
                  </button>
                  <button onClick={() => setActiveTab('dashboard')} className="pill-btn" style={{ fontWeight: 700 }}>
                    Return to Dashboard
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'insights' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxWidth: '900px', margin: '0 auto' }}>
            
            {/* Table metrics and report */}
            <div style={{ display: 'grid', gridTemplateColumns: '50% 48%', gap: '2%' }}>
              
              <div className="card-panel">
                <h3 style={{ fontSize: '0.85rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#334155', marginBottom: '0.5rem' }}>
                  Model Accuracy Report
                </h3>
                {stats.raw_report ? (
                  <pre style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', p: '0.5rem', borderRadius: '6px', fontFamily: 'monospace', fontSize: '0.65rem', color: '#475569', overflowX: 'auto', maxHeight: '150px', padding: '0.5rem' }}>
                    {stats.raw_report}
                  </pre>
                ) : (
                  <div style={{ color: '#94a3b8', fontSize: '0.8rem' }}>Loading report...</div>
                )}
              </div>

              <div className="card-panel">
                <h3 style={{ fontSize: '0.85rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#334155', marginBottom: '0.5rem' }}>
                  Classifier metrics
                </h3>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Metric</th>
                      <th>Baseline (LR)</th>
                      <th>Random Forest</th>
                    </tr>
                  </thead>
                  <tbody style={{ fontFamily: 'monospace' }}>
                    <tr>
                      <td style={{ fontFamily: 'sans-serif', fontWeight: 700 }}>Accuracy</td>
                      <td>{stats.model_metrics.baseline_lr.accuracy ?? "0.713"}</td>
                      <td style={{ color: '#e11d48', fontWeight: 750 }}>{stats.model_metrics.random_forest.accuracy ?? "0.718"}</td>
                    </tr>
                    <tr>
                      <td style={{ fontFamily: 'sans-serif', fontWeight: 700 }}>Recall</td>
                      <td>{stats.model_metrics.baseline_lr.recall ?? "0.947"}</td>
                      <td style={{ color: '#e11d48', fontWeight: 750 }}>{stats.model_metrics.random_forest.recall ?? "0.922"}</td>
                    </tr>
                    <tr>
                      <td style={{ fontFamily: 'sans-serif', fontWeight: 700 }}>F1-Score</td>
                      <td>{stats.model_metrics.baseline_lr['f1-score'] ?? "0.823"}</td>
                      <td style={{ color: '#e11d48', fontWeight: 750 }}>{stats.model_metrics.random_forest['f1-score'] ?? "0.822"}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

            </div>

            {/* Model playground form and plots */}
            <div style={{ display: 'grid', gridTemplateColumns: '40% 58%', gap: '2%' }}>
              
              {/* Simple playground form */}
              <div className="card-panel">
                <h3 style={{ fontSize: '0.85rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#334155', marginBottom: '0.5rem' }}>
                  Inference Sandbox
                </h3>
                <form onSubmit={runPlaygroundPrediction} style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', fontSize: '0.75rem' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.25rem' }}>
                    <div>
                      <label style={{ display: 'block', marginBottom: '0.1rem', fontWeight: 650 }}>Age</label>
                      <input type="number" value={playgroundInput.age} onChange={e => setPlaygroundInput({...playgroundInput, age: parseInt(e.target.value)})} className="text-input" style={{ height: '22px' }} />
                    </div>
                    <div>
                      <label style={{ display: 'block', marginBottom: '0.1rem', fontWeight: 650 }}>Gender</label>
                      <select value={playgroundInput.gender} onChange={e => setPlaygroundInput({...playgroundInput, gender: e.target.value})} className="select-input" style={{ height: '22px', padding: '0 0.25rem' }}>
                        <option value="Male">Male</option>
                        <option value="Female">Female</option>
                      </select>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.25rem' }}>
                    <div>
                      <label style={{ display: 'block', marginBottom: '0.1rem', fontWeight: 650 }}>Availability</label>
                      <select value={playgroundInput.availability_status} onChange={e => setPlaygroundInput({...playgroundInput, availability_status: e.target.value})} className="select-input" style={{ height: '22px', padding: '0 0.25rem' }}>
                        <option value="Available">Available</option>
                        <option value="Not Available">Not Available</option>
                      </select>
                    </div>
                    <div>
                      <label style={{ display: 'block', marginBottom: '0.1rem', fontWeight: 650 }}>Total Don.</label>
                      <input type="number" value={playgroundInput.total_donations} onChange={e => setPlaygroundInput({...playgroundInput, total_donations: parseInt(e.target.value)})} className="text-input" style={{ height: '22px' }} />
                    </div>
                  </div>

                  <button type="submit" disabled={loadingPlayground} className="btn-primary" style={{ padding: '0.35rem', marginTop: '0.25rem', fontSize: '0.75rem' }}>
                    {loadingPlayground ? "Computing..." : "Run Predictor"}
                  </button>
                </form>

                {playgroundProb !== null && (
                  <div style={{ marginTop: '0.5rem', padding: '0.5rem', borderRadius: '4px', backgroundColor: '#ecfdf5', border: '1px solid #d1fae5', display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', fontWeight: 700 }}>
                    <span>Probability:</span>
                    <span style={{ color: '#059669' }}>{(playgroundProb * 100).toFixed(0)}%</span>
                  </div>
                )}
              </div>

              {/* Simple grid plots */}
              <div className="card-panel">
                <h3 style={{ fontSize: '0.85rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#334155', marginBottom: '0.5rem' }}>
                  Model Plots
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.25rem' }}>
                  <div>
                    <img src={`${API_BASE}/plots/feature_importance.png`} alt="Features" style={{ width: '100%', height: 'auto', border: '1px solid #cbd5e1', borderRadius: '4px' }} />
                  </div>
                  <div>
                    <img src={`${API_BASE}/plots/confusion_matrix.png`} alt="Matrix" style={{ width: '100%', height: 'auto', border: '1px solid #cbd5e1', borderRadius: '4px' }} />
                  </div>
                  <div>
                    <img src={`${API_BASE}/plots/geo_clusters_plot.png`} alt="Clusters" style={{ width: '100%', height: 'auto', border: '1px solid #cbd5e1', borderRadius: '4px' }} />
                  </div>
                  <div>
                    <img src={`${API_BASE}/plots/elbow_plot.png`} alt="Elbow" style={{ width: '100%', height: 'auto', border: '1px solid #cbd5e1', borderRadius: '4px' }} />
                  </div>
                </div>
              </div>

            </div>

          </div>
        )}
      </main>

      {/* Clean light footer */}
      <footer style={{ marginTop: '2rem', paddingTop: '0.5rem', borderTop: '1px solid #e2e8f0', textAlign: 'center', fontSize: '0.7rem', color: '#94a3b8' }}>
        © 2026 LifeLine Registry • Hospital Decision Gateway
      </footer>
    </div>
  );
}
