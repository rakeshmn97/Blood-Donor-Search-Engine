import React, { useRef } from 'react';

// Soft pastel cluster color palette
const CLUSTER_COLORS = [
  '#3b82f6', // soft blue
  '#ec4899', // soft pink
  '#10b981', // soft emerald
  '#f59e0b', // soft amber
  '#8b5cf6'  // soft violet
];

const HOSPITAL_ZONES = {
  "Zone_A_General_Hospital": { lat: 8.5241, lon: 76.9366, label: "General Hospital (A)" },
  "Zone_B_Medical_College": { lat: 8.5470, lon: 76.9012, label: "Medical College (B)" },
  "Zone_C_City_Hospital": { lat: 8.4855, lon: 76.9540, label: "City Hospital (C)" },
  "Zone_D_Cottage_Hospital": { lat: 8.5601, lon: 76.8800, label: "Cottage Hospital (D)" },
  "Zone_E_Community_Clinic": { lat: 8.5000, lon: 76.9700, label: "Community Clinic (E)" },
};

export default function InteractiveMap({ 
  searchLat, 
  searchLon, 
  onLocationChange, 
  donors = [], 
  selectedDonorId = null,
  onSelectDonor = () => {} 
}) {
  const svgRef = useRef(null);
  
  const latMin = 8.4600;
  const latMax = 8.5800;
  const lonMin = 76.8600;
  const lonMax = 76.9900;

  const width = 600;
  const height = 500;

  const getXY = (lat, lon) => {
    const x = ((lon - lonMin) / (lonMax - lonMin)) * width;
    const y = (1.0 - (lat - latMin) / (latMax - latMin)) * height;
    return { x, y };
  };

  const handleMapClick = (e) => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const clickX = ((e.clientX - rect.left) / rect.width) * width;
    const clickY = ((e.clientY - rect.top) / rect.height) * height;

    const lon = (clickX / width) * (lonMax - lonMin) + lonMin;
    const lat = (1.0 - (clickY / height)) * (latMax - latMin) + latMin;

    onLocationChange(parseFloat(lat.toFixed(5)), parseFloat(lon.toFixed(5)));
  };

  const centerXY = getXY(searchLat, searchLon);

  return (
    <div className="flex flex-col h-full">
      <div className="flex justify-between items-center mb-2">
        <h4 className="text-xs font-bold text-slate-700">Geospatial Zones Map</h4>
        <span className="text-[9px] font-mono bg-slate-100 border border-slate-200 text-slate-600 px-2 py-0.5 rounded">
          GPS: {searchLat.toFixed(4)}, {searchLon.toFixed(4)}
        </span>
      </div>

      <div className="relative border border-slate-200 rounded-lg overflow-hidden flex-grow flex items-center justify-center bg-slate-50">
        <svg 
          ref={svgRef}
          viewBox={`0 0 ${width} ${height}`} 
          className="w-full h-auto cursor-crosshair select-none"
          onClick={handleMapClick}
          style={{ background: '#f8fafc' }}
        >
          {/* Grid lines */}
          {Array.from({ length: 5 }).map((_, i) => {
            const y = (height / 6) * (i + 1);
            const x = (width / 6) * (i + 1);
            return (
              <React.Fragment key={i}>
                <line x1="0" y1={y} x2={width} y2={y} stroke="#e2e8f0" strokeWidth="0.8" />
                <line x1={x} y1="0" x2={x} y2={height} stroke="#e2e8f0" strokeWidth="0.8" />
              </React.Fragment>
            );
          })}

          {/* Dotted connection vectors */}
          {donors.slice(0, 10).map((item, idx) => {
            const donorLoc = getXY(item.donor.latitude, item.donor.longitude);
            const isSelected = item.donor.donor_id === selectedDonorId;
            const opacity = isSelected ? 0.7 : Math.max(0.05, 0.25 - idx * 0.03);
            return (
              <line 
                key={`line-${item.donor.donor_id}`}
                x1={centerXY.x} 
                y1={centerXY.y} 
                x2={donorLoc.x} 
                y2={donorLoc.y} 
                stroke={isSelected ? "#0093e9" : "#e11d48"}
                strokeWidth={isSelected ? 1.5 : 0.8}
                strokeDasharray="2,2"
                opacity={opacity}
              />
            );
          })}

          {/* Plot donors */}
          {donors.map((item) => {
            const donorLoc = getXY(item.donor.latitude, item.donor.longitude);
            const clusterId = item.donor.geo_cluster ?? 0;
            const color = CLUSTER_COLORS[clusterId % CLUSTER_COLORS.length];
            const isSelected = item.donor.donor_id === selectedDonorId;
            const radius = isSelected ? 7 : 3.5;
            
            return (
              <g 
                key={`donor-${item.donor.donor_id}`}
                style={{ cursor: 'pointer' }}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectDonor(item.donor.donor_id);
                }}
              >
                {isSelected && (
                  <circle 
                    cx={donorLoc.x} 
                    cy={donorLoc.y} 
                    r={radius + 3} 
                    fill="none" 
                    stroke="#0093e9" 
                    strokeWidth="1" 
                    opacity="0.8"
                  />
                )}
                <circle 
                  cx={donorLoc.x} 
                  cy={donorLoc.y} 
                  r={radius} 
                  fill={color} 
                  stroke={isSelected ? "#fff" : "rgba(255,255,255,0.8)"}
                  strokeWidth="0.8"
                  opacity={isSelected ? 1.0 : 0.65}
                >
                  <title>{`${item.donor.name} (Cluster ${clusterId})`}</title>
                </circle>
              </g>
            );
          })}

          {/* Hospital Anchor nodes */}
          {Object.entries(HOSPITAL_ZONES).map(([name, zone]) => {
            const zoneLoc = getXY(zone.lat, zone.lon);
            const isClose = Math.abs(zone.lat - searchLat) < 0.001 && Math.abs(zone.lon - searchLon) < 0.001;
            
            return (
              <g key={name} transform={`translate(${zoneLoc.x}, ${zoneLoc.y})`}>
                <circle 
                  r="10" 
                  fill="rgba(225, 29, 72, 0.08)" 
                  stroke="rgba(225, 29, 72, 0.3)" 
                  strokeWidth="1"
                />
                <circle r="3" fill="#e11d48" />
                <text 
                  y="-8" 
                  textAnchor="middle" 
                  fill="#475569" 
                  fontSize="7" 
                  fontWeight="bold"
                  style={{ pointerEvents: 'none', paintOrder: 'stroke', stroke: '#ffffff', strokeWidth: 2 }}
                >
                  {zone.label.replace(' Hospital', '').replace(' Medical', '')}
                </text>
              </g>
            );
          })}

          {/* User selected Target Anchor */}
          <g transform={`translate(${centerXY.x}, ${centerXY.y})`}>
            <circle 
              r="15" 
              fill="rgba(0, 147, 233, 0.06)" 
              stroke="#0093e9" 
              strokeWidth="1.2" 
              strokeDasharray="2,2"
            />
            <circle r="3" fill="#0093e9" />
          </g>
        </svg>

        {/* Minimalist Map Legend */}
        <div className="absolute bottom-2 left-2 bg-white/95 border border-slate-200 p-1.5 rounded text-[8px] flex flex-col gap-0.5 shadow-sm">
          {CLUSTER_COLORS.map((color, idx) => (
            <div key={idx} className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: color }}></span>
              <span className="text-slate-500">Zone {idx}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
